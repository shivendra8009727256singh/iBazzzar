// Admin: orders, B2B, payments, refunds, settlements, payouts, shipping, returns, promotions and coupons.
import { z } from 'zod';
import { DomainError, money, stateCode } from '../../../../../packages/shared/src/index.js';
import { uuid, couponSchema, promotionSchema, decisionSchema, trackingUpdateSchema, shipmentSchema, postalAddressSchema } from '../../../../../packages/validation/src/index.js';
import { requireStaff } from '../../http/middleware.js';
import { transaction, toPaise } from '../../lib/db.js';
import { audit, notify, notifyStoreOwners } from '../../lib/audit.js';
import { notifyCustomer } from '../../lib/email.js';
import { ilike } from '../../lib/http.js';
import { listParams, sendList, bulkInput } from '../../lib/admin-list.js';
import * as orders from '../../services/orders.js';
import { shipmentFlow } from '../../integrations/shipping.js';
import { customerOrder, orderDetailInclude } from '../orders.js';
import { notesFor } from './people.js';

const m = toPaise;
const reason = z.string().trim().min(5, 'Please give a short reason (at least 5 characters)').max(300);
const rupees = (p) => (p / 100).toFixed(2);

function couponView(c, now = new Date()) {
  return {
    ...c, maxDiscountPaise: c.maxDiscountPaise == null ? null : m(c.maxDiscountPaise), minOrderPaise: m(c.minOrderPaise),
    state: !c.active ? 'PAUSED' : c.endsAt <= now ? 'ENDED' : c.startsAt > now ? 'SCHEDULED' : c.usageLimit != null && c.used >= c.usageLimit ? 'USED_UP' : 'ACTIVE',
  };
}
const promotionState = (p, now = new Date()) => (!p.active ? 'PAUSED' : p.endsAt <= now ? 'ENDED' : p.startsAt > now ? 'SCHEDULED' : 'LIVE');

