// Admin: dashboard, global search, internal notes and analytics (with comparison to the previous period and Excel export).
import { z } from 'zod';
import { DomainError, indianStates } from '../../../../../packages/shared/src/index.js';
import { requireStaff } from '../../http/middleware.js';
import { toPaise, Prisma } from '../../lib/db.js';
import { audit } from '../../lib/audit.js';
import { ilike, toCsv } from '../../lib/http.js';
import { getSetting } from '../../services/settings.js';
import { buildXlsx } from '../../lib/xlsx.js';

const m = toPaise;
const n = (v) => Number(v ?? 0);
const DAY = 86_400_000;
const IST = 5.5 * 3600_000;
const istDate = (d) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const istStart = (day) => new Date(`${day}T00:00:00+05:30`);
const pct = (now, before) => (before ? Math.round(((now - before) / before) * 1000) / 10 : now ? null : 0);
const rupees = (p) => Math.round(n(p)) / 100;

export const NOTE_ENTITIES = ['user', 'organization', 'store', 'order', 'product'];

/** Resolves the analytics window (India time) and the equally long period right before it. */
export function analyticsWindow(query) {
  const input = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), mode: z.enum(['RETAIL', 'BUSINESS']).optional() }).parse(query);
  const toDay = input.to ?? istDate(new Date());
  const fromDay = input.from ?? istDate(new Date(istStart(toDay).getTime() - 29 * DAY));
  const from = istStart(fromDay);
  const to = new Date(istStart(toDay).getTime() + DAY);
  if (to <= from) throw new DomainError('The start date must be before the end date', 400, { from: 'Must be before the end date' });
  const days = Math.round((to - from) / DAY);
  if (days > 731) throw new DomainError('Choose a range of at most two years', 400, { from: 'Range too long' });
  return { fromDay, toDay, from, to, days, prevFrom: new Date(from.getTime() - days * DAY), prevTo: from, mode: input.mode ?? null };
}

