import { z } from 'zod';
import { DomainError, assertStateCode, panFromGstin, isStaffRole } from '../../../../packages/shared/src/index.js';
import {
  accountRegisterSchema, loginSchema, passwordChangeSchema, passwordResetSchema, contextSchema,
  businessProfileSchema, sellerProfileSchema,
} from '../../../../packages/validation/src/index.js';
import { hashPassword, verifyPassword, sha256, randomToken, DUMMY_HASH } from '../lib/security.js';
import { audit } from '../lib/audit.js';
import { slugify } from '../lib/http.js';
import { transaction } from '../lib/db.js';
import { emailHtml } from '../integrations/mailer.js';
import { notifyCustomer } from '../lib/email.js';
import { deviceName } from '../../../../packages/shared/src/index.js';
import {
  SESSION_COOKIE, SESSION_DAYS, ADMIN_SESSION_HOURS, LEGACY_COOKIE_PATHS, DEVICE_COOKIE, DEVICE_COOKIE_DAYS,
  cookieOptions, publicUser, requireAuth, sessionTokens,
} from '../http/middleware.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

const userInclude = {
  roles: true,
  orgMemberships: { include: { organization: { select: { id: true, legalName: true, tradeName: true, status: true } } } },
  sellerMemberships: { include: { store: { select: { id: true, name: true, slug: true, status: true } } } },
};

const taxFields = (p) => ({ businessType: p.businessType, gstRegistered: p.gstRegistered, gstin: p.gstin ?? null, pan: p.pan ?? (p.gstin ? panFromGstin(p.gstin) : null) });

export async function createOrganization(tx, userId, profile) {
  if (profile.gstin && await tx.organization.findUnique({ where: { gstin: profile.gstin } })) {
    throw new DomainError('This GSTIN is already registered. Ask the account owner to add you to their team.', 409);
  }
  assertStateCode(profile.address.state);
  const org = await tx.organization.create({
    data: {
      legalName: profile.legalName, tradeName: profile.tradeName || null, ...taxFields(profile), contactPhone: profile.contactPhone,
      registeredAddress: profile.address,
      members: { create: { userId, role: 'OWNER' } },
      approvalPolicy: { create: { thresholdPaise: 0 } },
    },
  });
  await audit(tx, { actorId: userId, action: 'organization.created', entityType: 'organization', entityId: org.id });
  return org;
}

export async function createStore(tx, userId, profile) {
  if (profile.gstin && await tx.sellerStore.findUnique({ where: { gstin: profile.gstin } })) {
    throw new DomainError('This GSTIN is already registered to a store. Ask the store owner to add you as staff.', 409);
  }
  const category = await tx.category.findFirst({ where: { name: profile.primaryCategory, active: true } });
  if (!category) throw new DomainError('Please choose one of the current categories', 400, { 'seller.primaryCategory': 'Please choose one of the current categories' });
  const stateCode = assertStateCode(profile.pickupAddress.state);
  let slug = slugify(profile.storeName) || 'store';
  if (await tx.sellerStore.findUnique({ where: { slug } })) slug = `${slug}-${randomToken(3)}`;
  const store = await tx.sellerStore.create({
    data: {
      slug, name: profile.storeName, description: profile.description, legalName: profile.legalName, ...taxFields(profile),
      contactPhone: profile.contactPhone, pickupAddress: profile.pickupAddress, stateCode, primaryCategoryId: category.id,
      termsAcceptedAt: new Date(),
      members: { create: { userId, role: 'OWNER' } },
      warehouses: { create: { name: 'Pickup address', address: profile.pickupAddress, pincode: profile.pickupAddress.pincode, isDefault: true } },
    },
  });
  await audit(tx, { actorId: userId, action: 'seller.applied', entityType: 'store', entityId: store.id });
  return store;
}