export function registerAdminCommerce(app, { prisma, payments, shipping, mailer, logger }) {
  // ───────────── Orders ─────────────
  const orderSorts = { newest: (d) => ({ createdAt: d }), total: (d) => ({ totalPaise: d }), number: (d) => ({ number: d }) };
  function orderWhere(req, p) {
    const q = req.query;
    const amount = {};
    if (q.min) amount.gte = Math.round(Number(q.min) * 100) || 0;
    if (q.max) amount.lte = Math.round(Number(q.max) * 100) || 0;
    return {
      ...(q.status ? { status: String(q.status) } : {}),
      ...(q.payment ? { paymentStatus: String(q.payment) } : {}),
      ...(q.method ? { paymentMethod: String(q.method) } : {}),
      ...(q.mode ? { mode: String(q.mode) } : {}),
      ...(q.store ? { sellerOrders: { some: { storeId: uuid.parse(q.store) } } } : {}),
      ...(q.user ? { userId: uuid.parse(q.user) } : {}),
      ...(q.organization ? { organizationId: uuid.parse(q.organization) } : {}),
      ...(q.demo === 'yes' ? { demo: true } : q.demo === 'no' ? { demo: false } : {}),
      ...(q.coupon ? { couponCode: String(q.coupon).toUpperCase() } : {}),
      ...(Object.keys(amount).length ? { totalPaise: amount } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      ...(p.q ? { OR: [{ number: ilike(p.q) }, { paymentRef: ilike(p.q) }, { user: { OR: [{ name: ilike(p.q) }, { email: ilike(p.q) }, { phone: ilike(p.q) }] } }] } : {}),
    };
  }

  app.get('/api/admin/orders', requireStaff('orders.view'), async (req, res) => {
    const p = listParams(req.query, orderSorts);
    const where = orderWhere(req, p);
    const [rows, total, sum] = await Promise.all([
      prisma.order.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { user: { select: { id: true, name: true, email: true } }, organization: { select: { legalName: true } }, sellerOrders: { select: { status: true, store: { select: { name: true } } } }, _count: { select: { items: true } } } }),
      prisma.order.count({ where }),
      prisma.order.aggregate({ where, _sum: { totalPaise: true } }),
    ]);
    const list = rows.map((o) => ({
      id: o.id, number: o.number, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, mode: o.mode,
      totalPaise: m(o.totalPaise), items: o._count.items, couponCode: o.couponCode, customerId: o.user.id, customer: o.user.name, email: o.user.email,
      organization: o.organization?.legalName ?? null, state: o.shippingAddress?.state ?? null, parcels: o.sellerOrders.map((s) => ({ seller: s.store.name, status: s.status })), demo: o.demo,
    }));
    sendList(res, p, {
      key: 'orders', rows: list, total, filename: 'orders', extra: { totalValuePaise: m(sum._sum.totalPaise ?? 0) },
      toCsvRow: (o) => ({ order: o.number, date: o.createdAt, customer: o.customer, email: o.email, business: o.organization ?? '', mode: o.mode, status: o.status, payment_status: o.paymentStatus, payment_method: o.paymentMethod, total_inr: rupees(o.totalPaise), items: o.items, coupon: o.couponCode ?? '', state: o.state ?? '', sellers: o.parcels.map((x) => x.seller).join('; '), demo: o.demo ? 'yes' : 'no' }),
    });
  });

  /** Order 360: the order, the customer, payments, tickets, internal notes, and what staff may still do. */
  app.get('/api/admin/orders/:id', requireStaff('orders.view'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const o = await prisma.order.findUnique({ where: { id }, include: { ...orderDetailInclude, organization: { select: { id: true, legalName: true } }, user: { select: { id: true, name: true, email: true, phone: true } }, intents: { include: { transactions: true } } } });
    if (!o) throw new DomainError('Order not found', 404);
    const [tickets, customerOrders, refunded] = await Promise.all([
      prisma.supportTicket.findMany({ where: { orderId: id }, select: { id: true, number: true, subject: true, status: true } }),
      prisma.order.count({ where: { userId: o.userId } }),
      prisma.refund.groupBy({ by: ['storeId'], where: { orderId: id }, _sum: { amountPaise: true } }),
    ]);
    const received = orders.isPaidOnline(o) || ['COD_COLLECTED', 'ON_TERMS'].includes(o.paymentStatus);
    const view = customerOrder(o);
    view.parcels = view.parcels.map((parcel) => ({
      ...parcel,
      refundablePaise: received ? parcel.totalPaise - m(refunded.find((r) => r.storeId === parcel.sellerId)?._sum.amountPaise ?? 0) : 0,
      actions: { pack: parcel.status === 'PENDING' && o.status !== 'AWAITING_PAYMENT' && o.status !== 'CANCELLED', ship: ['PENDING', 'PACKED'].includes(parcel.status) && o.status !== 'AWAITING_PAYMENT' && o.status !== 'CANCELLED', cancel: ['PENDING', 'PACKED'].includes(parcel.status) && o.status !== 'AWAITING_PAYMENT' },
    }));
    res.json({
      order: view, customer: { ...o.user, orders: customerOrders }, organization: o.organization,
      payments: o.intents.map((i) => ({ id: i.id, providerOrderId: i.providerOrderId, status: i.status, amountPaise: m(i.amountPaise), transactions: i.transactions.map((t) => ({ id: t.providerPaymentId, status: t.status, method: t.method, source: t.source, amountPaise: m(t.amountPaise), at: t.createdAt })) })),
      tickets, notes: await notesFor(prisma, 'order', id),
      actions: {
        cancelUnpaid: o.status === 'AWAITING_PAYMENT',
        editAddress: o.status !== 'CANCELLED' && o.sellerOrders.every((s) => ['PENDING', 'PACKED', 'CANCELLED'].includes(s.status)),
        confirmBankTransfer: o.paymentMethod === 'BANK_TRANSFER' && o.paymentStatus === 'BANK_TRANSFER_PENDING',
        recordTermsPayment: o.paymentStatus === 'ON_TERMS',
        refund: received,
      },
    });
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

  app.post('/api/admin/orders/bulk', requireStaff('orders.manage'), async (req, res) => {
    const input = bulkInput(req.body, ['cancel-unpaid']);
    if ((input.reason ?? '').length < 5) throw new DomainError('Please give a reason (at least 5 characters)', 400, { reason: 'Required' });
    const results = { done: 0, skipped: [] };
    for (const id of input.ids) {
      try {
        await transaction(prisma, async (tx) => {
          const order = await orders.cancelUnpaid(tx, id, { actorId: req.user.id, note: `Cancelled by IBazzzar staff: ${input.reason}` });
          await notify(tx, order.userId, { title: 'Order cancelled', body: `Order ${order.number} was cancelled by our team: ${input.reason}`, link: `/account/orders/${id}` });
        });
        results.done++;
      } catch (e) { results.skipped.push({ id, reason: e.message }); }
    }
    res.json(results);
  });

  /** Acting on one seller's parcel on their behalf (seller unreachable, operations escalation). */
  async function parcelOf(orderId, parcelId) {
    const so = await prisma.sellerOrder.findUnique({ where: { id: parcelId }, select: { id: true, orderId: true, storeId: true } });
    if (!so || so.orderId !== orderId) throw new DomainError('Parcel not found', 404);
    return so;
  }
  app.post('/api/admin/orders/:id/parcels/:parcelId/:action', requireStaff('orders.manage'), async (req, res) => {
    const orderId = uuid.parse(req.params.id);
    const so = await parcelOf(orderId, uuid.parse(req.params.parcelId));
    const action = z.enum(['pack', 'ship', 'cancel']).parse(req.params.action);
    const { reason: why } = z.object({ reason }).parse(req.body);
    const booking = action === 'ship' ? await shipping.createShipment(shipmentSchema.parse(req.body)) : null;
    await transaction(prisma, async (tx) => {
      if (action === 'pack') await orders.markPacked(tx, so.id, { actorId: req.user.id });
      if (action === 'ship') await orders.ship(tx, so.id, { actorId: req.user.id, booking });
      if (action === 'cancel') await orders.sellerCancel(tx, so.id, { actorId: req.user.id, reason: why });
      await notifyStoreOwners(tx, so.storeId, { title: `IBazzzar ${action === 'cancel' ? 'cancelled' : action === 'ship' ? 'shipped' : 'packed'} a parcel for you`, body: why, link: '/seller/orders' });
      await audit(tx, { actorId: req.user.id, action: `order.parcel-${action}.by-staff`, entityType: 'seller_order', entityId: so.id, metadata: { reason: why, orderId } });
    });
    res.json({ ok: true });
  });

  /** Fixes a delivery address before anything ships. The state can't change because tax was charged for it. */
  app.patch('/api/admin/orders/:id/address', requireStaff('orders.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = postalAddressSchema.extend({ name: z.string().trim().min(2).max(100), phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'), reason }).parse(req.body);
    await transaction(prisma, async (tx) => {
      const order = await orders.lockOrder(tx, id);
      if (!order) throw new DomainError('Order not found', 404);
      if (order.status === 'CANCELLED' || order.sellerOrders.some((s) => !['PENDING', 'PACKED', 'CANCELLED'].includes(s.status))) throw new DomainError('The address can only be changed before any parcel ships', 409);
      if (stateCode(input.state) !== order.placeOfSupply) throw new DomainError('The state can’t change after the order is placed because GST was charged for it. Cancel and re-order instead.', 409, { state: 'Must stay the same' });
      const { reason: why, ...address } = input;
      const before = order.shippingAddress;
      await tx.order.update({ where: { id }, data: { shippingAddress: { ...before, ...address } } });
      await tx.orderStatusHistory.create({ data: { orderId: id, status: 'ADDRESS_CHANGED', note: why, actorId: req.user.id } });
      for (const so of order.sellerOrders) await notifyStoreOwners(tx, so.storeId, { title: 'Delivery address changed', body: `Order ${order.number}: please ship to the updated address.`, link: '/seller/orders' });
      await notify(tx, order.userId, { title: 'Delivery address updated', body: `We updated the address for order ${order.number}.`, link: `/account/orders/${id}` });
      await audit(tx, { actorId: req.user.id, action: 'order.address-changed', entityType: 'order', entityId: id, metadata: { reason: why, before, after: address } });
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/orders/:id/message', requireStaff('orders.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { subject, body, email } = z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(5).max(2000), email: z.boolean().default(true) }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, name: true } } } });
    if (!order) throw new DomainError('Order not found', 404);
    await notify(prisma, order.userId, { title: subject, body, link: `/account/orders/${id}` });
    await audit(prisma, { actorId: req.user.id, action: 'order.customer-messaged', entityType: 'order', entityId: id, metadata: { subject } });
    let emailed = false;
    if (email && order.user.email) {
      try { await mailer.send({ to: order.user.email, subject: `${subject} — order ${order.number}`, text: `Hi ${order.user.name},\n\n${body}\n\nIBazzzar support` }); emailed = true; } catch (e) { logger?.warn?.({ err: e }, 'customer message email failed'); }
    }
    res.json({ ok: true, emailed });
  });

  app.post('/api/admin/orders/:id/refund', requireStaff('finance.manage'), async (req, res) => {
    const orderId = uuid.parse(req.params.id);
    const input = z.object({ parcelId: uuid, amountPaise: z.number().int().min(100, 'Refunds must be at least ₹1'), reason }).parse(req.body);
    const refund = await transaction(prisma, (tx) => orders.staffRefund(tx, { orderId, sellerOrderId: input.parcelId, amountPaise: input.amountPaise, reason: input.reason, actorId: req.user.id }));
    res.status(201).json({ refund: { id: refund.id, status: refund.status, amountPaise: m(refund.amountPaise) } });
  });

  app.post('/api/admin/orders/:id/terms-payment', requireStaff('finance.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { reference } = z.object({ reference: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,30}$/, 'Enter the bank UTR or cheque number') }).parse(req.body);
    await transaction(prisma, (tx) => orders.recordTermsPayment(tx, id, { reference, actorId: req.user.id }));
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

  app.get('/api/admin/b2b', requireStaff('b2b.view'), async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const org = q ? { organization: { legalName: ilike(q) } } : {};
    const [rfqs, quotations, pos] = await Promise.all([
      prisma.rfq.findMany({ where: q ? { OR: [{ number: ilike(q) }, { title: ilike(q) }, org] } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { organization: { select: { id: true, legalName: true } }, _count: { select: { items: true, requests: true } } } }),
      prisma.quotation.findMany({ where: q ? { OR: [{ store: { name: ilike(q) } }, { request: { rfq: { OR: [{ number: ilike(q) }, { title: ilike(q) }] } } }] } : {}, orderBy: { updatedAt: 'desc' }, take: 100, include: { store: { select: { name: true } }, request: { include: { rfq: { select: { number: true, title: true } } } }, revisions: { orderBy: { revision: 'desc' }, take: 1 } } }),
      prisma.purchaseOrder.findMany({ where: q ? { OR: [{ number: ilike(q) }, org] } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { organization: { select: { id: true, legalName: true } } } }),
    ]);
    const stores = new Map((await prisma.sellerStore.findMany({ where: { id: { in: pos.map((p) => p.storeId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    res.json({
      rfqs: rfqs.map((r) => ({ id: r.id, number: r.number, title: r.title, status: r.status, organizationId: r.organization.id, organization: r.organization.legalName, items: r._count.items, sellers: r._count.requests, createdAt: r.createdAt })),
      quotations: quotations.map((x) => ({ id: x.id, status: x.status, seller: x.store.name, rfq: x.request.rfq.number, title: x.request.rfq.title, revision: x.currentRevision, totalPaise: x.revisions[0] ? m(x.revisions[0].totalPaise) : null, updatedAt: x.updatedAt })),
      purchaseOrders: pos.map((p) => ({ id: p.id, number: p.number, status: p.status, organizationId: p.organization.id, organization: p.organization.legalName, seller: stores.get(p.storeId), totalPaise: m(p.totalPaise), paymentTerms: p.paymentTerms, createdAt: p.createdAt })),
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

  const refundSorts = { newest: (d) => ({ createdAt: d }), amount: (d) => ({ amountPaise: d }) };
  app.get('/api/admin/refunds', requireStaff('finance.view'), async (req, res) => {
    const p = listParams(req.query, refundSorts);
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.store ? { storeId: uuid.parse(req.query.store) } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      ...(p.q ? { OR: [{ order: { number: ilike(p.q) } }, { reason: ilike(p.q) }, { providerRef: ilike(p.q) }] } : {}),
    };
    const [rows, total, sum] = await Promise.all([
      prisma.refund.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { order: { select: { number: true, paymentRef: true, paymentMethod: true } } } }),
      prisma.refund.count({ where }),
      prisma.refund.aggregate({ where, _sum: { amountPaise: true } }),
    ]);
    const stores = new Map((await prisma.sellerStore.findMany({ where: { id: { in: rows.map((r) => r.storeId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const refunds = rows.map((r) => ({ id: r.id, orderId: r.orderId, order: r.order.number, paymentRef: r.order.paymentRef, paymentMethod: r.order.paymentMethod, seller: stores.get(r.storeId), amountPaise: m(r.amountPaise), reason: r.reason, status: r.status, providerRef: r.providerRef, createdAt: r.createdAt, processedAt: r.processedAt }));
    sendList(res, p, {
      key: 'refunds', rows: refunds, total, filename: 'refunds', extra: { providerRefundsAvailable: payments.configured, totalValuePaise: m(sum._sum.amountPaise ?? 0) },
      toCsvRow: (r) => ({ order: r.order, seller: r.seller ?? '', amount_inr: rupees(r.amountPaise), status: r.status, reason: r.reason, method: r.paymentMethod, reference: r.providerRef ?? '', created: r.createdAt, processed: r.processedAt ?? '' }),
    });
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
      await notifyCustomer(tx, refund.order.userId, { kind: 'refund.processed', title: 'Refund processed', body: `${money(m(refund.amountPaise))} for order ${refund.order.number} has been refunded. Banks usually take 5–7 working days to show it.`, link: `/account/orders/${refund.orderId}` });
      await audit(tx, { actorId: req.user.id, action: `refund.processed.${input.mode.toLowerCase()}`, entityType: 'refund', entityId: id, metadata: { reference } });
    });
    res.json({ ok: true, reference });
  });

  // ───────────── Settlements and payouts ─────────────
  app.get('/api/admin/finance', requireStaff('finance.view'), async (req, res) => {
    const storeFilter = req.query.store ? { storeId: uuid.parse(req.query.store) } : {};
    const [sums, stores, ledger, payouts, rules] = await Promise.all([
      prisma.settlementEntry.groupBy({ by: ['storeId', 'kind'], _sum: { amountPaise: true } }),
      prisma.sellerStore.findMany({ select: { id: true, name: true, payoutHold: true, payoutHoldReason: true, commissionBps: true, payoutAccount: { select: { accountLast4: true, ifsc: true, verified: true } } } }),
      prisma.settlementEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 300, where: storeFilter }),
      prisma.payoutRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 100, where: storeFilter }),
      prisma.commissionRule.findMany(),
    ]);
    const name = new Map(stores.map((s) => [s.id, s.name]));
    const balances = stores.map((s) => {
      const own = sums.filter((x) => x.storeId === s.id);
      const real = (k) => m(own.find((x) => x.kind === k)?._sum.amountPaise ?? 0);
      return {
        storeId: s.id, seller: s.name, payoutAccount: s.payoutAccount, payoutHold: s.payoutHold, payoutHoldReason: s.payoutHoldReason, commissionBps: s.commissionBps,
        salesPaise: real('SALE'), shippingPaise: real('SHIPPING_FEE'), commissionPaise: -(real('COMMISSION') + real('COMMISSION_REVERSAL')), refundsPaise: -real('REFUND_ADJUSTMENT'), paidOutPaise: -real('PAYOUT'),
        payablePaise: own.reduce((t, x) => t + m(x._sum.amountPaise ?? 0), 0),
      };
    }).filter((b) => b.salesPaise || b.payablePaise || b.paidOutPaise);
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
      if (store.payoutHold) throw new DomainError(`Payouts to this seller are on hold: ${store.payoutHoldReason ?? 'no reason recorded'}. Release the hold first.`, 409);
      if (!store.payoutAccount?.verified) throw new DomainError('Verify the seller’s bank account before recording a payout', 409);
      const balance = await tx.settlementEntry.aggregate({ where: { storeId: body.storeId }, _sum: { amountPaise: true } });
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
  app.get('/api/admin/shipping', requireStaff('orders.view'), async (req, res) => {
    const status = req.query.status ? { status: String(req.query.status) } : {};
    const [shipments, counts, toShip] = await Promise.all([
      prisma.shipment.findMany({ where: status, orderBy: { updatedAt: 'desc' }, take: 150, include: { sellerOrder: { include: { store: { select: { name: true } }, order: { select: { number: true, shippingAddress: true } } } }, events: { orderBy: { occurredAt: 'desc' }, take: 1 } } }),
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
  const returnSorts = { newest: (d) => ({ createdAt: d }), refund: (d) => ({ refundPaise: d }) };
  app.get('/api/admin/returns', requireStaff('returns.manage'), async (req, res) => {
    const p = listParams(req.query, returnSorts);
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.store ? { sellerOrder: { storeId: uuid.parse(req.query.store) } } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      ...(p.q ? { OR: [{ order: { number: ilike(p.q) } }, { reason: ilike(p.q) }, { user: { name: ilike(p.q) } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.returnRequest.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { order: { select: { number: true } }, user: { select: { name: true } }, sellerOrder: { include: { store: { select: { name: true } } } }, items: { include: { orderItem: { select: { name: true } } } } } }),
      prisma.returnRequest.count({ where }),
    ]);
    const returns = rows.map((r) => ({ id: r.id, orderId: r.orderId, order: r.order.number, customer: r.user.name, seller: r.sellerOrder.store.name, status: r.status, reason: r.reason, note: r.note, refundPaise: m(r.refundPaise), createdAt: r.createdAt, items: r.items.map((i) => ({ name: i.orderItem.name, quantity: i.quantity })) }));
    sendList(res, p, { key: 'returns', rows: returns, total, filename: 'returns', toCsvRow: (r) => ({ order: r.order, customer: r.customer, seller: r.seller, status: r.status, reason: r.reason, items: r.items.map((i) => `${i.quantity} × ${i.name}`).join('; '), refund_inr: rupees(r.refundPaise), created: r.createdAt }) });
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
  const promos = requireStaff('promotions.manage');
  app.get('/api/admin/promotions', promos, async (_req, res) => {
    const now = new Date();
    const rows = await prisma.promotion.findMany({ orderBy: { startsAt: 'desc' }, take: 200, include: { items: { include: { listing: { select: { id: true, sku: true, variant: { select: { label: true, product: { select: { name: true } } } } } } } } } });
    res.json({ promotions: rows.map((p) => ({ ...p, items: p.items.length, listings: p.items.map((i) => ({ id: i.listing.id, sku: i.listing.sku, name: i.listing.variant.product.name, variant: i.listing.variant.label })), state: promotionState(p, now) })) });
  });

  async function savePromotion(tx, req, input, id) {
    const listings = await tx.sellerListing.findMany({ where: { id: { in: input.listingIds }, status: 'APPROVED' }, select: { id: true, storeId: true } });
    if (listings.length !== new Set(input.listingIds).size) throw new DomainError('Every product in a deal must be live', 400);
    const data = { name: input.name, description: input.description, discountBps: input.discountBps, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) };
    let p;
    if (id) {
      await tx.promotionItem.deleteMany({ where: { promotionId: id } });
      p = await tx.promotion.update({ where: { id }, data: { ...data, items: { create: listings.map((l) => ({ listingId: l.id })) } } });
    } else {
      p = await tx.promotion.create({ data: { ...data, createdBy: req.user.id, items: { create: listings.map((l) => ({ listingId: l.id })) } } });
    }
    for (const storeId of new Set(listings.map((l) => l.storeId))) await notifyStoreOwners(tx, storeId, { title: id ? 'A deal with your product changed' : 'Your product is in a deal', body: `${input.name}: ${input.discountBps / 100}% off, ${new Date(input.startsAt).toLocaleDateString('en-IN')} – ${new Date(input.endsAt).toLocaleDateString('en-IN')}.`, link: '/seller/products' });
    await audit(tx, { actorId: req.user.id, action: id ? 'promotion.updated' : 'promotion.created', entityType: 'promotion', entityId: p.id, metadata: { discountBps: input.discountBps, items: listings.length } });
    return p;
  }
  app.post('/api/admin/promotions', promos, async (req, res) => {
    const input = promotionSchema.parse(req.body);
    const promotion = await transaction(prisma, (tx) => savePromotion(tx, req, input));
    res.status(201).json({ promotion });
  });
  app.patch('/api/admin/promotions/:id', promos, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const existing = await prisma.promotion.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw new DomainError('Deal not found', 404);
    const { active, ...rest } = z.object({ active: z.boolean().optional() }).passthrough().parse(req.body);
    if (Object.keys(rest).length) {
      if (promotionState(existing) === 'ENDED') throw new DomainError('This deal has ended. Create a new one instead.', 409);
      const merged = promotionSchema.parse({
        name: existing.name, description: existing.description, discountBps: existing.discountBps, startsAt: existing.startsAt.toISOString(), endsAt: existing.endsAt.toISOString(),
        listingIds: existing.items.map((i) => i.listingId), ...rest,
      });
      await transaction(prisma, (tx) => savePromotion(tx, req, merged, id));
    }
    if (active !== undefined) {
      await prisma.promotion.update({ where: { id }, data: { active } });
      await audit(prisma, { actorId: req.user.id, action: `promotion.${active ? 'resumed' : 'paused'}`, entityType: 'promotion', entityId: id });
    }
    res.json({ ok: true });
  });
  app.delete('/api/admin/promotions/:id', promos, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const p = await prisma.promotion.findUnique({ where: { id } });
    if (!p) throw new DomainError('Deal not found', 404);
    if (promotionState(p) === 'LIVE') throw new DomainError('Pause this deal before deleting it', 409);
    // Orders store the price paid, so removing a deal never changes past orders.
    await transaction(prisma, async (tx) => {
      await tx.promotionItem.deleteMany({ where: { promotionId: id } });
      await tx.promotion.delete({ where: { id } });
      await audit(tx, { actorId: req.user.id, action: 'promotion.deleted', entityType: 'promotion', entityId: id, metadata: { name: p.name } });
    });
    res.json({ ok: true });
  });

  // ───────────── Coupons ─────────────
  const couponSorts = { newest: (d) => ({ createdAt: d }), used: (d) => ({ used: d }), ends: (d) => ({ endsAt: d }), code: (d) => ({ code: d }) };
  app.get('/api/admin/coupons', promos, async (req, res) => {
    const p = listParams(req.query, couponSorts);
    const now = new Date();
    const state = String(req.query.state || '');
    const where = {
      ...(p.q ? { OR: [{ code: ilike(p.q) }, { description: ilike(p.q) }] } : {}),
      ...(req.query.mode ? { mode: String(req.query.mode) } : {}),
      ...(state === 'ACTIVE' ? { active: true, startsAt: { lte: now }, endsAt: { gt: now } } : state === 'PAUSED' ? { active: false } : state === 'ENDED' ? { endsAt: { lte: now } } : state === 'SCHEDULED' ? { active: true, startsAt: { gt: now } } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    };
    const [rows, total] = await Promise.all([prisma.coupon.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take }), prisma.coupon.count({ where })]);
    const discounts = rows.length ? await prisma.order.groupBy({ by: ['couponCode'], where: { couponCode: { in: rows.map((c) => c.code) }, status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } }, _sum: { discountPaise: true, totalPaise: true }, _count: { _all: true } }) : [];
    const coupons = rows.map((c) => {
      const d = discounts.find((x) => x.couponCode === c.code);
      return { ...couponView(c, now), orders: d?._count._all ?? 0, discountGivenPaise: m(d?._sum.discountPaise ?? 0), revenuePaise: m(d?._sum.totalPaise ?? 0) };
    });
    sendList(res, p, {
      key: 'coupons', rows: coupons, total, filename: 'coupons',
      toCsvRow: (c) => ({ code: c.code, description: c.description, kind: c.kind, value: c.kind === 'PERCENT' ? `${c.value}%` : rupees(c.value), mode: c.mode, state: c.state, starts: c.startsAt, ends: c.endsAt, used: c.used, limit: c.usageLimit ?? '', paid_orders: c.orders, discount_given_inr: rupees(c.discountGivenPaise), revenue_inr: rupees(c.revenuePaise) }),
    });
  });
  app.post('/api/admin/coupons', promos, async (req, res) => {
    const input = couponSchema.parse(req.body);
    if (await prisma.coupon.findUnique({ where: { code: input.code } })) throw new DomainError('A coupon with this code already exists', 409, { code: 'This code is already used' });
    const coupon = await prisma.coupon.create({ data: { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) } });
    await audit(prisma, { actorId: req.user.id, action: 'coupon.created', entityType: 'coupon', entityId: coupon.id, metadata: { code: coupon.code } });
    res.status(201).json({ coupon: couponView(coupon) });
  });
  /** Full edit. The whole coupon is re-validated after merging; the code is fixed once anyone has used it. */
  app.patch('/api/admin/coupons/:id', promos, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new DomainError('Coupon not found', 404);
    const { active, ...rest } = z.object({ active: z.boolean().optional() }).passthrough().parse(req.body);
    const data = {};
    if (Object.keys(rest).length) {
      const merged = couponSchema.parse({
        code: existing.code, description: existing.description, kind: existing.kind, value: existing.value,
        maxDiscountPaise: existing.maxDiscountPaise == null ? null : m(existing.maxDiscountPaise), minOrderPaise: m(existing.minOrderPaise), mode: existing.mode,
        startsAt: existing.startsAt.toISOString(), endsAt: existing.endsAt.toISOString(), usageLimit: existing.usageLimit, perUserLimit: existing.perUserLimit, public: existing.public, ...rest,
      });
      if (merged.code !== existing.code) {
        if (existing.used > 0) throw new DomainError('The code can’t change after customers have used it', 409, { code: 'Already used' });
        if (await prisma.coupon.findUnique({ where: { code: merged.code } })) throw new DomainError('A coupon with this code already exists', 409, { code: 'This code is already used' });
      }
      if (merged.usageLimit != null && merged.usageLimit < existing.used) throw new DomainError(`The limit can’t be below the ${existing.used} times it has already been used`, 400, { usageLimit: 'Too low' });
      Object.assign(data, merged, { startsAt: new Date(merged.startsAt), endsAt: new Date(merged.endsAt) });
    }
    if (active !== undefined) data.active = active;
    const coupon = await prisma.coupon.update({ where: { id }, data });
    await audit(prisma, { actorId: req.user.id, action: active === undefined ? 'coupon.updated' : `coupon.${active ? 'activated' : 'paused'}`, entityType: 'coupon', entityId: id, metadata: { fields: Object.keys(data) } });
    res.json({ coupon: couponView(coupon) });
  });
  app.delete('/api/admin/coupons/:id', promos, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const c = await prisma.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
    if (!c) throw new DomainError('Coupon not found', 404);
    if (c.used || c._count.redemptions) throw new DomainError('This coupon has been used, so it’s kept for the records. Pause it instead.', 409);
    await prisma.coupon.delete({ where: { id } });
    await audit(prisma, { actorId: req.user.id, action: 'coupon.deleted', entityType: 'coupon', entityId: id, metadata: { code: c.code } });
    res.json({ ok: true });
  });
  app.post('/api/admin/coupons/bulk', promos, async (req, res) => {
    const input = bulkInput(req.body, ['pause', 'activate', 'delete']);
    const results = { done: 0, skipped: [] };
    for (const id of input.ids) {
      const c = await prisma.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
      if (!c) { results.skipped.push({ id, reason: 'Not found' }); continue; }
      if (input.action === 'delete') {
        if (c.used || c._count.redemptions) { results.skipped.push({ id, reason: `${c.code} has been used; pause it instead` }); continue; }
        await prisma.coupon.delete({ where: { id } });
      } else {
        await prisma.coupon.update({ where: { id }, data: { active: input.action === 'activate' } });
      }
      await audit(prisma, { actorId: req.user.id, action: `coupon.${input.action === 'delete' ? 'deleted' : input.action === 'activate' ? 'activated' : 'paused'}`, entityType: 'coupon', entityId: id, metadata: { code: c.code, bulk: true } });
      results.done++;
    }
    res.json(results);
  });

  /** What the signed-in staff member may do; the matrix is enforced on every route, this only shapes the UI. */
  app.get('/api/admin/capabilities', (req, res) => {
    if (!req.staffRoles?.length) throw new DomainError('Staff access required', 403);
    res.json({ finance: req.can('finance.manage'), capabilities: req.capabilities });
  });
}