export function registerAdminInsights(app, { prisma }) {
  // ───────────── Dashboard ─────────────
  app.get('/api/admin/dashboard', requireStaff('dashboard'), async (req, res) => {
    const finance = req.can('finance.view');
    const since = new Date(Date.now() - 30 * DAY);
    const confirmed = { status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } };
    const [orders, awaiting, toShip, customers, sellers, gmv, demoGmv, commission, refundsPending, queues, series, statusMix, recent, top, rfqs, lowStock] = await Promise.all([
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
      getSetting(prisma, 'platform').then(({ lowStockThreshold }) => prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM inventory_balances b JOIN seller_listings l ON l.id = b."listingId" WHERE l.status = 'APPROVED' AND b."onHand" - b.reserved <= ${lowStockThreshold}`),
    ]);
    const [pendingSellers, pendingProducts, pendingOffers, pendingOrgs, returns, tickets, bankTransfers] = queues;
    res.json({
      metrics: {
        orders, awaitingPayment: awaiting, toShip, customers, activeSellers: sellers, activeRfqs: rfqs, lowStock: lowStock[0]?.c ?? 0,
        paidGmvPaise: finance ? m(gmv._sum.totalPaise ?? 0) : null,
        averageOrderPaise: finance && gmv._count._all ? Math.round(m(gmv._sum.totalPaise) / gmv._count._all) : null,
        platformRevenuePaise: finance ? -m(commission._sum.amountPaise ?? 0) : null,
        demoGmvPaise: finance ? m(demoGmv._sum.totalPaise ?? 0) : null,
        refundsPendingPaise: finance ? m(refundsPending._sum.amountPaise ?? 0) : null,
        refundsPending: refundsPending._count._all,
        conversion: null, // needs storefront visit tracking; never estimated
      },
      queues: { sellers: pendingSellers, products: pendingProducts, offers: pendingOffers, organizations: pendingOrgs, returns, tickets, bankTransfers },
      series: [...Array(30)].map((_, i) => {
        const day = istDate(new Date(Date.now() - (29 - i) * DAY));
        const row = series.find((s) => s.day === day);
        return { date: day, orders: row?.orders ?? 0, paidGmvPaise: finance ? n(row?.gmv) : null };
      }),
      statusMix: statusMix.map((s) => ({ value: s.status, count: s._count._all })),
      recentOrders: recent.map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, totalPaise: m(o.totalPaise), customer: o.user.name })),
      topSellers: top.map((t) => ({ id: t.id, name: t.name, grossPaise: finance ? n(t.gross) : null })),
    });
  });

  // ───────────── Summary cards (counts by status, new in the last 7 days, 14-day trend) ─────────────
  const SUMMARIES = {
    users: { cap: 'users.view', table: 'users', where: Prisma.sql`NOT demo`, statuses: {
      ACTIVE: Prisma.sql`status = 'ACTIVE'`, UNCONFIRMED: Prisma.sql`"emailVerifiedAt" IS NULL AND status = 'ACTIVE'`, LOCKED: Prisma.sql`"lockedUntil" > now()`, SUSPENDED: Prisma.sql`status = 'SUSPENDED'`,
    } },
    sellers: { cap: 'users.view', table: 'seller_stores', where: Prisma.sql`TRUE`, statuses: Object.fromEntries(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((s) => [s, Prisma.sql`status::text = ${s}`])) },
    organizations: { cap: 'users.view', table: 'organizations', where: Prisma.sql`TRUE`, statuses: Object.fromEntries(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((s) => [s, Prisma.sql`status::text = ${s}`])) },
    orders: { cap: 'orders.view', table: 'orders', where: Prisma.sql`TRUE`, statuses: Object.fromEntries(['AWAITING_PAYMENT', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((s) => [s, s === 'SHIPPED' ? Prisma.sql`status::text IN ('SHIPPED','PARTIALLY_SHIPPED')` : Prisma.sql`status::text = ${s}`])) },
  };
  app.get('/api/admin/summary/:kind', requireStaff('dashboard'), async (req, res) => {
    const s = SUMMARIES[req.params.kind];
    if (!s) throw new DomainError('Unknown summary', 404);
    if (!req.can(s.cap)) throw new DomainError('Your staff role doesn’t include this', 403);
    const since = new Date(Date.now() - 14 * DAY);
    const week = new Date(Date.now() - 7 * DAY);
    const table = Prisma.raw(s.table);
    const groups = { ALL: Prisma.sql`TRUE`, ...s.statuses };
    const out = {};
    await Promise.all(Object.entries(groups).map(async ([key, cond]) => {
      const [[totals], daily] = await Promise.all([
        prisma.$queryRaw`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "createdAt" >= ${week})::int AS recent FROM ${table} WHERE ${s.where} AND ${cond}`,
        prisma.$queryRaw`SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n FROM ${table} WHERE ${s.where} AND ${cond} AND "createdAt" >= ${since} GROUP BY 1`,
      ]);
      const byDay = new Map(daily.map((d) => [d.day, d.n]));
      out[key] = { total: totals.total, last7: totals.recent, series: [...Array(14)].map((_, i) => byDay.get(istDate(new Date(Date.now() - (13 - i) * DAY))) ?? 0) };
    }));
    // People are also split by type for the tabs.
    if (req.params.kind === 'users') {
      const [t] = await prisma.$queryRaw`SELECT
        COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r."userId" = u.id) AND NOT EXISTS (SELECT 1 FROM seller_members m WHERE m."userId" = u.id) AND NOT EXISTS (SELECT 1 FROM organization_members o WHERE o."userId" = u.id))::int AS customer,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM organization_members o WHERE o."userId" = u.id))::int AS business,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM seller_members m WHERE m."userId" = u.id))::int AS seller,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_roles r WHERE r."userId" = u.id))::int AS staff,
        COUNT(*) FILTER (WHERE u."passwordHash" = 'guest$unset')::int AS guest
        FROM users u WHERE NOT u.demo`;
      out.types = t;
    }
    res.json(out);
  });

  /** What needs a staff member's attention, limited to what their role can act on. Drives the bell in the console. */
  app.get('/api/admin/attention', async (req, res) => {
    if (!req.user) throw new DomainError('Please sign in to continue', 401);
    if (!req.staffRoles.length) throw new DomainError('Staff access required', 403);
    const items = [];
    const add = async (cap, label, href, count) => { if (req.can(cap)) { const n = await count(); if (n) items.push({ label, href, count: n }); } };
    await Promise.all([
      add('approvals.manage', 'seller applications', '/admin/sellers?status=PENDING', () => prisma.sellerStore.count({ where: { status: 'PENDING' } })),
      add('approvals.manage', 'business accounts to verify', '/admin/organizations?status=PENDING', () => prisma.organization.count({ where: { status: 'PENDING' } })),
      add('catalogue.manage', 'products to review', '/admin/moderation', () => prisma.catalogProduct.count({ where: { status: 'PENDING' } })),
      add('returns.manage', 'return requests', '/admin/returns?status=REQUESTED', () => prisma.returnRequest.count({ where: { status: 'REQUESTED' } })),
      add('support.manage', 'open support tickets', '/admin/support', () => prisma.supportTicket.count({ where: { status: 'OPEN' } })),
      add('finance.manage', 'refunds to pay', '/admin/refunds?status=PENDING_PROVIDER', () => prisma.refund.count({ where: { status: 'PENDING_PROVIDER' } })),
      add('finance.manage', 'bank transfers to match', '/admin/orders?payment=BANK_TRANSFER_PENDING', () => prisma.order.count({ where: { paymentStatus: 'BANK_TRANSFER_PENDING', status: 'AWAITING_PAYMENT' } })),
    ]);
    const unread = await prisma.notification.count({ where: { userId: req.user.id, read: false } });
    res.json({ items, total: items.reduce((s, i) => s + i.count, 0), unread });
  });

  // ───────────── Global search ─────────────
  app.get('/api/admin/search', requireStaff('dashboard'), async (req, res) => {
    const q = z.string().trim().min(2, 'Type at least 2 characters').max(100).parse(req.query.q ?? '');
    const take = 6;
    const tasks = {
      users: req.can('users.view') && prisma.user.findMany({ where: { OR: [{ name: ilike(q) }, { email: ilike(q) }, { phone: { contains: q } }] }, take, select: { id: true, name: true, email: true, status: true } }),
      orders: req.can('orders.view') && prisma.order.findMany({ where: { OR: [{ number: ilike(q) }, { paymentRef: ilike(q) }] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, totalPaise: true, createdAt: true, user: { select: { name: true } } } }),
      sellers: req.can('approvals.manage') && prisma.sellerStore.findMany({ where: { OR: [{ name: ilike(q) }, { legalName: ilike(q) }, { gstin: ilike(q) }] }, take, select: { id: true, name: true, status: true, gstin: true } }),
      organizations: req.can('approvals.manage') && prisma.organization.findMany({ where: { OR: [{ legalName: ilike(q) }, { tradeName: ilike(q) }, { gstin: ilike(q) }] }, take, select: { id: true, legalName: true, status: true, gstin: true } }),
      products: req.can('catalogue.manage') && prisma.catalogProduct.findMany({ where: { OR: [{ name: ilike(q) }, { variants: { some: { listings: { some: { sku: ilike(q) } } } } }] }, take, select: { id: true, name: true, status: true, brand: { select: { name: true } } } }),
      tickets: req.can('support.manage') && prisma.supportTicket.findMany({ where: { OR: [{ number: ilike(q) }, { subject: ilike(q) }] }, take, orderBy: { updatedAt: 'desc' }, select: { id: true, number: true, subject: true, status: true } }),
      coupons: req.can('promotions.manage') && prisma.coupon.findMany({ where: { code: ilike(q) }, take, select: { id: true, code: true, active: true, description: true } }),
    };
    const entries = await Promise.all(Object.entries(tasks).map(async ([k, p]) => [k, p ? await p : []]));
    const results = Object.fromEntries(entries);
    results.orders = results.orders.map((o) => ({ ...o, totalPaise: m(o.totalPaise), customer: o.user.name, user: undefined }));
    results.products = results.products.map((p) => ({ ...p, brand: p.brand.name }));
    res.json({ q, results, total: Object.values(results).reduce((s, r) => s + r.length, 0) });
  });

  // ───────────── Internal notes (staff-only; never shown to customers or sellers) ─────────────
  const noteRef = z.object({ entityType: z.enum(NOTE_ENTITIES), entityId: z.string().trim().min(1).max(64) });
  app.get('/api/admin/notes', requireStaff('dashboard'), async (req, res) => {
    const ref = noteRef.parse(req.query);
    res.json({ notes: await prisma.adminNote.findMany({ where: ref, orderBy: { createdAt: 'desc' }, take: 100 }) });
  });
  app.post('/api/admin/notes', requireStaff('dashboard'), async (req, res) => {
    const input = noteRef.extend({ body: z.string().trim().min(2, 'Write a note').max(2000) }).parse(req.body);
    const note = await prisma.adminNote.create({ data: { ...input, authorId: req.user.id, authorName: req.user.name } });
    await audit(prisma, { actorId: req.user.id, action: 'note.added', entityType: input.entityType, entityId: input.entityId });
    res.status(201).json({ note });
  });
  app.delete('/api/admin/notes/:id', requireStaff('dashboard'), async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const note = await prisma.adminNote.findUnique({ where: { id } });
    if (!note) throw new DomainError('Note not found', 404);
    if (note.authorId !== req.user.id && !req.staffRoles.includes('ADMIN')) throw new DomainError('Only the author or the Admin can remove a note', 403);
    await prisma.adminNote.delete({ where: { id } });
    await audit(prisma, { actorId: req.user.id, action: 'note.removed', entityType: note.entityType, entityId: note.entityId });
    res.json({ ok: true });
  });

  // ───────────── Analytics ─────────────
  async function analytics(w, { finance }) {
    const modeSql = w.mode ? Prisma.sql`AND o.mode::text = ${w.mode}` : Prisma.empty;
    // "Placed" = a real order the customer committed to: paid, COD, or on credit terms. Demo and never-paid orders are excluded.
    const placed = (from, to) => Prisma.sql`NOT o.demo AND o."paymentStatus" NOT IN ('UNPAID','BANK_TRANSFER_PENDING','DEMO_SIMULATED') AND o."createdAt" >= ${from} AND o."createdAt" < ${to} ${modeSql}`;
    const everPlaced = Prisma.sql`NOT o.demo AND o."paymentStatus" NOT IN ('UNPAID','BANK_TRANSFER_PENDING','DEMO_SIMULATED') AND o.status <> 'CANCELLED' ${modeSql}`;

    async function summary(from, to) {
      const [[a], [b], [c], [d], [r], [cm], [nc]] = await Promise.all([
        prisma.$queryRaw`SELECT COUNT(DISTINCT o.id) FILTER (WHERE so.status <> 'CANCELLED')::int AS orders,
            COALESCE(SUM(so."totalPaise") FILTER (WHERE so.status <> 'CANCELLED'), 0)::bigint AS gmv,
            COUNT(DISTINCT o."userId") FILTER (WHERE so.status <> 'CANCELLED')::int AS customers,
            COUNT(*)::int AS parcels, COUNT(*) FILTER (WHERE so.status = 'CANCELLED')::int AS "cancelledParcels"
          FROM orders o JOIN seller_orders so ON so."orderId" = o.id WHERE ${placed(from, to)}`,
        prisma.$queryRaw`SELECT COALESCE(SUM(oi.quantity), 0)::int AS units FROM order_items oi JOIN seller_orders so ON so.id = oi."sellerOrderId" JOIN orders o ON o.id = oi."orderId"
          WHERE ${placed(from, to)} AND so.status <> 'CANCELLED'`,
        prisma.$queryRaw`SELECT COALESCE(SUM(o."discountPaise"), 0)::bigint AS discount, COALESCE(SUM(o."taxPaise"), 0)::bigint AS tax FROM orders o WHERE ${placed(from, to)} AND o.status <> 'CANCELLED'`,
        prisma.$queryRaw`SELECT COUNT(*)::int AS returns FROM returns r JOIN orders o ON o.id = r."orderId" WHERE NOT o.demo AND r."createdAt" >= ${from} AND r."createdAt" < ${to} ${modeSql}`,
        prisma.$queryRaw`SELECT COALESCE(SUM(rf."amountPaise"), 0)::bigint AS refunds, COUNT(*)::int AS count FROM refunds rf JOIN orders o ON o.id = rf."orderId" WHERE rf.status <> 'DEMO_SIMULATED' AND NOT o.demo AND rf."createdAt" >= ${from} AND rf."createdAt" < ${to} ${modeSql}`,
        prisma.$queryRaw`SELECT COALESCE(-SUM(e."amountPaise"), 0)::bigint AS commission FROM settlement_entries e JOIN orders o ON o.id = e."orderId" WHERE e.kind IN ('COMMISSION','COMMISSION_REVERSAL') AND NOT e.demo AND e."createdAt" >= ${from} AND e."createdAt" < ${to} ${modeSql}`,
        prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM (SELECT o."userId", MIN(o."createdAt") AS first FROM orders o WHERE ${everPlaced} GROUP BY o."userId") t WHERE t.first >= ${from} AND t.first < ${to}`,
      ]);
      const orders = a.orders; const gmv = n(a.gmv);
      return {
        orders, gmvPaise: gmv, averageOrderPaise: orders ? Math.round(gmv / orders) : 0, units: b.units, customers: a.customers, newCustomers: nc.c, returningCustomers: Math.max(0, a.customers - nc.c),
        discountPaise: n(c.discount), taxPaise: n(c.tax), parcels: a.parcels, cancelledParcels: a.cancelledParcels, cancellationRate: a.parcels ? Math.round((a.cancelledParcels / a.parcels) * 1000) / 10 : 0,
        returns: d.returns, refunds: r.count, refundsPaise: finance ? n(r.refunds) : null, commissionPaise: finance ? n(cm.commission) : null,
      };
    }

    const P = placed(w.from, w.to);
    const { lowStockThreshold } = await getSetting(prisma, 'platform');
    const [current, previous, daily, modes, categories, sellers, sellerReturns, states, topProducts, returned, lowStock, neverSold, topCustomers, paymentMix, intents, expired, hsn, statement, funnel] = await Promise.all([
      summary(w.from, w.to),
      summary(w.prevFrom, w.prevTo),
      prisma.$queryRaw`SELECT to_char(date_trunc('day', o."createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day, COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(so."totalPaise"), 0)::bigint AS gmv
        FROM orders o JOIN seller_orders so ON so."orderId" = o.id WHERE ${P} AND so.status <> 'CANCELLED' GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw`SELECT o.mode::text AS mode, COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(so."totalPaise"), 0)::bigint AS gmv, COUNT(DISTINCT o."userId")::int AS customers
        FROM orders o JOIN seller_orders so ON so."orderId" = o.id WHERE ${P} AND so.status <> 'CANCELLED' GROUP BY 1`,
      prisma.$queryRaw`SELECT COALESCE(c.name, 'Uncategorised') AS name, COALESCE(SUM(oi."totalPaise"), 0)::bigint AS gmv, COALESCE(SUM(oi.quantity), 0)::int AS units, COUNT(DISTINCT o.id)::int AS orders
        FROM order_items oi JOIN orders o ON o.id = oi."orderId" JOIN seller_orders so ON so.id = oi."sellerOrderId"
        LEFT JOIN catalog_products cp ON cp.id = oi."catalogProductId" LEFT JOIN categories c ON c.id = cp."categoryId"
        WHERE ${P} AND so.status <> 'CANCELLED' GROUP BY 1 ORDER BY gmv DESC LIMIT 25`,
      prisma.$queryRaw`SELECT s.id, s.name, COUNT(so.id)::int AS parcels,
          COALESCE(SUM(so."totalPaise") FILTER (WHERE so.status <> 'CANCELLED'), 0)::bigint AS gmv,
          COUNT(*) FILTER (WHERE so.status = 'DELIVERED')::int AS delivered, COUNT(*) FILTER (WHERE so.status = 'CANCELLED')::int AS cancelled,
          COUNT(*) FILTER (WHERE so.status IN ('PENDING','PACKED'))::int AS open,
          ROUND(AVG(EXTRACT(EPOCH FROM (sh.first - so."createdAt")) / 3600)::numeric, 1)::float AS "dispatchHours"
        FROM seller_orders so JOIN orders o ON o.id = so."orderId" JOIN seller_stores s ON s.id = so."storeId"
        LEFT JOIN LATERAL (SELECT MIN(x."createdAt") AS first FROM shipments x WHERE x."sellerOrderId" = so.id) sh ON true
        WHERE ${P} GROUP BY s.id, s.name ORDER BY gmv DESC LIMIT 50`,
      prisma.$queryRaw`SELECT so."storeId" AS id, COUNT(*)::int AS returns FROM returns r JOIN seller_orders so ON so.id = r."sellerOrderId" JOIN orders o ON o.id = r."orderId" WHERE ${P} GROUP BY 1`,
      prisma.$queryRaw`SELECT COALESCE(o."shippingAddress"->>'state', o."placeOfSupply") AS state, COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(so."totalPaise"), 0)::bigint AS gmv
        FROM orders o JOIN seller_orders so ON so."orderId" = o.id WHERE ${P} AND so.status <> 'CANCELLED' GROUP BY 1 ORDER BY gmv DESC LIMIT 40`,
      prisma.$queryRaw`SELECT oi."catalogProductId" AS id, MAX(oi.name) AS name, COALESCE(SUM(oi.quantity), 0)::int AS units, COALESCE(SUM(oi."totalPaise"), 0)::bigint AS gmv, COUNT(DISTINCT o.id)::int AS orders
        FROM order_items oi JOIN orders o ON o.id = oi."orderId" JOIN seller_orders so ON so.id = oi."sellerOrderId"
        WHERE ${P} AND so.status <> 'CANCELLED' GROUP BY 1 ORDER BY gmv DESC LIMIT 15`,
      prisma.$queryRaw`SELECT oi."catalogProductId" AS id, MAX(oi.name) AS name, COALESCE(SUM(ri.quantity), 0)::int AS returned,
          (SELECT COALESCE(SUM(x.quantity), 0) FROM order_items x JOIN orders o ON o.id = x."orderId" WHERE x."catalogProductId" = oi."catalogProductId" AND ${P})::int AS sold
        FROM return_items ri JOIN returns r ON r.id = ri."returnId" JOIN order_items oi ON oi.id = ri."orderItemId" JOIN orders o2 ON o2.id = r."orderId"
        WHERE r.status <> 'REJECTED' AND NOT o2.demo AND r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to} GROUP BY 1 ORDER BY returned DESC LIMIT 15`,
      prisma.$queryRaw`SELECT l.id, l.sku, cp.id AS "productId", cp.name, v.label AS variant, s.name AS seller, (b."onHand" - b.reserved)::int AS available
        FROM seller_listings l JOIN inventory_balances b ON b."listingId" = l.id JOIN product_variants v ON v.id = l."variantId" JOIN catalog_products cp ON cp.id = v."catalogProductId" JOIN seller_stores s ON s.id = l."storeId"
        WHERE l.status = 'APPROVED' AND b."onHand" - b.reserved <= ${lowStockThreshold} ORDER BY available ASC, cp.name LIMIT 20`,
      prisma.$queryRaw`SELECT cp.id, cp.name, cp."createdAt", br.name AS brand, (SELECT COUNT(*) FROM product_variants v JOIN seller_listings l ON l."variantId" = v.id WHERE v."catalogProductId" = cp.id AND l.status = 'APPROVED')::int AS offers
        FROM catalog_products cp JOIN brands br ON br.id = cp."brandId"
        WHERE cp.status = 'APPROVED' AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi."orderId" WHERE oi."catalogProductId" = cp.id AND ${everPlaced})
        ORDER BY cp."createdAt" ASC LIMIT 20`,
      prisma.$queryRaw`SELECT u.id, u.name, u.email, COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(so."totalPaise"), 0)::bigint AS gmv, MAX(o."createdAt") AS "lastOrderAt"
        FROM orders o JOIN seller_orders so ON so."orderId" = o.id JOIN users u ON u.id = o."userId" WHERE ${P} AND so.status <> 'CANCELLED' GROUP BY u.id, u.name, u.email ORDER BY gmv DESC LIMIT 15`,
      prisma.$queryRaw`SELECT o."paymentMethod"::text AS method, COUNT(*)::int AS orders, COALESCE(SUM(o."totalPaise"), 0)::bigint AS gmv FROM orders o WHERE ${P} AND o.status <> 'CANCELLED' GROUP BY 1 ORDER BY orders DESC`,
      prisma.$queryRaw`SELECT pi.status::text AS status, COUNT(*)::int AS count FROM payment_intents pi JOIN orders o ON o.id = pi."orderId" WHERE NOT o.demo AND pi."createdAt" >= ${w.from} AND pi."createdAt" < ${w.to} ${modeSql} GROUP BY 1`,
      prisma.$queryRaw`SELECT COUNT(*) FILTER (WHERE o."paymentMethod" = 'ONLINE')::int AS online, COUNT(*) FILTER (WHERE o."paymentMethod" = 'ONLINE' AND o.status = 'CANCELLED' AND o."paymentStatus" = 'UNPAID')::int AS abandoned
        FROM orders o WHERE NOT o.demo AND o."createdAt" >= ${w.from} AND o."createdAt" < ${w.to} ${modeSql}`,
      finance ? prisma.$queryRaw`SELECT COALESCE(oi."hsnCode", 'Not set') AS hsn, oi."taxRateBps" AS "rateBps", COALESCE(SUM(oi.quantity), 0)::int AS quantity,
          COALESCE(SUM(oi."taxablePaise"), 0)::bigint AS taxable, COALESCE(SUM(oi."cgstPaise"), 0)::bigint AS cgst, COALESCE(SUM(oi."sgstPaise"), 0)::bigint AS sgst, COALESCE(SUM(oi."igstPaise"), 0)::bigint AS igst, COALESCE(SUM(oi."totalPaise"), 0)::bigint AS total
        FROM order_items oi JOIN orders o ON o.id = oi."orderId" JOIN seller_orders so ON so.id = oi."sellerOrderId" WHERE ${P} AND so.status <> 'CANCELLED' GROUP BY 1, 2 ORDER BY total DESC` : [],
      finance ? prisma.$queryRaw`SELECT s.id, s.name, e.kind::text AS kind, COALESCE(SUM(e."amountPaise"), 0)::bigint AS amount
        FROM settlement_entries e JOIN seller_stores s ON s.id = e."storeId" WHERE NOT e.demo AND e."createdAt" >= ${w.from} AND e."createdAt" < ${w.to} GROUP BY 1, 2, 3` : [],
      w.mode === 'RETAIL' ? [] : prisma.$queryRaw`SELECT
          (SELECT COUNT(*) FROM rfqs r WHERE r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to})::int AS rfqs,
          (SELECT COUNT(DISTINCT qr."rfqId") FROM quotation_requests qr JOIN quotations q ON q."requestId" = qr.id JOIN rfqs r ON r.id = qr."rfqId" WHERE q.status NOT IN ('REQUESTED') AND r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to})::int AS quoted,
          (SELECT COUNT(DISTINCT qr."rfqId") FROM quotation_requests qr JOIN quotations q ON q."requestId" = qr.id JOIN rfqs r ON r.id = qr."rfqId" WHERE q.status = 'ACCEPTED' AND r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to})::int AS accepted,
          (SELECT COUNT(*) FROM purchase_orders p WHERE p."createdAt" >= ${w.from} AND p."createdAt" < ${w.to})::int AS "purchaseOrders",
          (SELECT COUNT(*) FROM purchase_orders p WHERE p.status IN ('APPROVED','CONFIRMED_BY_SELLER','ORDERED') AND p."createdAt" >= ${w.from} AND p."createdAt" < ${w.to})::int AS approved,
          (SELECT COUNT(*) FROM purchase_orders p WHERE p.status = 'ORDERED' AND p."createdAt" >= ${w.from} AND p."createdAt" < ${w.to})::int AS ordered,
          (SELECT COALESCE(SUM(p."totalPaise"), 0) FROM purchase_orders p WHERE p.status = 'ORDERED' AND p."createdAt" >= ${w.from} AND p."createdAt" < ${w.to})::bigint AS "orderedValue"`,
    ]);

    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = [...Array(w.days)].map((_, i) => {
      const day = istDate(new Date(w.from.getTime() + i * DAY));
      const row = byDay.get(day);
      return { date: day, orders: row?.orders ?? 0, gmvPaise: n(row?.gmv) };
    });
    const change = Object.fromEntries(Object.keys(current).filter((k) => typeof current[k] === 'number').map((k) => [k, pct(current[k], previous[k] ?? 0)]));
    const returnsBy = new Map(sellerReturns.map((r) => [r.id, r.returns]));
    const statementRows = new Map();
    for (const e of statement) {
      const row = statementRows.get(e.id) ?? { storeId: e.id, seller: e.name, salesPaise: 0, shippingPaise: 0, commissionPaise: 0, refundsPaise: 0, payoutsPaise: 0, netPaise: 0 };
      const amt = n(e.amount);
      if (e.kind === 'SALE') row.salesPaise += amt;
      else if (e.kind === 'SHIPPING_FEE') row.shippingPaise += amt;
      else if (e.kind === 'COMMISSION' || e.kind === 'COMMISSION_REVERSAL') row.commissionPaise += -amt;
      else if (e.kind === 'REFUND_ADJUSTMENT') row.refundsPaise += -amt;
      else if (e.kind === 'PAYOUT') row.payoutsPaise += -amt;
      if (e.kind !== 'PAYOUT') row.netPaise += amt;
      statementRows.set(e.id, row);
    }
    const captured = intents.find((i) => i.status === 'CAPTURED')?.count ?? 0;
    const failed = intents.find((i) => i.status === 'FAILED')?.count ?? 0;
    const f = funnel[0];

    return {
      window: { from: w.fromDay, to: w.toDay, days: w.days, previousFrom: istDate(w.prevFrom), previousTo: istDate(new Date(w.prevTo.getTime() - 1)), mode: w.mode },
      definitions: 'Placed orders only: paid online, cash on delivery or business credit terms. Demo data, unpaid and expired orders are excluded. Sales are parcel totals including GST and delivery, excluding cancelled parcels.',
      summary: current, previous, change, series,
      modes: ['RETAIL', 'BUSINESS'].map((mode) => { const r = modes.find((x) => x.mode === mode); return { mode, orders: r?.orders ?? 0, gmvPaise: n(r?.gmv), customers: r?.customers ?? 0 }; }),
      categories: categories.map((c) => ({ name: c.name, gmvPaise: n(c.gmv), units: c.units, orders: c.orders })),
      sellers: sellers.map((s) => ({ id: s.id, name: s.name, parcels: s.parcels, gmvPaise: n(s.gmv), delivered: s.delivered, cancelled: s.cancelled, open: s.open, cancellationRate: s.parcels ? Math.round((s.cancelled / s.parcels) * 1000) / 10 : 0, returns: returnsBy.get(s.id) ?? 0, dispatchHours: s.dispatchHours })),
      states: states.map((s) => ({ state: indianStates.find((x) => x.code === s.state)?.name ?? s.state ?? 'Unknown', orders: s.orders, gmvPaise: n(s.gmv) })),
      products: {
        top: topProducts.map((p) => ({ id: p.id, name: p.name, units: p.units, gmvPaise: n(p.gmv), orders: p.orders })),
        mostReturned: returned.map((p) => ({ id: p.id, name: p.name, returned: p.returned, sold: p.sold, returnRate: p.sold ? Math.round((p.returned / p.sold) * 1000) / 10 : null })),
        lowStock: { threshold: lowStockThreshold, items: lowStock },
        neverSold,
      },
      customers: {
        new: current.newCustomers, returning: current.returningCustomers,
        top: topCustomers.map((c) => ({ id: c.id, name: c.name, email: c.email, orders: c.orders, gmvPaise: n(c.gmv), lastOrderAt: c.lastOrderAt })),
      },
      payments: {
        mix: paymentMix.map((p) => ({ method: p.method, orders: p.orders, gmvPaise: n(p.gmv) })),
        attempts: { captured, failed, failureRate: captured + failed ? Math.round((failed / (captured + failed)) * 1000) / 10 : null },
        abandoned: { onlineOrders: expired[0]?.online ?? 0, unpaidExpired: expired[0]?.abandoned ?? 0, rate: expired[0]?.online ? Math.round((expired[0].abandoned / expired[0].online) * 1000) / 10 : null },
      },
      gst: finance ? hsn.map((h) => ({ hsn: h.hsn, rateBps: h.rateBps, quantity: h.quantity, taxablePaise: n(h.taxable), cgstPaise: n(h.cgst), sgstPaise: n(h.sgst), igstPaise: n(h.igst), totalPaise: n(h.total) })) : null,
      settlements: finance ? [...statementRows.values()].sort((a, b) => b.salesPaise - a.salesPaise) : null,
      b2bFunnel: f ? { rfqs: f.rfqs, quoted: f.quoted, accepted: f.accepted, purchaseOrders: f.purchaseOrders, approved: f.approved, ordered: f.ordered, orderedValuePaise: n(f.orderedValue) } : null,
      conversion: { available: false, reason: 'Visitor-to-order conversion needs storefront visit tracking, which isn’t switched on. It is never estimated.' },
    };
  }

  app.get('/api/admin/analytics', requireStaff('reports.view'), async (req, res) => {
    const w = analyticsWindow(req.query);
    res.json(await analytics(w, { finance: req.can('finance.view') }));
  });

  /** The same analytics as an Excel workbook (one sheet per section) or a CSV of one section. */
  app.get('/api/admin/analytics/export', requireStaff('reports.view'), async (req, res) => {
    const w = analyticsWindow(req.query);
    const { format, section } = z.object({ format: z.enum(['xlsx', 'csv']).default('xlsx'), section: z.string().max(40).optional() }).parse(req.query);
    const a = await analytics(w, { finance: req.can('finance.view') });
    const s = a.summary; const p = a.previous;
    const sheets = [
      { key: 'summary', name: 'Summary', rows: [
        ['Orders', s.orders, p.orders], ['Sales (₹)', rupees(s.gmvPaise), rupees(p.gmvPaise)], ['Average order (₹)', rupees(s.averageOrderPaise), rupees(p.averageOrderPaise)],
        ['Units sold', s.units, p.units], ['Customers', s.customers, p.customers], ['New customers', s.newCustomers, p.newCustomers], ['Returning customers', s.returningCustomers, p.returningCustomers],
        ['Coupon discounts (₹)', rupees(s.discountPaise), rupees(p.discountPaise)], ['GST collected (₹)', rupees(s.taxPaise), rupees(p.taxPaise)], ['Cancelled parcels', s.cancelledParcels, p.cancelledParcels],
        ['Cancellation rate (%)', s.cancellationRate, p.cancellationRate], ['Return requests', s.returns, p.returns],
        ...(s.refundsPaise != null ? [['Refunds (₹)', rupees(s.refundsPaise), rupees(p.refundsPaise)], ['Commission earned (₹)', rupees(s.commissionPaise), rupees(p.commissionPaise)]] : []),
      ].map(([metric, now, before]) => ({ Metric: metric, [`${a.window.from} to ${a.window.to}`]: now, [`${a.window.previousFrom} to ${a.window.previousTo}`]: before, 'Change (%)': typeof now === 'number' && before ? Math.round(((now - before) / before) * 1000) / 10 : '' })) },
      { key: 'daily', name: 'Daily sales', rows: a.series.map((d) => ({ Date: d.date, Orders: d.orders, 'Sales (₹)': rupees(d.gmvPaise) })) },
      { key: 'modes', name: 'B2C vs B2B', rows: a.modes.map((x) => ({ Channel: x.mode === 'RETAIL' ? 'B2C retail' : 'B2B business', Orders: x.orders, Customers: x.customers, 'Sales (₹)': rupees(x.gmvPaise) })) },
      { key: 'categories', name: 'By category', rows: a.categories.map((c) => ({ Category: c.name, Orders: c.orders, Units: c.units, 'Sales (₹)': rupees(c.gmvPaise) })) },
      { key: 'sellers', name: 'Seller performance', rows: a.sellers.map((x) => ({ Seller: x.name, Parcels: x.parcels, 'Sales (₹)': rupees(x.gmvPaise), Delivered: x.delivered, Open: x.open, Cancelled: x.cancelled, 'Cancellation rate (%)': x.cancellationRate, Returns: x.returns, 'Avg hours to dispatch': x.dispatchHours ?? '' })) },
      { key: 'states', name: 'By state', rows: a.states.map((x) => ({ State: x.state, Orders: x.orders, 'Sales (₹)': rupees(x.gmvPaise) })) },
      { key: 'top-products', name: 'Top products', rows: a.products.top.map((x) => ({ Product: x.name, Orders: x.orders, Units: x.units, 'Sales (₹)': rupees(x.gmvPaise) })) },
      { key: 'returned', name: 'Most returned', rows: a.products.mostReturned.map((x) => ({ Product: x.name, 'Units returned': x.returned, 'Units sold': x.sold, 'Return rate (%)': x.returnRate ?? '' })) },
      { key: 'low-stock', name: 'Low stock', rows: a.products.lowStock.items.map((x) => ({ SKU: x.sku, Product: x.name, Variant: x.variant, Seller: x.seller, Available: x.available })) },
      { key: 'never-sold', name: 'Never sold', rows: a.products.neverSold.map((x) => ({ Product: x.name, Brand: x.brand, 'Live offers': x.offers, 'Live since': x.createdAt })) },
      { key: 'customers', name: 'Top customers', rows: a.customers.top.map((x) => ({ Customer: x.name, Email: x.email, Orders: x.orders, 'Sales (₹)': rupees(x.gmvPaise), 'Last order': x.lastOrderAt })) },
      { key: 'payments', name: 'Payment mix', rows: [...a.payments.mix.map((x) => ({ Method: x.method, Orders: x.orders, 'Sales (₹)': rupees(x.gmvPaise) })), { Method: 'Online attempts failed (%)', Orders: a.payments.attempts.failureRate ?? '', 'Sales (₹)': '' }, { Method: 'Online orders never paid (%)', Orders: a.payments.abandoned.rate ?? '', 'Sales (₹)': '' }] },
      ...(a.gst ? [{ key: 'gst-hsn', name: 'GST HSN summary', rows: a.gst.map((x) => ({ HSN: x.hsn, 'GST rate (%)': x.rateBps / 100, Quantity: x.quantity, 'Taxable (₹)': rupees(x.taxablePaise), 'CGST (₹)': rupees(x.cgstPaise), 'SGST (₹)': rupees(x.sgstPaise), 'IGST (₹)': rupees(x.igstPaise), 'Total (₹)': rupees(x.totalPaise) })) }] : []),
      ...(a.settlements ? [{ key: 'settlements', name: 'Settlement statement', rows: a.settlements.map((x) => ({ Seller: x.seller, 'Sales (₹)': rupees(x.salesPaise), 'Delivery (₹)': rupees(x.shippingPaise), 'Commission (₹)': rupees(x.commissionPaise), 'Refunds (₹)': rupees(x.refundsPaise), 'Net earned (₹)': rupees(x.netPaise), 'Paid out (₹)': rupees(x.payoutsPaise) })) }] : []),
      ...(a.b2bFunnel ? [{ key: 'b2b', name: 'B2B funnel', rows: [['RFQs raised', a.b2bFunnel.rfqs], ['RFQs with a quote', a.b2bFunnel.quoted], ['RFQs with an accepted quote', a.b2bFunnel.accepted], ['Purchase orders', a.b2bFunnel.purchaseOrders], ['POs approved', a.b2bFunnel.approved], ['POs ordered', a.b2bFunnel.ordered], ['Ordered value (₹)', rupees(a.b2bFunnel.orderedValuePaise)]].map(([Stage, Count]) => ({ Stage, Count })) }] : []),
    ];
    const base = `ibazzzar-analytics-${w.fromDay}-to-${w.toDay}${w.mode ? `-${w.mode.toLowerCase()}` : ''}`;
    const chosen = section ? sheets.filter((x) => x.key === section) : sheets;
    if ((format === 'csv' || section) && chosen.length !== 1) throw new DomainError('Choose a section to download', 400, { section: `One of: ${sheets.map((x) => x.key).join(', ')}` });
    await audit(prisma, { actorId: req.user.id, action: 'analytics.exported', entityType: 'report', entityId: section ?? 'analytics', metadata: { from: w.fromDay, to: w.toDay, mode: w.mode, format } });
    if (format === 'csv') {
      const sheet = chosen[0];
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}-${sheet.key}.csv"` }).send('﻿' + toCsv(sheet.rows));
      return;
    }
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${base}.xlsx"` }).send(buildXlsx(chosen));
  });
}
