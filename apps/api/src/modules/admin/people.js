// Admin: people (customers, staff, permissions), business accounts and sellers — lists, 360° views and actions.
import { z } from 'zod';
import { DomainError, staffRoles, allCapabilities } from '../../../../../packages/shared/src/index.js';
import { uuid, mobileSchema } from '../../../../../packages/validation/src/index.js';
import { requireStaff } from '../../http/middleware.js';
import { transaction, toPaise } from '../../lib/db.js';
import { audit, notify, notifyStoreOwners } from '../../lib/audit.js';
import { ilike } from '../../lib/http.js';
import { listParams, sendList, bulkInput } from '../../lib/admin-list.js';
import { EDITABLE_ROLES, CAPABILITY_LABELS, permissionMatrix, invalidatePermissions } from '../../services/permissions.js';
import { creditOutstanding } from '../../services/orders.js';

const m = toPaise;
const reason = z.string().trim().min(5, 'Please give a short reason (at least 5 characters)').max(300);
const isAdminUser = (u) => u.roles?.some((r) => r.role === 'ADMIN');
const PAID = ['PAID', 'COD_COLLECTED', 'ON_TERMS', 'PARTIALLY_REFUNDED', 'REFUNDED'];

export async function notesFor(prisma, entityType, entityId) {
  return prisma.adminNote.findMany({ where: { entityType, entityId: String(entityId) }, orderBy: { createdAt: 'desc' }, take: 50 });
}

