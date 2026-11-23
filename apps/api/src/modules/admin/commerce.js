// Admin: orders, B2B, payments, refunds, settlements, payouts, shipping, returns, promotions and coupons.
import { z } from 'zod';
import { DomainError, can, money } from '../../../../../packages/shared/src/index.js';
import { uuid, couponSchema, promotionSchema, decisionSchema, trackingUpdateSchema } from '../../../../../packages/validation/src/index.js';
import { requireStaff } from '../../http/middleware.js';
import { transaction, toPaise } from '../../lib/db.js';
import { audit, notify, notifyStoreOwners } from '../../lib/audit.js';
import { pageParams, ilike } from '../../lib/http.js';
import * as orders from '../../services/orders.js';
import { shipmentFlow } from '../../integrations/shipping.js';
import { customerOrder, orderDetailInclude } from '../orders.js';

const m = toPaise;
const reason = z.string().trim().min(5, 'Please give a short reason (at least 5 characters)').max(300);

export function registerAdminCommerce(app, { prisma, payments }) {
  // ───────────── Orders ─────────────
  app.get('/api/admin/orders', requireStaff('orders.view'), async (req, res) => {
    const paging = pageParams(req.query, { size: 50 });
    const q = String(req.query.q || '').trim();
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.payment ? { paymentStatus: String(req.query.payment) } : {}),
      ...(req.query.method ? { paymentMethod: String(req.query.method) } : {}),
      ...(q ? { OR: [{ number: ilike(q) }, { user: { OR: [{ name: ilike(q) }, { email: ilike(q) }] } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: { user: { select: { name: true, email: true } }, sellerOrders: { select: { status: true, store: { select: { name: true } } } }, _count: { select: { items: true } } } }),
      prisma.order.count({ where }),
    ]);
    res.json({
      orders: rows.map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, mode: o.mode, totalPaise: m(o.totalPaise), items: o._count.items, couponCode: o.couponCode, customer: o.user.name, email: o.user.email, parcels: o.sellerOrders.map((s) => ({ seller: s.store.name, status: s.status })), demo: o.demo })),
      total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)),
    });
  });

  app.get('/api/admin/orders/:id', requireStaff('orders.view'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const o = await prisma.order.findUnique({ where: { id }, include: { ...orderDetailInclude, user: { select: { id: true, name: true, email: true, phone: true } }, intents: { include: { transactions: true } } } });
    if (!o) throw new DomainError('Order not found', 404);
    const tickets = await prisma.supportTicket.findMany({ where: { orderId: id }, select: { id: true, number: true, subject: true, status: true } });
    res.json({ order: customerOrder(o), customer: o.user, payments: o.intents.map((i) => ({ id: i.id, providerOrderId: i.providerOrderId, status: i.status, amountPaise: m(i.amountPaise), transactions: i.transactions.map((t) => ({ id: t.providerPaymentId, status: t.status, method: t.method, source: t.source, amountPaise: m(t.amountPaise), at: t.createdAt })) })), tickets });
  });

  app.post('/api/admin/orders/:id/cancel', requireStaff('orders.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { reason: why } = z.object({ reason }).parse(req.body);
    await transaction(prisma, async (tx) => {
      const order = await orders.cancelUnpaid(tx, id, { actorId: req.user.id, note: `Cancelled by IBazzzar staff: ${why}` });
      await notify(tx, order.userId, { title: 'Order cancelled', body: `Order ${order.number} was cancelled by our team: ${why}`, link: `/account/orders/${id}` });
    });
    res.json({ ok: true });
  });

  /** Finance confirms a business bank transfer after matching the UTR on the bank statement. */
  app.post('/api/admin/orders/:id/bank-transfer', requireStaff('finance.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { utr } = z.object({ utr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{12,22}$/, 'Enter the bank UTR / reference number') }).parse(req.body);
    await transaction(prisma, async (tx) => {
      const o = await tx.order.findUnique({ where: { id } });
      if (!o || o.paymentMethod !== 'BANK_TRANSFER') throw new DomainError('Bank-transfer order not found', 404);
      await orders.applyPayment(tx, id, { paymentStatus: 'PAID', reference: `UTR ${utr}`, actorId: req.user.id });
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/b2b', requireStaff('b2b.view'), async (_req, res) => {
    const [rfqs, quotations, pos] = await Promise.all([
      prisma.rfq.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { organization: { select: { legalName: true } }, _count: { select: { items: true, requests: true } } } }),
      prisma.quotation.findMany({ orderBy: { updatedAt: 'desc' }, take: 100, include: { store: { select: { name: true } }, request: { include: { rfq: { select: { number: true, title: true } } } }, revisions: { orderBy: { revision: 'desc' }, take: 1 } } }),
      prisma.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { organization: { select: { legalName: true } } } }),
    ]);
    const stores = new Map((await prisma.sellerStore.findMany({ where: { id: { in: pos.map((p) => p.storeId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    res.json({
      rfqs: rfqs.map((r) => ({ id: r.id, number: r.number, title: r.title, status: r.status, organization: r.organization.legalName, items: r._count.items, sellers: r._count.requests, createdAt: r.createdAt })),
      quotations: quotations.map((q) => ({ id: q.id, status: q.status, seller: q.store.name, rfq: q.request.rfq.number, title: q.request.rfq.title, revision: q.currentRevision, totalPaise: q.revisions[0] ? m(q.revisions[0].totalPaise) : null, updatedAt: q.updatedAt })),
      purchaseOrders: pos.map((p) => ({ id: p.id, number: p.number, status: p.status, organization: p.organization.legalName, seller: stores.get(p.storeId), totalPaise: m(p.totalPaise), paymentTerms: p.paymentTerms, createdAt: p.createdAt })),
    });
  });

  // ───────────── Payments and refunds ─────────────
  app.get('/api/admin/payments', requireStaff('finance.view'), async (_req, res) => {
    const [totals, intents, events, anomalies] = await Promise.all([
      prisma.order.groupBy({ by: ['paymentStatus'], _count: { _all: true }, _sum: { totalPaise: true } }),
      prisma.paymentIntent.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { order: { select: { number: true } }, transactions: true } }),
      prisma.paymentWebhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 100 }),
      prisma.auditLog.findMany({ where: { action: { in: ['payment.mismatch', 'payment.after-cancel'] } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    res.json({
      provider: payments.configured ? 'Razorpay (test mode)' : 'Not configured',
      webhook: payments.webhookConfigured ? 'Configured' : 'Not configured',
      totals: Object.fromEntries(totals.map((t) => [t.paymentStatus, { count: t._count._all, amountPaise: m(t._sum.totalPaise ?? 0) }])),
      intents: intents.map((i) => ({ id: i.id, order: i.order.number, orderId: i.orderId, providerOrderId: i.providerOrderId, status: i.status, amountPaise: m(i.amountPaise), createdAt: i.createdAt, payments: i.transactions.map((t) => t.providerPaymentId) })),
      events, anomalies,
    });
  });

  app.get('/api/admin/refunds', requireStaff('finance.view'), async (req, res) => {
    const rows = await prisma.refund.findMany({ where: req.query.status ? { status: String(req.query.status) } : {}, orderBy: { createdAt: 'desc' }, take: 200, include: { order: { select: { number: true, paymentRef: true, paymentMethod: true } } } });
    const stores = new Map((await prisma.sellerStore.findMany({ where: { id: { in: rows.map((r) => r.storeId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    res.json({ refunds: rows.map((r) => ({ id: r.id, orderId: r.orderId, order: r.order.number, paymentRef: r.order.paymentRef, paymentMethod: r.order.paymentMethod, seller: stores.get(r.storeId), amountPaise: m(r.amountPaise), reason: r.reason, status: r.status, providerRef: r.providerRef, createdAt: r.createdAt, processedAt: r.processedAt })), providerRefundsAvailable: payments.configured });
  });

  /**
   * Completes a pending refund. With Razorpay configured, the refund is issued through the API; otherwise finance records
   * the reference of a refund made outside IBazzzar (provider dashboard or bank transfer for COD orders).
   */
  app.post('/api/admin/refunds/:id/process', requireStaff('finance.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ mode: z.enum(['PROVIDER', 'MANUAL']), reference: z.string().trim().regex(/^[A-Za-z0-9_ -]{6,60}$/, 'Enter the refund ID or bank UTR').optional() }).parse(req.body);
    const refund = await prisma.refund.findUnique({ where: { id }, include: { order: true } });
    if (!refund) throw new DomainError('Refund not found', 404);
    if (refund.status !== 'PENDING_PROVIDER') throw new DomainError('Only pending refunds can be processed', 409);
    let reference = input.reference;
    if (input.mode === 'PROVIDER') {
      if (!payments.configured) throw new DomainError('Razorpay isn’t configured. Record a manual refund instead.', 503);
      if (refund.order.paymentStatus === 'DEMO_SIMULATED' || !refund.order.paymentRef?.startsWith('pay_')) throw new DomainError('This order wasn’t paid through Razorpay', 409);
      const out = await payments.refund({ paymentId: refund.order.paymentRef, amountPaise: m(refund.amountPaise), notes: { refundId: refund.id, order: refund.order.number } });
      reference = out.id;
    } else if (!reference) {
      throw new DomainError('Enter the refund ID or bank UTR', 400, { reference: 'Enter the refund ID or bank UTR' });
    }
    await transaction(prisma, async (tx) => {
      const updated = await tx.refund.updateMany({ where: { id, status: 'PENDING_PROVIDER' }, data: { status: 'PROCESSED', providerRef: reference, processedAt: new Date() } });
      if (!updated.count) throw new DomainError('This refund was already processed', 409);
      if (refund.returnId) await tx.returnRequest.updateMany({ where: { id: refund.returnId, status: 'RECEIVED' }, data: { status: 'REFUNDED' } });
      await notify(tx, refund.order.userId, { title: 'Refund processed', body: `${money(m(refund.amountPaise))} for order ${refund.order.number} has been refunded. Banks usually take 5–7 working days to show it.`, link: `/account/orders/${refund.orderId}` });
      await audit(tx, { actorId: req.user.id, action: `refund.processed.${input.mode.toLowerCase()}`, entityType: 'refund', entityId: id, metadata: { reference } });
    });
    res.json({ ok: true, reference });
  });

  // ───────────── Settlements and payouts ─────────────
  app.get('/api/admin/finance', requireStaff('finance.view'), async (req, res) => {
    const [sums, stores, ledger, payouts, rules] = await Promise.all([
      prisma.settlementEntry.groupBy({ by: ['storeId', 'kind', 'demo'], _sum: { amountPaise: true } }),
      prisma.sellerStore.findMany({ select: { id: true, name: true, payoutAccount: { select: { accountLast4: true, ifsc: true, verified: true } } } }),
      prisma.settlementEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 300, where: req.query.store ? { storeId: String(req.query.store) } : {} }),
      prisma.payoutRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.commissionRule.findMany(),
    ]);
    const name = new Map(stores.map((s) => [s.id, s.name]));
    const balances = stores.map((s) => {
      const own = sums.filter((x) => x.storeId === s.id);
      const real = (k) => m(own.find((x) => x.kind === k && !x.demo)?._sum.amountPaise ?? 0);
      return {
        storeId: s.id, seller: s.name, payoutAccount: s.payoutAccount,
        salesPaise: real('SALE'), shippingPaise: real('SHIPPING_FEE'), commissionPaise: -(real('COMMISSION') + real('COMMISSION_REVERSAL')), refundsPaise: -real('REFUND_ADJUSTMENT'), paidOutPaise: -real('PAYOUT'),
        payablePaise: own.filter((x) => !x.demo).reduce((t, x) => t + m(x._sum.amountPaise ?? 0), 0),
        demoPaise: own.filter((x) => x.demo).reduce((t, x) => t + m(x._sum.amountPaise ?? 0), 0),
      };
    }).filter((b) => b.salesPaise || b.demoPaise || b.paidOutPaise);
    res.json({
      balances,
      ledger: ledger.map((e) => ({ ...e, amountPaise: m(e.amountPaise), seller: name.get(e.storeId) })),
      payouts: payouts.map((p) => ({ ...p, amountPaise: m(p.amountPaise), seller: name.get(p.storeId) })),
      commissionRules: rules,
    });
  });

  /** Records a payout already made by bank transfer or the provider. IBazzzar never moves money from here. */
  app.post('/api/admin/payouts', requireStaff('finance.manage'), async (req, res) => {
    const body = z.object({
      storeId: uuid, amountPaise: z.number().int().min(100, 'Payouts must be at least ₹1'),
      providerRef: z.string().trim().regex(/^(pout_[A-Za-z0-9]{6,40}|[A-Z0-9]{12,22})$/, 'Enter the Razorpay payout ID (pout_…) or the bank UTR number'),
    }).parse(req.body);
    const entry = await transaction(prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM seller_stores WHERE id = ${body.storeId}::uuid FOR UPDATE`;
      const store = await tx.sellerStore.findUnique({ where: { id: body.storeId }, include: { payoutAccount: true } });
      if (!store) throw new DomainError('Seller not found', 404);
      if (!store.payoutAccount?.verified) throw new DomainError('Verify the seller’s bank account before recording a payout', 409);
      const balance = await tx.settlementEntry.aggregate({ where: { storeId: body.storeId, demo: false }, _sum: { amountPaise: true } });
      const payable = m(balance._sum.amountPaise ?? 0);
      if (body.amountPaise > payable) throw new DomainError(`This is more than the seller’s payable balance of ${money(payable)}`, 409);
      const payout = await tx.payoutRecord.create({ data: { storeId: body.storeId, amountPaise: body.amountPaise, providerRef: body.providerRef, recordedBy: req.user.id } });
      await tx.settlementEntry.create({ data: { storeId: body.storeId, payoutId: payout.id, kind: 'PAYOUT', amountPaise: -body.amountPaise, status: 'PAID_OUT', note: `Payout ${body.providerRef}` } });
      await notifyStoreOwners(tx, body.storeId, { title: 'Payout sent', body: `${money(body.amountPaise)} was paid to your bank account ending ${store.payoutAccount.accountLast4} (ref ${body.providerRef}).`, link: '/seller/payments' });
      await audit(tx, { actorId: req.user.id, action: 'payout.recorded', entityType: 'store', entityId: body.storeId, metadata: { amountPaise: body.amountPaise, providerRef: body.providerRef } });
      return payout;
    });
    res.status(201).json({ payout: { ...entry, amountPaise: m(entry.amountPaise) } });
  });

  // ───────────── Shipping ─────────────
  app.get('/api/admin/shipping', requireStaff('orders.view'), async (_req, res) => {
    const [shipments, counts, toShip] = await Promise.all([
      prisma.shipment.findMany({ orderBy: { updatedAt: 'desc' }, take: 150, include: { sellerOrder: { include: { store: { select: { name: true } }, order: { select: { number: true, shippingAddress: true } } } }, events: { orderBy: { occurredAt: 'desc' }, take: 1 } } }),
      prisma.shipment.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.sellerOrder.count({ where: { status: { in: ['PENDING', 'PACKED'] }, order: { status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } } } }),
    ]);
    res.json({
      provider: 'Sandbox courier (test tracking numbers) and seller-booked couriers. No live courier integration is connected.',
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), awaitingDispatch: toShip,
      shipments: shipments.map((s) => ({ id: s.id, provider: s.provider, carrier: s.carrier, trackingRef: s.trackingRef, status: s.status, seller: s.sellerOrder.store.name, order: s.sellerOrder.order.number, orderId: s.sellerOrder.orderId, pincode: s.sellerOrder.order.shippingAddress?.pincode, lastEvent: s.events[0] ?? null, updatedAt: s.updatedAt })),
    });
  });
  app.post('/api/admin/shipments/:id/events', requireStaff('shipping.manage'), async (req, res) => {
    const input = trackingUpdateSchema.parse(req.body);
    const shipment = await transaction(prisma, (tx) => orders.addTrackingEvent(tx, uuid.parse(req.params.id), { actorId: req.user.id, ...input, source: 'SANDBOX', flow: shipmentFlow }));
    res.json({ shipment });
  });

  // ───────────── Returns ─────────────
  app.get('/api/admin/returns', requireStaff('returns.manage'), async (req, res) => {
    const rows = await prisma.returnRequest.findMany({
      where: req.query.status ? { status: String(req.query.status) } : {}, orderBy: { createdAt: 'desc' }, take: 200,
      include: { order: { select: { number: true } }, user: { select: { name: true } }, sellerOrder: { include: { store: { select: { name: true } } } }, items: { include: { orderItem: { select: { name: true } } } } },
    });
    res.json({ returns: rows.map((r) => ({ id: r.id, orderId: r.orderId, order: r.order.number, customer: r.user.name, seller: r.sellerOrder.store.name, status: r.status, reason: r.reason, note: r.note, refundPaise: m(r.refundPaise), createdAt: r.createdAt, items: r.items.map((i) => ({ name: i.orderItem.name, quantity: i.quantity })) })) });
  });
  app.post('/api/admin/returns/:id/decision', requireStaff('returns.manage'), async (req, res) => {
    const input = decisionSchema.parse(req.body);
    await transaction(prisma, (tx) => orders.decideReturn(tx, uuid.parse(req.params.id), { actorId: req.user.id, ...input }));
    res.json({ ok: true });
  });
  app.post('/api/admin/returns/:id/receive', requireStaff('returns.manage'), async (req, res) => {
    await transaction(prisma, (tx) => orders.receiveReturn(tx, uuid.parse(req.params.id), { actorId: req.user.id }));
    res.json({ ok: true });
  });

  // ───────────── Promotions (flash deals) ─────────────
  app.get('/api/admin/promotions', requireStaff('promotions.manage'), async (_req, res) => {
    const now = new Date();
    const rows = await prisma.promotion.findMany({ orderBy: { startsAt: 'desc' }, take: 100, include: { _count: { select: { items: true } } } });
    res.json({ promotions: rows.map((p) => ({ ...p, items: p._count.items, state: !p.active ? 'PAUSED' : p.endsAt <= now ? 'ENDED' : p.startsAt > now ? 'SCHEDULED' : 'LIVE' })) });
  });
  app.post('/api/admin/promotions', requireStaff('promotions.manage'), async (req, res) => {
    const input = promotionSchema.parse(req.body);
    const promotion = await transaction(prisma, async (tx) => {
      const listings = await tx.sellerListing.findMany({ where: { id: { in: input.listingIds }, status: 'APPROVED' }, select: { id: true, storeId: true } });
      if (listings.length !== new Set(input.listingIds).size) throw new DomainError('Every product in a deal must be live', 400);
      const p = await tx.promotion.create({ data: { name: input.name, description: input.description, discountBps: input.discountBps, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), createdBy: req.user.id, items: { create: listings.map((l) => ({ listingId: l.id })) } } });
      for (const storeId of new Set(listings.map((l) => l.storeId))) await notifyStoreOwners(tx, storeId, { title: 'Your product is in a deal', body: `${input.name}: ${input.discountBps / 100}% off, ${new Date(input.startsAt).toLocaleDateString('en-IN')} – ${new Date(input.endsAt).toLocaleDateString('en-IN')}.`, link: '/seller/products' });
      await audit(tx, { actorId: req.user.id, action: 'promotion.created', entityType: 'promotion', entityId: p.id, metadata: { discountBps: input.discountBps, items: listings.length } });
      return p;
    });
    res.status(201).json({ promotion });
  });
  app.patch('/api/admin/promotions/:id', requireStaff('promotions.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    await prisma.promotion.update({ where: { id }, data: { active } });
    await audit(prisma, { actorId: req.user.id, action: `promotion.${active ? 'resumed' : 'paused'}`, entityType: 'promotion', entityId: id });
    res.json({ ok: true });
  });

  // ───────────── Coupons ─────────────
  app.get('/api/admin/coupons', requireStaff('promotions.manage'), async (_req, res) => {
    const now = new Date();
    const rows = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ coupons: rows.map((c) => ({ ...c, maxDiscountPaise: c.maxDiscountPaise == null ? null : m(c.maxDiscountPaise), minOrderPaise: m(c.minOrderPaise), state: !c.active ? 'PAUSED' : c.endsAt <= now ? 'ENDED' : c.startsAt > now ? 'SCHEDULED' : c.usageLimit != null && c.used >= c.usageLimit ? 'USED_UP' : 'ACTIVE' })) });
  });
  app.post('/api/admin/coupons', requireStaff('promotions.manage'), async (req, res) => {
    const input = couponSchema.parse(req.body);
    if (await prisma.coupon.findUnique({ where: { code: input.code } })) throw new DomainError('A coupon with this code already exists', 409, { code: 'This code is already used' });
    const coupon = await prisma.coupon.create({ data: { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) } });
    await audit(prisma, { actorId: req.user.id, action: 'coupon.created', entityType: 'coupon', entityId: coupon.id, metadata: { code: coupon.code } });
    res.status(201).json({ coupon: { ...coupon, maxDiscountPaise: coupon.maxDiscountPaise == null ? null : m(coupon.maxDiscountPaise), minOrderPaise: m(coupon.minOrderPaise) } });
  });
  app.patch('/api/admin/coupons/:id', requireStaff('promotions.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    await prisma.coupon.update({ where: { id }, data: { active } });
    await audit(prisma, { actorId: req.user.id, action: `coupon.${active ? 'activated' : 'paused'}`, entityType: 'coupon', entityId: id });
    res.json({ ok: true });
  });

  // Finance/ops can see if a staff member lacks the capability; the matrix is enforced above, this is for the UI.
  app.get('/api/admin/capabilities', (req, res) => {
    if (!req.staffRoles?.length) throw new DomainError('Staff access required', 403);
    res.json({ finance: can(req.staffRoles, 'finance.manage') });
  });
}
