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
import { SESSION_COOKIE, SESSION_DAYS, cookieOptions, publicUser, requireAuth } from '../http/middleware.js';

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
  const startSession = async (req, res, userId) => {
    const token = randomToken();
    await prisma.session.create({
      data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000), userAgent: req.get('user-agent')?.slice(0, 300) ?? null, ip: req.ip },
    });
    res.cookie(SESSION_COOKIE, token, cookieOptions(config));
  };
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
      // Local bootstrap only: the configured email becomes the first Super Admin. Production uses scripts/grant-admin.mjs.
      if (config.bootstrapAdminEmail === input.email && !(await tx.userRole.count({ where: { role: 'ADMIN' } }))) {
        await tx.userRole.create({ data: { userId: created.id, role: 'ADMIN' } });
        await audit(tx, { actorId: created.id, action: 'user.bootstrap-admin', entityType: 'user', entityId: created.id });
      }
      if (input.accountType === 'business') await createOrganization(tx, created.id, input.business);
      if (input.accountType === 'seller') await createStore(tx, created.id, input.seller);
      await audit(tx, { actorId: created.id, action: `user.registered.${input.accountType}`, entityType: 'user', entityId: created.id, ip: req.ip });
      return created;
    });
    await startSession(req, res, user.id);
    let verificationSent = false;
    try { verificationSent = await sendVerification(user); } catch (error) { req.log?.warn({ err: error }, 'Verification email failed'); }
    res.status(201).json({ user: await me(user.id), verificationSent });
  });

  app.post('/api/auth/login', limits.auth, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const until = user.lockedUntil.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      throw new DomainError(`Too many failed attempts. Try again after ${until} IST or reset your password.`, 429);
    }
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!valid || !user) {
      // Per-account lockout complements the per-IP rate limit against distributed password guessing.
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
    await startSession(req, res, user.id);
    await audit(prisma, { actorId: user.id, action: 'user.signed-in', entityType: 'user', entityId: user.id, ip: req.ip });
    res.json({ user: await me(user.id) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await prisma.session.deleteMany({ where: { id: sha256(token) } });
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(config), maxAge: undefined });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => res.json({ user: publicUser(req.user, req.session) }));

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
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status === 'ACTIVE') {
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
      await audit(tx, { actorId: req.user.id, action: 'user.password-changed', entityType: 'user', entityId: req.user.id });
    });
    res.json({ ok: true, message: 'Password updated. Other devices were signed out.' });
  });

  app.get('/api/auth/sessions', requireAuth, async (req, res) => {
    const sessions = await prisma.session.findMany({ where: { userId: req.user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    res.json({ sessions: sessions.map((s) => ({ id: s.id.slice(0, 12), current: s.id === req.session.id, userAgent: s.userAgent, createdAt: s.createdAt })) });
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
