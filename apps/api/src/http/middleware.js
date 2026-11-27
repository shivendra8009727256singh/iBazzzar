// Request context and authorisation guards. Authorisation is always decided here or in services — never by the UI.
import { timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DomainError, staffRoles, orgCan } from '../../../../packages/shared/src/index.js';
import { sha256 } from '../lib/security.js';
import { capabilitiesOf } from '../services/permissions.js';

export const SESSION_COOKIE = 'ib_session';
export const SESSION_DAYS = 7;
/** How often a session's "last active" time is refreshed. */
export const LAST_SEEN_EVERY_MS = 5 * 60_000;
/** Long-lived cookie that recognises a browser across sign-ins, for new-device alerts. Not a sign-in credential. */
export const DEVICE_COOKIE = 'ib_device';
export const DEVICE_COOKIE_DAYS = 395;

export function cookieOptions(config) {
  return { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/', maxAge: SESSION_DAYS * 86_400_000 };
}

/** Admin sessions are shorter than everyone else's. */
export const ADMIN_SESSION_HOURS = 12;

// Older builds set the cookie with Path=/api. Browsers send that one before the Path=/ cookie on /api requests,
// so clearing it on sign-in and sign-out (and accepting any valid token below) prevents "signed in, then 401" loops.
export const LEGACY_COOKIE_PATHS = ['/api'];

/** Every ib_session value the browser sent. cookie-parser keeps only the first, which may be a stale legacy cookie. */
export function sessionTokens(req) {
  const header = req.headers.cookie ?? '';
  const tokens = [];
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    const value = rest.join('=');
    if (name === SESSION_COOKIE && /^[a-f0-9]{64}$/.test(value) && !tokens.includes(value)) tokens.push(value);
  }
  return tokens.slice(0, 4);
}

const STAFF_ORDER = ['ADMIN', 'OPERATIONS', 'FINANCE', 'SUPPORT'];

/** Loads the signed-in user (if any) with staff roles and memberships. Suspended accounts are treated as signed out. */
export function loadSession(prisma) {
  return async (req, _res, next) => {
    const tokens = sessionTokens(req);
    if (tokens.length) {
      const sessions = await prisma.session.findMany({
        where: { id: { in: tokens.map(sha256) }, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          user: {
            include: {
              roles: true,
              orgMemberships: { include: { organization: { select: { id: true, legalName: true, tradeName: true, status: true } } } },
              sellerMemberships: { include: { store: { select: { id: true, name: true, slug: true, status: true } } } },
            },
          },
        },
      });
      const session = sessions[0];
      if (session && session.user.status === 'ACTIVE') {
        // "Last active" on the signed-in devices list. Written at most once per LAST_SEEN_EVERY_MS per session, and
        // never awaited, so it costs ordinary requests nothing.
        if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_EVERY_MS) {
          prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
        }
        req.session = session;
        req.user = session.user;
        req.staffRoles = session.user.roles.map((r) => r.role).sort((a, b) => STAFF_ORDER.indexOf(a) - STAFF_ORDER.indexOf(b));
      }
    }
    req.staffRoles ??= [];
    req.capabilities = await capabilitiesOf(prisma, req.staffRoles);
    req.can = (capability) => req.capabilities.includes(capability);
    next();
  };
}

/** The account as the browser sees it. Credentials and lock counters never leave the server. */
export function publicUser(user, session) {
  const roles = (user.roles ?? []).map((r) => r.role).sort((a, b) => STAFF_ORDER.indexOf(a) - STAFF_ORDER.indexOf(b));
  const organizations = (user.orgMemberships ?? []).map((m) => ({ id: m.organization.id, name: m.organization.tradeName || m.organization.legalName, status: m.organization.status, role: m.role }));
  const stores = (user.sellerMemberships ?? []).map((m) => ({ id: m.store.id, name: m.store.name, slug: m.store.slug, status: m.store.status, role: m.role }));
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt, marketingOptIn: user.marketingOptIn,
    staffRole: roles[0] ?? null, staffRoleLabel: roles[0] ? staffRoles[roles[0]].label : null, roles,
    organizations, stores,
    activeOrganizationId: session?.activeOrganizationId && organizations.some((o) => o.id === session.activeOrganizationId) ? session.activeOrganizationId : organizations[0]?.id ?? null,
    activeStoreId: session?.activeStoreId && stores.some((s) => s.id === session.activeStoreId) ? session.activeStoreId : stores[0]?.id ?? null,
  };
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new DomainError('Please sign in to continue', 401);
  next();
}