export function registerAuth(app, { prisma, config, mailer, limits }) {
  const clearLegacyCookies = (res) => {
    for (const path of LEGACY_COOKIE_PATHS) res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.production, path });
  };
  /**
   * Recognises this browser by its ib_device cookie (set here if missing). Returns the device id (hashed cookie) and
   * whether this account has signed in from it before. An account's very first device never counts as "new", so
   * accounts that existed before this feature don't all get an alert on their next sign-in.
   */
  const recogniseDevice = async (req, res, userId, userAgent) => {
    let token = req.cookies?.[DEVICE_COOKIE];
    if (!/^[a-f0-9]{64}$/.test(token ?? '')) token = randomToken();
    res.cookie(DEVICE_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/', maxAge: DEVICE_COOKIE_DAYS * 86_400_000 });
    const id = sha256(token);
    const now = new Date();
    const { count: added } = await prisma.knownDevice.createMany({ data: [{ userId, id, userAgent }], skipDuplicates: true });
    if (!added) {
      await prisma.knownDevice.update({ where: { userId_id: { userId, id } }, data: { lastSeenAt: now, userAgent } });
      return { deviceId: id, isNew: false };
    }
    // Browsers unused for over a year are forgotten, so the list can't grow without limit.
    await prisma.knownDevice.deleteMany({ where: { userId, lastSeenAt: { lt: new Date(now.getTime() - DEVICE_COOKIE_DAYS * 86_400_000) } } });
    const others = await prisma.knownDevice.count({ where: { userId, id: { not: id } } });
    return { deviceId: id, isNew: others > 0 };
  };

  /** In-app notification and email: "your account was signed in from Chrome on Windows". Never blocks the sign-in. */
  const alertNewDevice = async (req, userId, userAgent) => {
    try {
      const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      const device = deviceName(userAgent);
      await notifyCustomer(prisma, userId, {
        kind: 'security.new-sign-in',
        title: 'New sign-in to your account',
        subject: `New sign-in to your IBazzzar account from ${device}`,
        body: `Your account was just signed in from ${device} (${when} IST). If this was you, there’s nothing to do. If it wasn’t, change your password now — that signs out every other device — or sign that device out from Profile & security.`,
        lines: [`Device: ${device}`, `Time: ${when} IST`, ...(req.ip ? [`IP address: ${req.ip}`] : [])],
        link: '/account/profile#devices',
      });
    } catch (error) {
      req.log?.warn({ err: error }, 'New sign-in alert failed');
    }
  };

  const startSession = async (req, res, userId, { hours, alert = true } = {}) => {
    const token = randomToken();
    const ms = hours ? hours * 3_600_000 : SESSION_DAYS * 86_400_000;
    const userAgent = req.get('user-agent')?.slice(0, 300) ?? null;
    // Any session this browser already had is replaced, so a stale cookie can never shadow the new one.
    const previous = sessionTokens(req);
    if (previous.length) await prisma.session.deleteMany({ where: { id: { in: previous.map(sha256) } } });
    const { deviceId, isNew } = await recogniseDevice(req, res, userId, userAgent);
    await prisma.session.create({
      data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + ms), userAgent, ip: req.ip, deviceId },
    });
    if (isNew && alert) await alertNewDevice(req, userId, userAgent);
    clearLegacyCookies(res);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: ms });
  };

  /** Shared password check with per-account lockout. Unknown emails take the same time and get the same answer. */
  async function verifyCredentials(req, input) {
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { roles: true } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const until = user.lockedUntil.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      throw new DomainError(`Too many failed attempts. Try again after ${until} IST or reset your password.`, 429);
    }
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!valid || !user) {
      if (user) {
        const failed = user.failedLogins + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await prisma.user.update({ where: { id: user.id }, data: lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed } });
        if (lock) await audit(prisma, { actorId: user.id, action: 'user.locked', entityType: 'user', entityId: user.id, ip: req.ip });
      }
      throw new DomainError('Email or password is incorrect', 401);
    }
    if (user.status === 'SUSPENDED') throw new DomainError('This account has been suspended. Please contact IBazzzar support for help.', 403);
    if (user.failedLogins || user.lockedUntil) await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    return user;
  }
  const isAdmin = (user) => user.roles.some((r) => r.role === 'ADMIN');
  const me = async (userId, session) => publicUser(await prisma.user.findUnique({ where: { id: userId }, include: userInclude }), session);

  async function sendVerification(user) {
    if (!mailer.configured || user.emailVerifiedAt) return false;
    const token = randomToken();
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
      prisma.verificationToken.create({ data: { id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } }),
    ]);
    const url = `${config.origin}/verify-email?token=${token}`;
    await mailer.send({
      to: user.email, subject: 'Confirm your IBazzzar email',
      text: `Confirm your email within 24 hours: ${url}`,
      html: emailHtml({ heading: 'Confirm your email', body: 'Please confirm your email address so we can send you order updates. This link works for 24 hours.', actionLabel: 'Confirm email', actionUrl: url }),
    });
    return true;
  }

  app.post('/api/auth/register', limits.auth, async (req, res) => {
    const input = accountRegisterSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const user = await transaction(prisma, async (tx) => {
      if (await tx.user.findUnique({ where: { email: input.email } })) throw new DomainError('An account with this email already exists. Sign in instead.', 409, { email: 'This email is already registered' });
      if (await tx.user.findUnique({ where: { phone: input.phone } })) throw new DomainError('This mobile number is already linked to another account', 409, { phone: 'This mobile number is already registered' });
      const created = await tx.user.create({
        data: { name: input.name, email: input.email, phone: input.phone, passwordHash, marketingOptIn: input.marketingOptIn, termsAcceptedAt: new Date() },
      });
      // Registration never grants a staff role. The Admin is created only by scripts/create-admin.mjs.
      if (input.accountType === 'business') await createOrganization(tx, created.id, input.business);
      if (input.accountType === 'seller') await createStore(tx, created.id, input.seller);
      await audit(tx, { actorId: created.id, action: `user.registered.${input.accountType}`, entityType: 'user', entityId: created.id, ip: req.ip });
      return created;
    });
    await startSession(req, res, user.id, { alert: false });
    let verificationSent = false;
    try { verificationSent = await sendVerification(user); } catch (error) { req.log?.warn({ err: error }, 'Verification email failed'); }
    res.status(201).json({ user: await me(user.id), verificationSent });
  });

  /** Shoppers, business buyers, sellers and staff. The Admin must use the separate Admin sign-in. */
  app.post('/api/auth/login', limits.auth, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await verifyCredentials(req, input);
    if (isAdmin(user)) {
      await audit(prisma, { actorId: user.id, action: 'admin.wrong-portal', entityType: 'user', entityId: user.id, ip: req.ip });
      throw new DomainError('This account signs in from the Admin sign-in page.', 403);
    }
    await startSession(req, res, user.id);
    await audit(prisma, { actorId: user.id, action: 'user.signed-in', entityType: 'user', entityId: user.id, ip: req.ip });
    res.json({ user: await me(user.id) });
  });

  /** Admin only. Other accounts get the same answer as a wrong password, so the page reveals nothing. */
  app.post('/api/auth/admin/login', limits.adminLogin, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await verifyCredentials(req, input);
    if (!isAdmin(user)) {
      await audit(prisma, { actorId: user.id, action: 'admin.denied', entityType: 'user', entityId: user.id, ip: req.ip });
      throw new DomainError('Email or password is incorrect', 401);
    }
    await startSession(req, res, user.id, { hours: ADMIN_SESSION_HOURS });
    await audit(prisma, { actorId: user.id, action: 'admin.signed-in', entityType: 'user', entityId: user.id, ip: req.ip });
    res.json({ user: await me(user.id) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const tokens = sessionTokens(req);
    if (tokens.length) await prisma.session.deleteMany({ where: { id: { in: tokens.map(sha256) } } });
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(config), maxAge: undefined });
    clearLegacyCookies(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => res.json({ user: publicUser(req.user, req.session) }));
  // Same as /me but answers 200 with null when signed out, so a signed-out page load logs no errors in the browser.
  app.get('/api/auth/session', async (req, res) => res.json({ user: req.user ? publicUser(req.user, req.session) : null }));

  /** Switch which business account or store this session acts for. Membership is re-checked on every request. */
  app.post('/api/auth/context', requireAuth, async (req, res) => {
    const input = contextSchema.parse(req.body);
    const data = {};
    if (input.organizationId !== undefined) {
      if (input.organizationId && !req.user.orgMemberships.some((m) => m.organizationId === input.organizationId)) throw new DomainError('Business account not found', 404);
      data.activeOrganizationId = input.organizationId;
    }
    if (input.storeId !== undefined) {
      if (input.storeId && !req.user.sellerMemberships.some((m) => m.storeId === input.storeId)) throw new DomainError('Store not found', 404);
      data.activeStoreId = input.storeId;
    }
    const session = await prisma.session.update({ where: { id: req.session.id }, data });
    res.json({ user: publicUser(req.user, session) });
  });

  app.patch('/api/auth/profile', requireAuth, async (req, res) => {
    const input = z.object({ name: z.string().trim().min(2).max(100), marketingOptIn: z.boolean() }).partial().parse(req.body);
    await prisma.user.update({ where: { id: req.user.id }, data: input });
    res.json({ user: await me(req.user.id, req.session) });
  });

  app.post('/api/auth/verify-email', limits.auth, async (req, res) => {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'This verification link is invalid') }).parse(req.body);
    await transaction(prisma, async (tx) => {
      const t = await tx.verificationToken.findUnique({ where: { id: sha256(token) } });
      if (!t || t.expiresAt <= new Date()) throw new DomainError('This verification link has expired. Request a new one from your account.', 400);
      await tx.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } });
      await tx.verificationToken.deleteMany({ where: { userId: t.userId } });
      await audit(tx, { actorId: t.userId, action: 'user.email-verified', entityType: 'user', entityId: t.userId });
    });
    res.json({ ok: true, message: 'Email confirmed. Thank you.' });
  });

  app.post('/api/auth/verify-email/resend', limits.auth, requireAuth, async (req, res) => {
    if (req.user.emailVerifiedAt) throw new DomainError('Your email is already confirmed', 409);
    if (!await sendVerification(req.user)) throw new DomainError('Email delivery isn’t set up yet. Please try again later.', 503);
    res.json({ ok: true, message: 'A new confirmation link is on its way.' });
  });

  // Password reset. Responses never reveal whether an email is registered.
  app.post('/api/auth/password-reset/request', limits.reset, async (req, res) => {
    const { email } = z.object({ email: z.email().toLowerCase() }).parse(req.body);
    if (!mailer.configured) throw new DomainError('Password reset by email isn’t available yet. Please contact support.', 503);
    const user = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
    // The Admin password is managed only with scripts/create-admin.mjs, never by an emailed link.
    if (user && user.status === 'ACTIVE' && !user.roles.some((r) => r.role === 'ADMIN')) {
      const token = randomToken();
      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        prisma.passwordResetToken.create({ data: { id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 30 * 60_000) } }),
      ]);
      const url = `${config.origin}/reset-password?token=${token}`;
      await mailer.send({
        to: email, subject: 'Reset your IBazzzar password', text: `Use this link within 30 minutes: ${url}`,
        html: emailHtml({ heading: 'Reset your password', body: 'Someone asked to reset the password for this IBazzzar account. The link works for 30 minutes.', actionLabel: 'Choose a new password', actionUrl: url }),
      });
    }
    res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
  });

  app.post('/api/auth/password-reset/confirm', limits.reset, async (req, res) => {
    const { token, newPassword } = passwordResetSchema.parse(req.body);
    const passwordHash = await hashPassword(newPassword);
    await transaction(prisma, async (tx) => {
      const t = await tx.passwordResetToken.findUnique({ where: { id: sha256(token) } });
      if (!t || t.expiresAt <= new Date()) throw new DomainError('This reset link has expired. Request a new one.', 400);
      await tx.user.update({ where: { id: t.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
      await tx.passwordResetToken.deleteMany({ where: { userId: t.userId } });
      await tx.session.deleteMany({ where: { userId: t.userId } });
      await audit(tx, { actorId: t.userId, action: 'user.password-reset', entityType: 'user', entityId: t.userId });
    });
    res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
  });

  app.post('/api/auth/password', requireAuth, async (req, res) => {
    const input = passwordChangeSchema.parse(req.body);
    if (!await verifyPassword(input.currentPassword, req.user.passwordHash)) throw new DomainError('Your current password is incorrect', 401, { currentPassword: 'This password is incorrect' });
    const passwordHash = await hashPassword(input.newPassword);
    await transaction(prisma, async (tx) => {
      await tx.user.update({ where: { id: req.user.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: req.user.id, id: { not: req.session.id } } });
      // Browsers signed out here are forgotten too, so signing in from one of them again raises a new-sign-in alert.
      await tx.knownDevice.deleteMany({ where: { userId: req.user.id, ...(req.session.deviceId ? { id: { not: req.session.deviceId } } : {}) } });
      await audit(tx, { actorId: req.user.id, action: 'user.password-changed', entityType: 'user', entityId: req.user.id });
    });
    res.json({ ok: true, message: 'Password updated. Other devices were signed out.' });
  });

  // Signed-in devices. Each session is referred to by the first 12 characters of its id (itself a hash of the cookie
  // token), which is enough to tell one account's sessions apart and reveals nothing usable.
  app.get('/api/auth/sessions', requireAuth, async (req, res) => {
    const sessions = await prisma.session.findMany({ where: { userId: req.user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } });
    const current = (s) => s.id === req.session.id;
    res.json({
      sessions: sessions
        .sort((a, b) => Number(current(b)) - Number(current(a)))
        .map((s) => ({ id: s.id.slice(0, 12), current: current(s), userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: current(s) ? new Date() : s.lastSeenAt })),
    });
  });

  /**
   * Signs one other device out. Its browser is also forgotten, so if it signs in again the owner gets a new-sign-in
   * alert. (This device signs out with the ordinary Sign out.)
   */
  app.delete('/api/auth/sessions/:id', requireAuth, async (req, res) => {
    const prefix = z.string().regex(/^[a-f0-9]{12}$/).safeParse(req.params.id);
    if (!prefix.success) throw new DomainError('Device not found', 404);
    const session = await prisma.session.findFirst({ where: { userId: req.user.id, id: { startsWith: prefix.data } } });
    if (!session) throw new DomainError('That device is already signed out', 404);
    if (session.id === req.session.id) throw new DomainError('To sign out of this device, use Sign out in the account menu', 400);
    await transaction(prisma, async (tx) => {
      await tx.session.delete({ where: { id: session.id } });
      if (session.deviceId) await tx.knownDevice.deleteMany({ where: { userId: req.user.id, id: session.deviceId } });
      await audit(tx, { actorId: req.user.id, action: 'user.session-revoked', entityType: 'user', entityId: req.user.id, ip: req.ip, metadata: { device: deviceName(session.userAgent) } });
    });
    res.json({ ok: true, message: `${deviceName(session.userAgent)} has been signed out` });
  });

  /** Signs out every device except this one, and forgets those browsers. */
  app.post('/api/auth/sessions/revoke-others', requireAuth, async (req, res) => {
    const count = await transaction(prisma, async (tx) => {
      const others = await tx.session.findMany({ where: { userId: req.user.id, id: { not: req.session.id } }, select: { deviceId: true } });
      await tx.session.deleteMany({ where: { userId: req.user.id, id: { not: req.session.id } } });
      const deviceIds = others.map((s) => s.deviceId).filter((d) => d && d !== req.session.deviceId);
      if (deviceIds.length) await tx.knownDevice.deleteMany({ where: { userId: req.user.id, id: { in: deviceIds } } });
      await audit(tx, { actorId: req.user.id, action: 'user.sessions-revoked', entityType: 'user', entityId: req.user.id, ip: req.ip, metadata: { count: others.length } });
      return others.length;
    });
    res.json({ ok: true, count, message: count ? `Signed out of ${count} other device${count === 1 ? '' : 's'}` : 'No other devices were signed in' });
  });

  // An existing customer adds a business account or applies to sell.
  app.post('/api/business/register', requireAuth, async (req, res) => {
    const profile = businessProfileSchema.parse(req.body);
    const organization = await transaction(prisma, (tx) => createOrganization(tx, req.user.id, profile));
    await prisma.session.update({ where: { id: req.session.id }, data: { activeOrganizationId: organization.id } });
    res.status(201).json({ organization });
  });

  app.post('/api/seller/register', requireAuth, async (req, res) => {
    const profile = sellerProfileSchema.parse(req.body);
    if (req.user.sellerMemberships.some((m) => m.role === 'OWNER' && m.store.status === 'PENDING')) {
      throw new DomainError('You already have a seller application under review', 409);
    }
    const store = await transaction(prisma, (tx) => createStore(tx, req.user.id, profile));
    await prisma.session.update({ where: { id: req.session.id }, data: { activeStoreId: store.id } });
    res.status(201).json({ store });
  });

  // The staff portal: confirms the signed-in account holds a staff role.
  app.get('/api/admin/me', requireAuth, (req, res) => {
    const role = req.staffRoles.find(isStaffRole);
    if (!role) throw new DomainError('Staff access required', 403);
    res.json({ role, roles: req.staffRoles });
  });
}