export function registerAdminPeople(app, { prisma }) {
  app.get('/api/admin/meta', (req, res) => {
    if (!req.user) throw new DomainError('Please sign in to continue', 401);
    if (!req.staffRoles.length) throw new DomainError('Staff access required', 403);
    res.json({ roles: req.staffRoles, capabilities: req.capabilities, labels: Object.fromEntries(Object.entries(staffRoles).map(([k, v]) => [k, v.label])) });
  });

  // ───────────── Customers & users ─────────────
  const userSorts = {
    joined: (d) => ({ createdAt: d }), name: (d) => ({ name: d }), email: (d) => ({ email: d }), orders: (d) => ({ orders: { _count: d } }),
  };
  function userWhere(p, query) {
    const type = String(query.type || '');
    return {
      ...(p.q ? { OR: [{ name: ilike(p.q) }, { email: ilike(p.q) }, { phone: { contains: p.q } }] } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      ...(query.verified === 'yes' ? { emailVerifiedAt: { not: null } } : query.verified === 'no' ? { emailVerifiedAt: null } : {}),
      ...(type === 'staff' ? { roles: { some: {} } } : {}),
      ...(type === 'seller' ? { sellerMemberships: { some: {} } } : {}),
      ...(type === 'business' ? { orgMemberships: { some: {} } } : {}),
      ...(type === 'customer' ? { roles: { none: {} }, sellerMemberships: { none: {} }, orgMemberships: { none: {} } } : {}),
      ...(type === 'guest' ? { passwordHash: 'guest$unset' } : {}),
      demo: false,
    };
  }

  app.get('/api/admin/users', requireStaff('users.view'), async (req, res) => {
    const p = listParams(req.query, userSorts);
    const where = userWhere(p, req.query);
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { roles: true, _count: { select: { orders: true, sellerMemberships: true, orgMemberships: true } } } }),
      prisma.user.count({ where }),
    ]);
    const users = rows.map((u) => ({
      id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, createdAt: u.createdAt, emailVerifiedAt: u.emailVerifiedAt,
      roles: u.roles.map((r) => r.role), locked: !!u.lockedUntil && u.lockedUntil > new Date(), orders: u._count.orders,
      stores: u._count.sellerMemberships, organizations: u._count.orgMemberships, guest: u.passwordHash === 'guest$unset', marketingOptIn: u.marketingOptIn,
    }));
    sendList(res, p, {
      key: 'users', rows: users, total, filename: 'users',
      toCsvRow: (u) => ({ name: u.name, email: u.email, phone: u.phone ?? '', status: u.status, roles: u.roles.join(' '), orders: u.orders, email_verified: u.emailVerifiedAt ? 'yes' : 'no', marketing_opt_in: u.marketingOptIn ? 'yes' : 'no', guest: u.guest ? 'yes' : 'no', joined: u.createdAt }),
    });
  });

  /** Customer 360: everything about one person in one call. */
  app.get('/api/admin/users/:id', requireStaff('users.view'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const u = await prisma.user.findUnique({
      where: { id },
      include: { roles: true, addresses: true, orgMemberships: { include: { organization: true } }, sellerMemberships: { include: { store: true } } },
    });
    if (!u) throw new DomainError('User not found', 404);
    const [orders, orderStats, spent, returns, refunds, tickets, activity, sessions, wishlist, cart] = await Promise.all([
      prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, number: true, createdAt: true, status: true, paymentStatus: true, paymentMethod: true, mode: true, totalPaise: true } }),
      prisma.order.groupBy({ by: ['status'], where: { userId: id }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { userId: id, paymentStatus: { in: PAID }, demo: false }, _sum: { totalPaise: true }, _count: { _all: true }, _max: { createdAt: true } }),
      prisma.returnRequest.count({ where: { userId: id } }),
      prisma.refund.aggregate({ where: { order: { userId: id } }, _sum: { amountPaise: true } }),
      prisma.supportTicket.findMany({ where: { userId: id }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, number: true, subject: true, status: true, updatedAt: true } }),
      prisma.auditLog.findMany({ where: { OR: [{ actorId: id }, { entityId: id }] }, orderBy: { createdAt: 'desc' }, take: 40 }),
      prisma.session.count({ where: { userId: id, expiresAt: { gt: new Date() } } }),
      prisma.wishlistItem.count({ where: { userId: id } }),
      prisma.cart.findUnique({ where: { userId: id }, include: { _count: { select: { items: true } } } }),
    ]);
    res.json({
      user: {
        id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, createdAt: u.createdAt, emailVerifiedAt: u.emailVerifiedAt,
        marketingOptIn: u.marketingOptIn, roles: u.roles.map((r) => r.role), locked: !!u.lockedUntil && u.lockedUntil > new Date(),
        guest: u.passwordHash === 'guest$unset', isAdmin: isAdminUser(u),
      },
      stats: {
        orders: orderStats.reduce((s, x) => s + x._count._all, 0), byStatus: Object.fromEntries(orderStats.map((x) => [x.status, x._count._all])),
        spentPaise: m(spent._sum.totalPaise ?? 0), paidOrders: spent._count._all, averageOrderPaise: spent._count._all ? Math.round(m(spent._sum.totalPaise) / spent._count._all) : 0,
        lastOrderAt: spent._max.createdAt, returns, refundsPaise: m(refunds._sum.amountPaise ?? 0), activeSessions: sessions, wishlist, cartItems: cart?._count.items ?? 0,
      },
      addresses: u.addresses,
      organizations: u.orgMemberships.map((x) => ({ id: x.organization.id, name: x.organization.tradeName || x.organization.legalName, status: x.organization.status, role: x.role })),
      stores: u.sellerMemberships.map((x) => ({ id: x.store.id, name: x.store.name, status: x.store.status, role: x.role })),
      orders: orders.map((o) => ({ ...o, totalPaise: m(o.totalPaise) })), tickets, activity, notes: await notesFor(prisma, 'user', id),
    });
  });

  app.patch('/api/admin/users/:id', requireStaff('users.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ name: z.string().trim().min(2).max(100), phone: mobileSchema.nullable(), emailVerified: z.boolean(), marketingOptIn: z.boolean() }).partial().parse(req.body);
    await transaction(prisma, async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, include: { roles: true } });
      if (!u) throw new DomainError('User not found', 404);
      if (isAdminUser(u)) throw new DomainError('The Admin account is managed with the server script', 403);
      if (input.phone && await tx.user.findFirst({ where: { phone: input.phone, id: { not: id } } })) throw new DomainError('This mobile number belongs to another account', 409, { phone: 'Already used by another account' });
      const { emailVerified, ...data } = input;
      if (emailVerified !== undefined) data.emailVerifiedAt = emailVerified ? (u.emailVerifiedAt ?? new Date()) : null;
      await tx.user.update({ where: { id }, data });
      await audit(tx, { actorId: req.user.id, action: 'user.edited', entityType: 'user', entityId: id, metadata: input });
    });
    res.json({ ok: true });
  });

  async function setUserStatus(tx, req, id, status, why) {
    if (id === req.user.id) throw new DomainError('You can’t change the status of your own account', 409);
    const u = await tx.user.findUnique({ where: { id }, include: { roles: true } });
    if (!u) throw new DomainError('User not found', 404);
    if (isAdminUser(u)) throw new DomainError('The Admin account can’t be suspended from the console', 403);
    if (u.roles.length && !req.staffRoles.includes('ADMIN')) throw new DomainError('Only the Admin can suspend staff accounts', 403);
    await tx.user.update({ where: { id }, data: { status } });
    if (status === 'SUSPENDED') await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, { actorId: req.user.id, action: `user.${status.toLowerCase()}`, entityType: 'user', entityId: id, metadata: { reason: why } });
  }

  app.patch('/api/admin/users/:id/status', requireStaff('users.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason }).parse(req.body);
    await transaction(prisma, (tx) => setUserStatus(tx, req, id, input.status, input.reason));
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/unlock', requireStaff('users.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await prisma.user.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null } });
    await audit(prisma, { actorId: req.user.id, action: 'user.unlocked', entityType: 'user', entityId: id });
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/sign-out', requireStaff('users.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const target = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!target) throw new DomainError('User not found', 404);
    if (isAdminUser(target)) throw new DomainError('The Admin account is managed with the server script', 403);
    const { count } = await prisma.session.deleteMany({ where: { userId: id } });
    await audit(prisma, { actorId: req.user.id, action: 'user.signed-out-everywhere', entityType: 'user', entityId: id, metadata: { sessions: count } });
    res.json({ ok: true, sessions: count });
  });

  app.post('/api/admin/users/bulk', requireStaff('users.manage'), async (req, res) => {
    const input = bulkInput(req.body, ['suspend', 'restore', 'sign-out']);
    if (input.action === 'suspend' && (input.reason ?? '').length < 5) throw new DomainError('Please give a short reason (at least 5 characters)', 400, { reason: 'Required for suspension' });
    const results = { done: 0, skipped: [] };
    for (const id of input.ids) {
      try {
        await transaction(prisma, async (tx) => {
          if (input.action === 'sign-out') {
            const u = await tx.user.findUnique({ where: { id }, include: { roles: true } });
            if (!u || isAdminUser(u)) throw new DomainError('Not allowed for this account', 403);
            await tx.session.deleteMany({ where: { userId: id } });
            await audit(tx, { actorId: req.user.id, action: 'user.signed-out-everywhere', entityType: 'user', entityId: id });
          } else {
            await setUserStatus(tx, req, id, input.action === 'suspend' ? 'SUSPENDED' : 'ACTIVE', input.reason ?? 'Bulk restore');
          }
        });
        results.done++;
      } catch (e) { results.skipped.push({ id, reason: e.message }); }
    }
    res.json(results);
  });

  /** Grants Operations, Finance or Support. The Admin role exists only through scripts/create-admin.mjs. */
  app.put('/api/admin/users/:id/roles', requireStaff('staff.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { roles } = z.object({ roles: z.array(z.enum(EDITABLE_ROLES, { message: 'The Admin role can’t be granted from the console' })).max(3) }).parse(req.body);
    if (id === req.user.id) throw new DomainError('You can’t change your own roles', 409);
    await transaction(prisma, async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, include: { roles: true } });
      if (!target) throw new DomainError('User not found', 404);
      if (isAdminUser(target)) throw new DomainError('The Admin account can’t be changed from the console', 403);
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (roles.length) await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, role, grantedBy: req.user.id })) });
      await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, { actorId: req.user.id, action: 'user.roles-changed', entityType: 'user', entityId: id, metadata: { roles } });
    });
    res.json({ ok: true, roles });
  });

  app.get('/api/admin/staff', requireStaff('staff.manage'), async (_req, res) => {
    const rows = await prisma.userRole.findMany({ include: { user: { select: { id: true, name: true, email: true, status: true, createdAt: true } } }, orderBy: { createdAt: 'asc' } });
    const byUser = new Map();
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? { ...r.user, roles: [] };
      entry.roles.push(r.role);
      byUser.set(r.userId, entry);
    }
    res.json({ staff: [...byUser.values()], roles: EDITABLE_ROLES.map((id) => ({ id, ...staffRoles[id] })) });
  });

  // ───────────── Permissions (Admin only) ─────────────
  const adminOnly = (req, _res, next) => {
    if (!req.staffRoles?.includes('ADMIN')) throw new DomainError('Only the Admin can change permissions', 403);
    next();
  };
  const editableCaps = allCapabilities.filter((c) => c !== 'staff.manage');
  app.get('/api/admin/permissions', requireStaff('staff.manage'), async (_req, res) => {
    res.json({ matrix: await permissionMatrix(prisma, { fresh: true }), roles: EDITABLE_ROLES.map((id) => ({ id, ...staffRoles[id] })), capabilities: editableCaps.map((id) => ({ id, label: CAPABILITY_LABELS[id] ?? id })) });
  });
  app.put('/api/admin/permissions', requireStaff('staff.manage'), adminOnly, async (req, res) => {
    const input = z.object(Object.fromEntries(EDITABLE_ROLES.map((r) => [r, z.array(z.enum(editableCaps)).max(editableCaps.length)]))).parse(req.body);
    await prisma.setting.upsert({ where: { key: 'permissions' }, create: { key: 'permissions', value: input, updatedBy: req.user.id }, update: { value: input, updatedBy: req.user.id } });
    invalidatePermissions();
    await audit(prisma, { actorId: req.user.id, action: 'permissions.updated', entityType: 'setting', entityId: 'permissions', metadata: input });
    res.json({ matrix: await permissionMatrix(prisma, { fresh: true }) });
  });

  // ───────────── Business accounts ─────────────
  const orgSorts = { applied: (d) => ({ createdAt: d }), name: (d) => ({ legalName: d }), orders: (d) => ({ orders: { _count: d } }) };
  app.get('/api/admin/organizations', requireStaff('users.view'), async (req, res) => {
    const p = listParams(req.query, orgSorts);
    const where = {
      ...(p.q ? { OR: [{ legalName: ilike(p.q) }, { tradeName: ilike(p.q) }, { gstin: ilike(p.q) }] } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.credit === 'yes' ? { creditApproved: true } : req.query.credit === 'no' ? { creditApproved: false } : {}),
      ...(req.query.gst === 'yes' ? { gstRegistered: true } : req.query.gst === 'no' ? { gstRegistered: false } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.organization.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { members: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { purchaseOrders: true, orders: true, rfqs: true } } } }),
      prisma.organization.count({ where }),
    ]);
    const orgs = rows.map((o) => ({
      id: o.id, legalName: o.legalName, tradeName: o.tradeName, status: o.status, businessType: o.businessType, gstRegistered: o.gstRegistered, gstin: o.gstin, pan: o.pan,
      contactPhone: o.contactPhone, registeredAddress: o.registeredAddress, createdAt: o.createdAt, creditApproved: o.creditApproved, allowedTerms: o.allowedTerms,
      creditLimitPaise: m(o.creditLimitPaise), owner: o.members.find((x) => x.role === 'OWNER')?.user ?? null, memberCount: o.members.length,
      orders: o._count.orders, purchaseOrders: o._count.purchaseOrders, rfqs: o._count.rfqs,
    }));
    sendList(res, p, {
      key: 'organizations', rows: orgs, total, filename: 'business-accounts',
      toCsvRow: (o) => ({ legal_name: o.legalName, trade_name: o.tradeName ?? '', status: o.status, gstin: o.gstin ?? '', pan: o.pan ?? '', phone: o.contactPhone, owner: o.owner?.email ?? '', members: o.memberCount, orders: o.orders, credit: o.creditApproved ? o.allowedTerms : 'none', credit_limit_inr: (o.creditLimitPaise / 100).toFixed(2), applied: o.createdAt }),
    });
  });

  app.get('/api/admin/organizations/:id', requireStaff('users.view'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const o = await prisma.organization.findUnique({ where: { id }, include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, approvalPolicy: true, verifications: true, addresses: true } });
    if (!o) throw new DomainError('Business account not found', 404);
    const [orders, spend, rfqs, pos, outstanding, activity] = await Promise.all([
      prisma.order.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, createdAt: true, status: true, paymentStatus: true, paymentMethod: true, totalPaise: true, paymentDueAt: true } }),
      prisma.order.aggregate({ where: { organizationId: id, paymentStatus: { in: PAID }, demo: false }, _sum: { totalPaise: true }, _count: { _all: true } }),
      prisma.rfq.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, number: true, title: true, status: true, createdAt: true } }),
      prisma.purchaseOrder.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, number: true, status: true, totalPaise: true, paymentTerms: true, createdAt: true } }),
      creditOutstanding(prisma, id),
      prisma.auditLog.findMany({ where: { entityType: 'organization', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const { approvalPolicy, ...org } = o;
    res.json({
      organization: { ...org, creditLimitPaise: m(o.creditLimitPaise), approvalThresholdPaise: m(approvalPolicy?.thresholdPaise ?? 0) },
      members: o.members.map((x) => ({ ...x.user, role: x.role })),
      stats: { spendPaise: m(spend._sum.totalPaise ?? 0), paidOrders: spend._count._all, outstandingPaise: outstanding, availableCreditPaise: o.creditApproved ? Math.max(0, m(o.creditLimitPaise) - outstanding) : 0 },
      orders: orders.map((x) => ({ ...x, totalPaise: m(x.totalPaise) })), rfqs, purchaseOrders: pos.map((x) => ({ ...x, totalPaise: m(x.totalPaise) })),
      activity, notes: await notesFor(prisma, 'organization', id),
    });
  });

  async function updateOrg(tx, req, id, input) {
    const org = await tx.organization.findUnique({ where: { id }, include: { members: { where: { role: 'OWNER' } } } });
    if (!org) throw new DomainError('Business account not found', 404);
    const { note, ...data } = input;
    await tx.organization.update({ where: { id }, data });
    if (input.status) {
      for (const owner of org.members) {
        await notify(tx, owner.userId, { title: `Business account ${input.status.toLowerCase()}`, body: input.status === 'APPROVED' ? 'You can now request quotations and buy wholesale.' : note || 'Please contact business support for details.', link: '/business' });
      }
    }
    await audit(tx, { actorId: req.user.id, action: 'organization.updated', entityType: 'organization', entityId: id, metadata: input });
  }

  app.patch('/api/admin/organizations/:id', requireStaff('approvals.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({
      status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']).optional(), note: z.string().trim().max(300).optional(),
      creditApproved: z.boolean().optional(), allowedTerms: z.enum(['PREPAID', 'NET_15', 'NET_30', 'NET_45']).optional(),
      creditLimitPaise: z.number().int().min(0).max(10_000_000_000).optional(),
    }).parse(req.body);
    // Credit is a finance decision and is never granted automatically.
    if ((input.creditApproved !== undefined || input.allowedTerms || input.creditLimitPaise !== undefined) && !req.can('finance.manage')) throw new DomainError('Only finance can change credit', 403);
    if (['REJECTED', 'SUSPENDED'].includes(input.status) && !input.note) throw new DomainError('Please give a reason for the business', 400, { note: 'Required' });
    await transaction(prisma, (tx) => updateOrg(tx, req, id, input));
    res.json({ ok: true });
  });

  app.post('/api/admin/organizations/bulk', requireStaff('approvals.manage'), async (req, res) => {
    const input = bulkInput(req.body, ['approve', 'reject', 'suspend']);
    if (input.action !== 'approve' && (input.reason ?? '').length < 5) throw new DomainError('Please give a short reason (at least 5 characters)', 400, { reason: 'Required' });
    const results = { done: 0, skipped: [] };
    for (const id of input.ids) {
      try { await transaction(prisma, (tx) => updateOrg(tx, req, id, { status: { approve: 'APPROVED', reject: 'REJECTED', suspend: 'SUSPENDED' }[input.action], note: input.reason })); results.done++; } catch (e) { results.skipped.push({ id, reason: e.message }); }
    }
    res.json(results);
  });

  // ───────────── Sellers ─────────────
  const storeSorts = { applied: (d) => ({ createdAt: d }), name: (d) => ({ name: d }), listings: (d) => ({ listings: { _count: d } }) };
  app.get('/api/admin/sellers', requireStaff('users.view'), async (req, res) => {
    const p = listParams(req.query, storeSorts);
    const finance = req.can('finance.view');
    const where = {
      ...(p.q ? { OR: [{ name: ilike(p.q) }, { legalName: ilike(p.q) }, { gstin: ilike(p.q) }] } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.hold === 'yes' ? { payoutHold: true } : {}),
      ...(req.query.gst === 'yes' ? { gstRegistered: true } : req.query.gst === 'no' ? { gstRegistered: false } : {}),
      ...(req.query.category ? { primaryCategory: { slug: String(req.query.category) } } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.sellerStore.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { primaryCategory: true, payoutAccount: true, members: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { listings: true, sellerOrders: true } } } }),
      prisma.sellerStore.count({ where }),
    ]);
    const balances = finance && rows.length ? await prisma.settlementEntry.groupBy({ by: ['storeId'], where: { demo: false, storeId: { in: rows.map((r) => r.id) } }, _sum: { amountPaise: true } }) : [];
    const sellers = rows.map((s) => ({
      id: s.id, slug: s.slug, name: s.name, legalName: s.legalName, status: s.status, gstRegistered: s.gstRegistered, gstin: s.gstin, pan: s.pan, businessType: s.businessType,
      contactPhone: s.contactPhone, pickupAddress: s.pickupAddress, primaryCategory: s.primaryCategory?.name, createdAt: s.createdAt, description: s.description,
      owner: s.members.find((x) => x.role === 'OWNER')?.user ?? null, staff: s.members.length, listings: s._count.listings, parcels: s._count.sellerOrders,
      commissionBps: s.commissionBps, payoutHold: s.payoutHold, demo: s.demo,
      payoutAccount: s.payoutAccount ? { accountHolder: s.payoutAccount.accountHolder, accountLast4: s.payoutAccount.accountLast4, ifsc: s.payoutAccount.ifsc, verified: s.payoutAccount.verified } : null,
      payablePaise: finance ? m(balances.find((b) => b.storeId === s.id)?._sum.amountPaise ?? 0) : null,
    }));
    sendList(res, p, {
      key: 'sellers', rows: sellers, total, filename: 'sellers',
      toCsvRow: (s) => ({ store: s.name, legal_name: s.legalName, status: s.status, gstin: s.gstin ?? '', pan: s.pan ?? '', phone: s.contactPhone, owner: s.owner?.email ?? '', category: s.primaryCategory ?? '', listings: s.listings, parcels: s.parcels, commission_pct: s.commissionBps == null ? 'default' : (s.commissionBps / 100).toFixed(2), payout_hold: s.payoutHold ? 'yes' : 'no', payable_inr: s.payablePaise == null ? '' : (s.payablePaise / 100).toFixed(2), applied: s.createdAt }),
    });
  });

  /** Seller 360: performance, money, catalogue and recent parcels. */
  app.get('/api/admin/sellers/:id', requireStaff('users.view'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const finance = req.can('finance.view');
    const s = await prisma.sellerStore.findUnique({ where: { id }, include: { primaryCategory: true, payoutAccount: true, verifications: true, members: { include: { user: { select: { id: true, name: true, email: true } } } }, warehouses: true } });
    if (!s) throw new DomainError('Seller not found', 404);
    const [parcelStats, returns, shipTimes, rating, listingStats, recent, sums, payouts, activity] = await Promise.all([
      prisma.sellerOrder.groupBy({ by: ['status'], where: { storeId: id, order: { status: { not: 'AWAITING_PAYMENT' } } }, _count: { _all: true }, _sum: { totalPaise: true } }),
      prisma.returnRequest.count({ where: { sellerOrder: { storeId: id } } }),
      prisma.$queryRaw`SELECT AVG(EXTRACT(EPOCH FROM (sh."createdAt" - so."createdAt")) / 3600)::float AS hours FROM shipments sh JOIN seller_orders so ON so.id = sh."sellerOrderId" WHERE so."storeId" = ${id}::uuid`,
      prisma.$queryRaw`SELECT AVG(r.rating)::float AS average, COUNT(*)::int AS count FROM reviews r JOIN order_items oi ON oi.id = r."orderItemId" JOIN seller_orders so ON so.id = oi."sellerOrderId" WHERE so."storeId" = ${id}::uuid`,
      prisma.sellerListing.groupBy({ by: ['status'], where: { storeId: id }, _count: { _all: true } }),
      prisma.sellerOrder.findMany({ where: { storeId: id, order: { status: { not: 'AWAITING_PAYMENT' } } }, orderBy: { createdAt: 'desc' }, take: 15, include: { order: { select: { id: true, number: true, paymentMethod: true } } } }),
      finance ? prisma.settlementEntry.groupBy({ by: ['kind', 'demo'], where: { storeId: id }, _sum: { amountPaise: true } }) : [],
      finance ? prisma.payoutRecord.findMany({ where: { storeId: id }, orderBy: { createdAt: 'desc' }, take: 10 }) : [],
      prisma.auditLog.findMany({ where: { entityType: 'store', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const parcels = parcelStats.reduce((t, x) => t + x._count._all, 0);
    const count = (st) => parcelStats.find((x) => x.status === st)?._count._all ?? 0;
    const real = (k) => m(sums.find((x) => x.kind === k && !x.demo)?._sum.amountPaise ?? 0);
    const { members, payoutAccount, primaryCategory, ...store } = s;
    res.json({
      seller: { ...store, primaryCategory: primaryCategory?.name ?? null, payoutAccount: payoutAccount ? { accountHolder: payoutAccount.accountHolder, accountLast4: payoutAccount.accountLast4, ifsc: payoutAccount.ifsc, bankName: payoutAccount.bankName, verified: payoutAccount.verified } : null },
      team: members.map((x) => ({ ...x.user, role: x.role })),
      performance: {
        parcels, delivered: count('DELIVERED'), cancelled: count('CANCELLED'), cancelRate: parcels ? count('CANCELLED') / parcels : 0,
        returns, returnRate: count('DELIVERED') ? returns / count('DELIVERED') : 0, avgHoursToShip: shipTimes[0]?.hours ?? null,
        rating: rating[0]?.count ? { average: Math.round(rating[0].average * 10) / 10, count: rating[0].count } : null,
        listings: Object.fromEntries(listingStats.map((x) => [x.status, x._count._all])),
      },
      money: finance ? {
        salesPaise: real('SALE'), shippingPaise: real('SHIPPING_FEE'), commissionPaise: -(real('COMMISSION') + real('COMMISSION_REVERSAL')), refundsPaise: -real('REFUND_ADJUSTMENT'),
        paidOutPaise: -real('PAYOUT'), payablePaise: sums.filter((x) => !x.demo).reduce((t, x) => t + m(x._sum.amountPaise ?? 0), 0),
        payouts: payouts.map((x) => ({ ...x, amountPaise: m(x.amountPaise) })),
      } : null,
      recentParcels: recent.map((x) => ({ id: x.id, orderId: x.order.id, orderNumber: x.order.number, status: x.status, totalPaise: m(x.totalPaise), paymentMethod: x.order.paymentMethod, createdAt: x.createdAt })),
      activity, notes: await notesFor(prisma, 'store', id),
    });
  });

  async function updateStore(tx, req, id, input) {
    const store = await tx.sellerStore.findUnique({ where: { id } });
    if (!store) throw new DomainError('Seller not found', 404);
    const { note, payoutVerified, ...data } = input;
    if (Object.keys(data).length) await tx.sellerStore.update({ where: { id }, data });
    if (payoutVerified !== undefined) {
      const acct = await tx.sellerPayoutAccount.findUnique({ where: { storeId: id } });
      if (!acct) throw new DomainError('This seller hasn’t added a bank account yet', 409);
      await tx.sellerPayoutAccount.update({ where: { storeId: id }, data: { verified: payoutVerified } });
    }
    if (input.status) await notifyStoreOwners(tx, id, { title: `Store ${input.status.toLowerCase()}`, body: input.status === 'APPROVED' ? 'Your store is live. Add your first products to start selling.' : note || 'Please contact seller support for details.', link: '/seller' });
    if (input.payoutHold !== undefined) await notifyStoreOwners(tx, id, { title: input.payoutHold ? 'Payouts on hold' : 'Payouts resumed', body: input.payoutHold ? input.payoutHoldReason ?? 'Please contact seller support.' : 'Your payouts will continue on the normal schedule.', link: '/seller/payments' });
    await audit(tx, { actorId: req.user.id, action: 'store.updated', entityType: 'store', entityId: id, metadata: input });
  }

  app.patch('/api/admin/sellers/:id', requireStaff('approvals.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({
      status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']).optional(), note: z.string().trim().max(300).optional(),
      payoutVerified: z.boolean().optional(), commissionBps: z.number().int().min(0).max(5000).nullable().optional(),
      payoutHold: z.boolean().optional(), payoutHoldReason: z.string().trim().max(300).nullable().optional(),
      codEnabled: z.boolean().optional(), handlingDays: z.number().int().min(0).max(10).optional(),
    }).parse(req.body);
    const touchesMoney = ['payoutVerified', 'commissionBps', 'payoutHold', 'payoutHoldReason'].some((k) => input[k] !== undefined);
    if (touchesMoney && !req.can('finance.manage')) throw new DomainError('Only finance can change commission, bank verification or payout holds', 403);
    if (input.payoutHold && !input.payoutHoldReason) throw new DomainError('Please give the seller a reason for the hold', 400, { payoutHoldReason: 'Required' });
    if (['REJECTED', 'SUSPENDED'].includes(input.status) && !input.note) throw new DomainError('Please give the seller a reason', 400, { note: 'Required' });
    await transaction(prisma, (tx) => updateStore(tx, req, id, input));
    res.json({ ok: true });
  });

  app.post('/api/admin/sellers/:id/message', requireStaff('approvals.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ kind: z.enum(['INFO', 'WARNING']), title: z.string().trim().min(3).max(100), body: z.string().trim().min(5).max(1000) }).parse(req.body);
    if (!await prisma.sellerStore.findUnique({ where: { id } })) throw new DomainError('Seller not found', 404);
    await transaction(prisma, async (tx) => {
      await notifyStoreOwners(tx, id, { title: input.kind === 'WARNING' ? `Warning: ${input.title}` : input.title, body: input.body, link: '/seller' });
      await audit(tx, { actorId: req.user.id, action: input.kind === 'WARNING' ? 'store.warned' : 'store.messaged', entityType: 'store', entityId: id, metadata: input });
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/sellers/bulk', requireStaff('approvals.manage'), async (req, res) => {
    const input = bulkInput(req.body, ['approve', 'reject', 'suspend']);
    if (input.action !== 'approve' && (input.reason ?? '').length < 5) throw new DomainError('Please give a short reason (at least 5 characters)', 400, { reason: 'Required' });
    const results = { done: 0, skipped: [] };
    for (const id of input.ids) {
      try { await transaction(prisma, (tx) => updateStore(tx, req, id, { status: { approve: 'APPROVED', reject: 'REJECTED', suspend: 'SUSPENDED' }[input.action], note: input.reason })); results.done++; } catch (e) { results.skipped.push({ id, reason: e.message }); }
    }
    res.json(results);
  });
}