export const requireStaff = (capability) => (req, _res, next) => {
  if (!req.user) throw new DomainError('Please sign in to continue', 401);
  if (!req.can(capability)) throw new DomainError('Your staff role doesn’t include this action. Ask the Admin if you need access.', 403);
  next();
};

/** Resolves the store the user is working in. Pass { owner: true } for owner-only actions; { approved: false } to allow pending stores. */
export const requireSeller = ({ owner = false, approved = true } = {}) => (req, _res, next) => {
  if (!req.user) throw new DomainError('Please sign in to continue', 401);
  const memberships = req.user.sellerMemberships;
  if (!memberships.length) throw new DomainError('A seller account is required', 403);
  const wanted = req.get('x-store-id') || req.session.activeStoreId;
  const m = memberships.find((x) => x.storeId === wanted) ?? (memberships.length === 1 || !wanted ? memberships[0] : null);
  if (!m) throw new DomainError('Choose one of your stores', 403);
  if (approved && m.store.status !== 'APPROVED') {
    throw new DomainError(m.store.status === 'PENDING' ? 'Your seller application is awaiting approval' : 'This store isn’t active. Contact seller support.', 403);
  }
  if (owner && m.role !== 'OWNER') throw new DomainError('Only the store owner can manage this', 403);
  req.store = m.store;
  req.storeId = m.storeId;
  req.sellerRole = m.role;
  next();
};

/** Resolves the business account the user is buying for and checks the team permission. */
export const requireBusiness = (permission, { approved = false } = {}) => (req, _res, next) => {
  if (!req.user) throw new DomainError('Please sign in to continue', 401);
  const memberships = req.user.orgMemberships;
  if (!memberships.length) throw new DomainError('A business account is required', 403);
  const wanted = req.get('x-organization-id') || req.session.activeOrganizationId;
  const m = memberships.find((x) => x.organizationId === wanted) ?? (memberships.length === 1 || !wanted ? memberships[0] : null);
  if (!m) throw new DomainError('Choose one of your business accounts', 403);
  if (permission && !orgCan(m.role, permission)) throw new DomainError('Your role in this business account doesn’t allow this', 403);
  if (approved && m.organization.status !== 'APPROVED') throw new DomainError('Your business account is awaiting verification', 403);
  req.organizationId = m.organizationId;
  req.orgRole = m.role;
  next();
};

/** Rejects state-changing requests from other sites. Browsers always send Origin on cross-site POSTs. */
export function originCheck(config) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Server-to-server webhooks carry no Origin; they are authenticated by their HMAC signature instead.
    if (req.originalUrl.split('?')[0] === '/api/payments/webhook') return next();
    // Internal endpoints authenticate with the x-internal-key header, which a browser on another site can't send.
    if (req.originalUrl.startsWith('/api/internal/')) return next();
    const origin = req.get('origin');
    const allowed = config.allowedOrigins ?? [config.origin];
    if (!allowed.includes(origin)) {
      return res.status(403).json({ error: `This request came from a site address the server doesn’t recognise (${origin || 'unknown'}). Open the site at ${config.origin}.` });
    }
    next();
  };
}

export function limiter({ windowMs, limit, store, skip }) {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, store, skip, message: { error: 'Too many requests. Please wait a moment and try again.' } });
}

/** True when the request comes from our own web server (it knows INTERNAL_API_KEY). Constant-time comparison. */
export function isInternalRequest(req, key) {
  if (!key) return false;
  const given = Buffer.from(String(req.get('x-internal-key') ?? ''));
  const want = Buffer.from(key);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Central error handler: one readable sentence for people, plus a per-field map forms use to highlight inputs. */
export function errorHandler(logger) {
  return (error, req, res, _next) => {
    if (error instanceof z.ZodError) {
      const fields = {};
      for (const issue of error.issues) fields[issue.path.join('.')] ??= issue.message;
      const count = Object.keys(fields).length;
      return res.status(400).json({ error: count > 1 ? `Please check the ${count} highlighted fields.` : error.issues[0]?.message ?? 'Please check your details.', fields });
    }
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'We couldn’t read that request. Please refresh the page and try again.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large. Please use a smaller file.' });
    // Unique constraint races (e.g. two sign-ups with one email at the same moment) become a friendly conflict.
    if (error.code === 'P2002') return res.status(409).json({ error: 'This already exists. Please refresh and try again.' });
    if (error.code === 'P2025') return res.status(404).json({ error: 'That record no longer exists.' });
    const status = error instanceof DomainError || (error.status >= 400 && error.status < 600) ? error.status : 500;
    if (status >= 500) logger?.error({ err: error, path: req.path, method: req.method }, 'Request failed');
    res.status(status).json({
      error: status === 500 ? 'Something went wrong on our side. Please try again in a moment.' : error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    });
  };
}
