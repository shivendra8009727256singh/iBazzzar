// Admin: dashboard, customers, staff roles, business accounts, sellers, catalogue and moderation.
import { z } from 'zod';
import { DomainError, can, staffRoles, isStaffRole } from '../../../../../packages/shared/src/index.js';
import { uuid } from '../../../../../packages/validation/src/index.js';
import { requireStaff } from '../../http/middleware.js';
import { transaction, toPaise, Prisma } from '../../lib/db.js';
import { audit, notify, notifyStoreOwners } from '../../lib/audit.js';
import { pageParams, ilike, slugify } from '../../lib/http.js';
import { getSetting } from '../../services/settings.js';
import { loadListingsWhere } from '../../services/catalog.js';

const m = toPaise;
const reason = z.string().trim().min(5, 'Please give a short reason (at least 5 characters)').max(300);

export function registerAdminPeople(app, { prisma }) {
  // ───────────── Dashboard ─────────────
  app.get('/api/admin/dashboard', requireStaff('dashboard'), async (req, res) => {
    const finance = can(req.staffRoles, 'finance.view');
    const since = new Date(Date.now() - 30 * 86_400_000);
    const confirmed = { status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } };
    const [orders, awaiting, toShip, customers, sellers, gmv, demoGmv, commission, refundsPending, queues, series, statusMix, recent, top, rfqs] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'AWAITING_PAYMENT' } }),
      prisma.sellerOrder.count({ where: { status: { in: ['PENDING', 'PACKED'] }, order: confirmed } }),
      prisma.user.count({ where: { roles: { none: {} } } }),
      prisma.sellerStore.count({ where: { status: 'APPROVED' } }),
      prisma.order.aggregate({ where: { ...confirmed, paymentStatus: { in: ['PAID', 'COD_COLLECTED', 'ON_TERMS', 'PARTIALLY_REFUNDED'] }, demo: false }, _sum: { totalPaise: true }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { paymentStatus: 'DEMO_SIMULATED' }, _sum: { totalPaise: true } }),
      prisma.settlementEntry.aggregate({ where: { kind: { in: ['COMMISSION', 'COMMISSION_REVERSAL'] }, demo: false }, _sum: { amountPaise: true } }),
      prisma.refund.aggregate({ where: { status: 'PENDING_PROVIDER' }, _sum: { amountPaise: true }, _count: { _all: true } }),
      Promise.all([
        prisma.sellerStore.count({ where: { status: 'PENDING' } }),
        prisma.catalogProduct.count({ where: { status: 'PENDING' } }),
        prisma.sellerListing.count({ where: { status: 'PENDING', variant: { product: { status: 'APPROVED' } } } }),
        prisma.organization.count({ where: { status: 'PENDING' } }),
        prisma.returnRequest.count({ where: { status: 'REQUESTED' } }),
        prisma.supportTicket.count({ where: { status: 'OPEN' } }),
        prisma.order.count({ where: { paymentStatus: 'BANK_TRANSFER_PENDING', status: 'AWAITING_PAYMENT' } }),
      ]),
      prisma.$queryRaw`SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders,
        COALESCE(SUM(CASE WHEN "paymentStatus" IN ('PAID','COD_COLLECTED','ON_TERMS','PARTIALLY_REFUNDED') AND NOT demo THEN "totalPaise" ELSE 0 END), 0)::bigint AS gmv
        FROM orders WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { name: true } } } }),
      prisma.$queryRaw`SELECT s.id, s.name, COALESCE(SUM(e."amountPaise"), 0)::bigint AS gross FROM settlement_entries e JOIN seller_stores s ON s.id = e."storeId"
        WHERE e.kind = 'SALE' AND NOT e.demo GROUP BY s.id, s.name ORDER BY gross DESC LIMIT 5`,
      prisma.rfq.count({ where: { status: { in: ['OPEN', 'QUOTED'] } } }),
    ]);
    const [pendingSellers, pendingProducts, pendingOffers, pendingOrgs, returns, tickets, bankTransfers] = queues;
    res.json({
      metrics: {
        orders, awaitingPayment: awaiting, toShip, customers, activeSellers: sellers, activeRfqs: rfqs,
        paidGmvPaise: finance ? m(gmv._sum.totalPaise ?? 0) : null,
        averageOrderPaise: finance && gmv._count._all ? Math.round(m(gmv._sum.totalPaise) / gmv._count._all) : null,
        platformRevenuePaise: finance ? -m(commission._sum.amountPaise ?? 0) : null,
        demoGmvPaise: finance ? m(demoGmv._sum.totalPaise ?? 0) : null,
        refundsPendingPaise: finance ? m(refundsPending._sum.amountPaise ?? 0) : null,
        refundsPending: refundsPending._count._all,
        conversion: null, // needs storefront analytics; not estimated
      },
      queues: { sellers: pendingSellers, products: pendingProducts, offers: pendingOffers, organizations: pendingOrgs, returns, tickets, bankTransfers },
      series: [...Array(30)].map((_, i) => {
        const day = new Date(Date.now() + 5.5 * 3600_000 - (29 - i) * 86_400_000).toISOString().slice(0, 10);
        const row = series.find((s) => s.day === day);
        return { date: day, orders: row?.orders ?? 0, paidGmvPaise: finance ? Number(row?.gmv ?? 0) : null };
      }),
      statusMix: statusMix.map((s) => ({ value: s.status, count: s._count._all })),
      recentOrders: recent.map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, totalPaise: m(o.totalPaise), customer: o.user.name })),
      topSellers: top.map((t) => ({ id: t.id, name: t.name, grossPaise: finance ? Number(t.gross) : null })),
    });
  });

  // ───────────── People ─────────────
  app.get('/api/admin/users', requireStaff('users.view'), async (req, res) => {
    const paging = pageParams(req.query, { size: 50 });
    const q = String(req.query.q || '').trim();
    const where = {
      ...(q ? { OR: [{ name: ilike(q) }, { email: ilike(q) }, { phone: { contains: q } }] } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.type === 'staff' ? { roles: { some: {} } } : {}),
      ...(req.query.type === 'seller' ? { sellerMemberships: { some: {} } } : {}),
      ...(req.query.type === 'business' ? { orgMemberships: { some: {} } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: { roles: true, _count: { select: { orders: true, sellerMemberships: true, orgMemberships: true } } } }),
      prisma.user.count({ where }),
    ]);
    res.json({
      users: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, createdAt: u.createdAt, emailVerifiedAt: u.emailVerifiedAt, roles: u.roles.map((r) => r.role), locked: !!u.lockedUntil && u.lockedUntil > new Date(), orders: u._count.orders, stores: u._count.sellerMemberships, organizations: u._count.orgMemberships, guest: u.passwordHash === 'guest$unset' })),
      total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)),
    });
  });

  app.get('/api/admin/users/:id', requireStaff('users.view'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const u = await prisma.user.findUnique({
      where: { id },
      include: { roles: true, orgMemberships: { include: { organization: true } }, sellerMemberships: { include: { store: true } }, _count: { select: { addresses: true } } },
    });
    if (!u) throw new DomainError('User not found', 404);
    const [orders, tickets, activity] = await Promise.all([
      prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, createdAt: true, status: true, paymentStatus: true, totalPaise: true } }),
      prisma.supportTicket.findMany({ where: { userId: id }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, number: true, subject: true, status: true, updatedAt: true } }),
      prisma.auditLog.findMany({ where: { OR: [{ actorId: id }, { entityId: id }] }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    res.json({
      user: { id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, createdAt: u.createdAt, emailVerifiedAt: u.emailVerifiedAt, marketingOptIn: u.marketingOptIn, roles: u.roles.map((r) => r.role), locked: !!u.lockedUntil && u.lockedUntil > new Date(), addresses: u._count.addresses },
      organizations: u.orgMemberships.map((x) => ({ id: x.organization.id, name: x.organization.legalName, status: x.organization.status, role: x.role })),
      stores: u.sellerMemberships.map((x) => ({ id: x.store.id, name: x.store.name, status: x.store.status, role: x.role })),
      orders: orders.map((o) => ({ ...o, totalPaise: m(o.totalPaise) })), tickets, activity,
    });
  });

  app.patch('/api/admin/users/:id/status', requireStaff('users.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason }).parse(req.body);
    if (id === req.user.id) throw new DomainError('You can’t change the status of your own account', 409);
    await transaction(prisma, async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, include: { roles: true } });
      if (!u) throw new DomainError('User not found', 404);
      if (u.roles.length && !req.staffRoles.includes('ADMIN')) throw new DomainError('Only a Super Admin can suspend staff accounts', 403);
      await tx.user.update({ where: { id }, data: { status: input.status } });
      // Suspension signs the person out everywhere immediately.
      if (input.status === 'SUSPENDED') await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, { actorId: req.user.id, action: `user.${input.status.toLowerCase()}`, entityType: 'user', entityId: id, metadata: { reason: input.reason } });
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/unlock', requireStaff('users.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await prisma.user.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null } });
    await audit(prisma, { actorId: req.user.id, action: 'user.unlocked', entityType: 'user', entityId: id });
    res.json({ ok: true });
  });

  /** Grants or removes staff roles. Only a Super Admin can do this, and never on their own account. */
  app.put('/api/admin/users/:id/roles', requireStaff('staff.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { roles } = z.object({ roles: z.array(z.enum(Object.keys(staffRoles))).max(4) }).parse(req.body);
    if (id === req.user.id) throw new DomainError('You can’t change your own roles', 409);
    await transaction(prisma, async (tx) => {
      if (!await tx.user.findUnique({ where: { id } })) throw new DomainError('User not found', 404);
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (roles.length) await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, role, grantedBy: req.user.id })) });
      if (!(await tx.userRole.count({ where: { role: 'ADMIN' } }))) throw new DomainError('At least one Super Admin must remain', 409);
      await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, { actorId: req.user.id, action: 'user.roles-changed', entityType: 'user', entityId: id, metadata: { roles } });
    });
    res.json({ ok: true, roles });
  });

  app.get('/api/admin/staff', requireStaff('staff.manage'), async (_req, res) => {
    const rows = await prisma.userRole.findMany({ include: { user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: { createdAt: 'asc' } });
    const byUser = new Map();
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? { ...r.user, roles: [] };
      entry.roles.push(r.role);
      byUser.set(r.userId, entry);
    }
    res.json({ staff: [...byUser.values()], roles: Object.entries(staffRoles).map(([id, v]) => ({ id, ...v })) });
  });

  // ───────────── Business accounts ─────────────
  app.get('/api/admin/organizations', requireStaff('users.view'), async (req, res) => {
    const q = String(req.query.q || '').trim();
    const rows = await prisma.organization.findMany({
      where: { ...(q ? { OR: [{ legalName: ilike(q) }, { tradeName: ilike(q) }, { gstin: ilike(q) }] } : {}), ...(req.query.status ? { status: String(req.query.status) } : {}) },
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { members: { include: { user: { select: { name: true, email: true } } } }, verifications: true, _count: { select: { purchaseOrders: true, orders: true } } },
    });
    res.json({ organizations: rows.map((o) => ({ ...o, owner: o.members.find((x) => x.role === 'OWNER')?.user ?? null, memberCount: o.members.length, members: undefined, purchaseOrders: o._count.purchaseOrders, orders: o._count.orders })) });
  });

  app.patch('/api/admin/organizations/:id', requireStaff('approvals.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({
      status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']).optional(), note: z.string().trim().max(300).optional(),
      creditApproved: z.boolean().optional(), allowedTerms: z.enum(['PREPAID', 'NET_15', 'NET_30', 'NET_45']).optional(),
    }).parse(req.body);
    // Credit terms are a finance decision and are never granted automatically.
    if ((input.creditApproved !== undefined || input.allowedTerms) && !can(req.staffRoles, 'finance.manage')) throw new DomainError('Only finance can change credit terms', 403);
    await transaction(prisma, async (tx) => {
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
    });
    res.json({ ok: true });
  });

  // ───────────── Sellers ─────────────
  app.get('/api/admin/sellers', requireStaff('users.view'), async (req, res) => {
    const q = String(req.query.q || '').trim();
    const finance = can(req.staffRoles, 'finance.view');
    const rows = await prisma.sellerStore.findMany({
      where: { ...(q ? { OR: [{ name: ilike(q) }, { legalName: ilike(q) }, { gstin: ilike(q) }] } : {}), ...(req.query.status ? { status: String(req.query.status) } : {}) },
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { primaryCategory: true, payoutAccount: true, members: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { listings: true } } },
    });
    const balances = finance ? await prisma.settlementEntry.groupBy({ by: ['storeId'], where: { demo: false }, _sum: { amountPaise: true } }) : [];
    res.json({
      sellers: rows.map((s) => ({
        id: s.id, slug: s.slug, name: s.name, legalName: s.legalName, status: s.status, gstRegistered: s.gstRegistered, gstin: s.gstin, pan: s.pan, businessType: s.businessType,
        contactPhone: s.contactPhone, pickupAddress: s.pickupAddress, primaryCategory: s.primaryCategory?.name, createdAt: s.createdAt, description: s.description,
        owner: s.members.find((x) => x.role === 'OWNER')?.user ?? null, staff: s.members.length, listings: s._count.listings,
        payoutAccount: s.payoutAccount ? { accountHolder: s.payoutAccount.accountHolder, accountLast4: s.payoutAccount.accountLast4, ifsc: s.payoutAccount.ifsc, verified: s.payoutAccount.verified } : null,
        payablePaise: finance ? m(balances.find((b) => b.storeId === s.id)?._sum.amountPaise ?? 0) : null,
      })),
    });
  });

  app.patch('/api/admin/sellers/:id', requireStaff('approvals.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']).optional(), note: z.string().trim().max(300).optional(), payoutVerified: z.boolean().optional() }).parse(req.body);
    if (input.payoutVerified !== undefined && !can(req.staffRoles, 'finance.manage')) throw new DomainError('Only finance can verify bank accounts', 403);
    await transaction(prisma, async (tx) => {
      const store = await tx.sellerStore.findUnique({ where: { id } });
      if (!store) throw new DomainError('Seller not found', 404);
      if (input.status) await tx.sellerStore.update({ where: { id }, data: { status: input.status } });
      if (input.payoutVerified !== undefined) await tx.sellerPayoutAccount.update({ where: { storeId: id }, data: { verified: input.payoutVerified } });
      if (input.status) await notifyStoreOwners(tx, id, { title: `Store ${input.status.toLowerCase()}`, body: input.status === 'APPROVED' ? 'Your store is live. Add your first products to start selling.' : input.note || 'Please contact seller support for details.', link: '/seller' });
      await audit(tx, { actorId: req.user.id, action: 'store.updated', entityType: 'store', entityId: id, metadata: input });
    });
    res.json({ ok: true });
  });

  // ───────────── Catalogue: categories, tax classes, brands ─────────────
  const categoryInput = z.object({
    name: z.string().trim().min(2).max(60), description: z.string().trim().max(300).nullable(), imageUrl: z.string().max(300).nullable(),
    parentId: uuid.nullable(), taxClassId: uuid.nullable(), commissionBps: z.number().int().min(0).max(5000).nullable(),
    active: z.boolean(), sortOrder: z.number().int().min(0).max(1000),
  }).partial();

  app.get('/api/admin/categories', requireStaff('catalogue.manage'), async (_req, res) => {
    const [categories, taxClasses, counts, rules] = await Promise.all([
      prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { taxClass: true } }),
      prisma.taxClass.findMany({ orderBy: { gstRateBps: 'asc' } }),
      prisma.catalogProduct.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      prisma.commissionRule.findMany(),
    ]);
    res.json({
      categories: categories.map((c) => ({ ...c, products: counts.find((x) => x.categoryId === c.id)?._count._all ?? 0, commissionBps: rules.find((r) => r.categoryId === c.id)?.rateBps ?? null })),
      taxClasses,
      defaultCommissionBps: (await getSetting(prisma, 'commission')).rateBps,
    });
  });
  app.post('/api/admin/categories', requireStaff('catalogue.manage'), async (req, res) => {
    const input = categoryInput.required({ name: true }).parse(req.body);
    const { commissionBps, ...data } = input;
    const category = await transaction(prisma, async (tx) => {
      if (await tx.category.findFirst({ where: { OR: [{ name: { equals: input.name, mode: 'insensitive' } }, { slug: slugify(input.name) }] } })) throw new DomainError('A category with this name already exists', 409);
      const c = await tx.category.create({ data: { ...data, slug: slugify(input.name), sortOrder: input.sortOrder ?? await tx.category.count() } });
      if (commissionBps != null) await tx.commissionRule.create({ data: { categoryId: c.id, rateBps: commissionBps, updatedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'category.created', entityType: 'category', entityId: c.id });
      return c;
    });
    res.status(201).json({ category });
  });
  app.patch('/api/admin/categories/:id', requireStaff('catalogue.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = categoryInput.parse(req.body);
    const { commissionBps, ...data } = input;
    if (data.parentId === id) throw new DomainError('A category can’t be its own parent', 400);
    if (commissionBps !== undefined && !can(req.staffRoles, 'finance.manage') && !req.staffRoles.includes('ADMIN')) throw new DomainError('Only finance can change commission', 403);
    const category = await transaction(prisma, async (tx) => {
      if (data.name && await tx.category.findFirst({ where: { id: { not: id }, name: { equals: data.name, mode: 'insensitive' } } })) throw new DomainError('A category with this name already exists', 409);
      const c = await tx.category.update({ where: { id }, data: { ...data, ...(data.name ? { slug: slugify(data.name) } : {}) } });
      if (commissionBps === null) await tx.commissionRule.deleteMany({ where: { categoryId: id } });
      else if (commissionBps !== undefined) await tx.commissionRule.upsert({ where: { categoryId: id }, create: { categoryId: id, rateBps: commissionBps, updatedBy: req.user.id }, update: { rateBps: commissionBps, updatedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'category.updated', entityType: 'category', entityId: id, metadata: input });
      return c;
    });
    res.json({ category });
  });

  app.post('/api/admin/tax-classes', requireStaff('settings.manage'), async (req, res) => {
    const input = z.object({ code: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/), name: z.string().trim().min(3).max(80), gstRateBps: z.number().int().min(0).max(4000), cessRateBps: z.number().int().min(0).max(10000).default(0) }).parse(req.body);
    const taxClass = await prisma.taxClass.create({ data: input });
    await audit(prisma, { actorId: req.user.id, action: 'tax-class.created', entityType: 'tax_class', entityId: taxClass.id, metadata: input });
    res.status(201).json({ taxClass });
  });

  app.get('/api/admin/brands', requireStaff('catalogue.manage'), async (_req, res) => {
    const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });
    res.json({ brands: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, verified: b.verified, logoUrl: b.logoUrl, products: b._count.products })) });
  });
  app.patch('/api/admin/brands/:id', requireStaff('catalogue.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ name: z.string().trim().min(2).max(80), verified: z.boolean(), logoUrl: z.string().max(300).nullable() }).partial().parse(req.body);
    const brand = await prisma.brand.update({ where: { id }, data: { ...input, ...(input.name ? { slug: slugify(input.name) } : {}) } });
    await audit(prisma, { actorId: req.user.id, action: 'brand.updated', entityType: 'brand', entityId: id, metadata: input });
    res.json({ brand });
  });

  // ───────────── Moderation ─────────────
  app.get('/api/admin/moderation', requireStaff('catalogue.manage'), async (_req, res) => {
    const [productsPending, offersPending] = await Promise.all([
      prisma.catalogProduct.findMany({
        where: { status: { in: ['PENDING', 'CHANGES_REQUESTED'] } }, orderBy: { updatedAt: 'asc' }, take: 100,
        include: { brand: true, category: true, media: { orderBy: { sortOrder: 'asc' } }, attributes: { include: { attribute: true } }, variants: { include: { listings: { include: { store: { select: { name: true } }, tiers: true } } } } },
      }),
      loadListingsWhere(prisma, { status: 'PENDING', variant: { product: { status: 'APPROVED' } } }),
    ]);
    res.json({
      products: productsPending.map((p) => ({
        id: p.id, name: p.name, brand: p.brand.name, category: p.category.name, status: p.status, description: p.description, highlights: p.highlights, hsnCode: p.hsnCode, updatedAt: p.updatedAt,
        images: p.media.map((x) => x.url), specifications: p.attributes.map((a) => ({ name: a.attribute.name, value: a.value })),
        listings: p.variants.flatMap((v) => v.listings.map((l) => ({ id: l.id, variantLabel: v.label, seller: l.store.name, sku: l.sku, pricePaise: m(l.pricePaise), mrpPaise: m(l.mrpPaise), moq: l.moq, status: l.status }))),
      })),
      offers: offersPending.map((l) => ({ id: l.id, name: l.name, variantLabel: l.variantLabel, seller: l.sellerName, sku: l.sku, pricePaise: l.pricePaise, mrpPaise: l.mrpPaise, image: l.image, stock: l.stock })),
    });
  });

  /** Approve, reject or ask for changes on a new product (and the offers that came with it) or on a single offer. */
  app.post('/api/admin/moderation/:kind/:id', requireStaff('catalogue.manage'), async (req, res) => {
    const kind = z.enum(['product', 'listing']).parse(req.params.kind);
    const id = uuid.parse(req.params.id);
    const { decision, note } = z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']), note: z.string().trim().max(500).optional() }).parse(req.body);
    if (decision !== 'APPROVED' && !note) throw new DomainError('Tell the seller what to change', 400, { note: 'Please add a note for the seller' });
    await transaction(prisma, async (tx) => {
      if (kind === 'product') {
        const p = await tx.catalogProduct.findUnique({ where: { id }, include: { variants: { include: { listings: true } } } });
        if (!p) throw new DomainError('Product not found', 404);
        await tx.catalogProduct.update({ where: { id }, data: { status: decision } });
        const pendingListings = p.variants.flatMap((v) => v.listings).filter((l) => ['PENDING', 'CHANGES_REQUESTED'].includes(l.status));
        await tx.sellerListing.updateMany({ where: { id: { in: pendingListings.map((l) => l.id) } }, data: { status: decision, moderationNote: note ?? null } });
        for (const storeId of new Set(pendingListings.map((l) => l.storeId))) {
          await notifyStoreOwners(tx, storeId, { title: decision === 'APPROVED' ? 'Product approved' : decision === 'REJECTED' ? 'Product rejected' : 'Changes requested', body: `${p.name}${note ? `: ${note}` : ' is now live.'}`, link: '/seller/products' });
        }
      } else {
        const l = await tx.sellerListing.findUnique({ where: { id }, include: { variant: { include: { product: true } } } });
        if (!l) throw new DomainError('Listing not found', 404);
        await tx.sellerListing.update({ where: { id }, data: { status: decision, moderationNote: note ?? null } });
        await notifyStoreOwners(tx, l.storeId, { title: decision === 'APPROVED' ? 'Offer approved' : 'Offer needs attention', body: `${l.variant.product.name} (${l.variant.label})${note ? `: ${note}` : ' is now live.'}`, link: '/seller/products' });
      }
      await audit(tx, { actorId: req.user.id, action: `moderation.${kind}.${decision.toLowerCase()}`, entityType: kind, entityId: id, metadata: { note } });
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/products', requireStaff('catalogue.manage'), async (req, res) => {
    const paging = pageParams(req.query, { size: 50 });
    const q = String(req.query.q || '').trim();
    const where = {
      ...(q ? { OR: [{ name: ilike(q) }, { brand: { name: ilike(q) } }] } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.category ? { category: { slug: String(req.query.category) } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.catalogProduct.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: paging.skip, take: paging.take, include: { brand: true, category: true, media: { take: 1, orderBy: { sortOrder: 'asc' } }, _count: { select: { variants: true } } } }),
      prisma.catalogProduct.count({ where }),
    ]);
    res.json({ products: rows.map((p) => ({ id: p.id, slug: p.slug, name: p.name, brand: p.brand.name, category: p.category.name, status: p.status, featured: p.featured, demo: p.demo, image: p.media[0]?.url ?? null, variants: p._count.variants, updatedAt: p.updatedAt })), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });
  app.patch('/api/admin/products/:id', requireStaff('catalogue.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ featured: z.boolean().optional(), status: z.enum(['APPROVED', 'PAUSED', 'REJECTED']).optional(), taxClassId: uuid.nullable().optional(), hsnCode: z.string().regex(/^\d{4,8}$/).nullable().optional() }).parse(req.body);
    const p = await prisma.catalogProduct.findUnique({ where: { id } });
    if (!p) throw new DomainError('Product not found', 404);
    if (input.featured && (input.status ?? p.status) !== 'APPROVED') throw new DomainError('Only live products can be featured', 409);
    await prisma.catalogProduct.update({ where: { id }, data: input });
    await audit(prisma, { actorId: req.user.id, action: 'product.admin-updated', entityType: 'catalog_product', entityId: id, metadata: input });
    res.json({ ok: true });
  });

  app.get('/api/admin/inventory', requireStaff('catalogue.manage'), async (req, res) => {
    const { lowStockThreshold } = await getSetting(prisma, 'platform');
    const rows = await prisma.$queryRaw`
      SELECT l.id, l.sku, cp.name, v.label AS variant, s.name AS seller, b."onHand", b.reserved, (b."onHand" - b.reserved) AS available
      FROM seller_listings l JOIN inventory_balances b ON b."listingId" = l.id JOIN product_variants v ON v.id = l."variantId"
      JOIN catalog_products cp ON cp.id = v."catalogProductId" JOIN seller_stores s ON s.id = l."storeId"
      WHERE l.status = 'APPROVED' ${req.query.all === 'true' ? Prisma.empty : Prisma.sql`AND b."onHand" - b.reserved <= ${lowStockThreshold}`}
      ORDER BY available ASC, cp.name LIMIT 300`;
    res.json({ lowStockThreshold, items: rows });
  });

  app.get('/api/admin/meta', (req, res) => {
    if (!req.user || !req.staffRoles?.length) throw new DomainError('Staff access required', 403);
    res.json({ roles: req.staffRoles, staffRoles, isStaff: req.staffRoles.some(isStaffRole) });
  });
}
