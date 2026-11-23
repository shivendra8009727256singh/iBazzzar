// Request context and authorisation guards. Authorisation is always decided here or in services — never by the UI.
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DomainError, can, staffRoles, orgCan } from '../../../../packages/shared/src/index.js';
import { sha256 } from '../lib/security.js';

export const SESSION_COOKIE = 'ib_session';
export const SESSION_DAYS = 7;

export function cookieOptions(config) {
  return { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/', maxAge: SESSION_DAYS * 86_400_000 };
}

const STAFF_ORDER = ['ADMIN', 'OPERATIONS', 'FINANCE', 'SUPPORT'];

/** Loads the signed-in user (if any) with staff roles and memberships. Suspended accounts are treated as signed out. */
export function loadSession(prisma) {
  return async (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
      const session = await prisma.session.findUnique({
        where: { id: sha256(token) },
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
      if (session && session.expiresAt > new Date() && session.user.status === 'ACTIVE') {
        req.session = session;
        req.user = session.user;
        req.staffRoles = session.user.roles.map((r) => r.role).sort((a, b) => STAFF_ORDER.indexOf(a) - STAFF_ORDER.indexOf(b));
      }
    }
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
  if (!can(req.staffRoles, capability)) throw new DomainError('Your staff role doesn’t include this action. Ask a Super Admin if you need access.', 403);
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
    const origin = req.get('origin');
    if (origin !== config.origin) return res.status(403).json({ error: 'Request origin is not allowed' });
    next();
  };
}

export function limiter({ windowMs, limit, store }) {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, store, message: { error: 'Too many requests. Please wait a moment and try again.' } });
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
