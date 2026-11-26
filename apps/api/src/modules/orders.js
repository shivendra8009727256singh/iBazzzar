import { z } from 'zod';
import express from 'express';
import { DomainError, indianStates } from '../../../../packages/shared/src/index.js';
import { checkoutSchema, addressSchema, addressPatchSchema, mobileSchema, uuid } from '../../../../packages/validation/src/index.js';
import { requireAuth, publicUser, SESSION_COOKIE, SESSION_DAYS, cookieOptions } from '../http/middleware.js';
import { transaction, toPaise } from '../lib/db.js';
import { sha256, randomToken } from '../lib/security.js';
import { audit } from '../lib/audit.js';
import { pageParams } from '../lib/http.js';
import { quote } from '../services/pricing.js';
import * as orders from '../services/orders.js';
import { getSetting } from '../services/settings.js';
import { publicQuote } from './cart.js';

const money = (v) => toPaise(v);

/** Order as the customer sees it: amounts as numbers, seller parcels with tracking, no other customers' data. */
export function customerOrder(o) {
  return {
    id: o.id, number: o.number, mode: o.mode, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
    paymentRef: o.paymentRef, paymentDueAt: o.paymentDueAt, createdAt: o.createdAt, demo: o.demo,
    subtotalPaise: money(o.subtotalPaise), discountPaise: money(o.discountPaise), shippingPaise: money(o.shippingPaise),
    codFeePaise: money(o.codFeePaise), taxPaise: money(o.taxPaise), totalPaise: money(o.totalPaise), couponCode: o.couponCode,
    address: o.shippingAddress, billingGstin: o.billingGstin, purchaseOrderId: o.purchaseOrderId,
    parcels: (o.sellerOrders ?? []).map((so) => ({
      id: so.id, sellerId: so.storeId, sellerName: so.store?.name, sellerSlug: so.store?.slug, status: so.status,
      subtotalPaise: money(so.subtotalPaise), shippingPaise: money(so.shippingPaise), taxPaise: money(so.taxPaise), totalPaise: money(so.totalPaise),
      estimatedDeliveryAt: so.estimatedDeliveryAt, invoiceNumber: so.invoice?.number ?? null,
      shipments: (so.shipments ?? []).map((s) => ({ id: s.id, provider: s.provider, carrier: s.carrier, trackingRef: s.trackingRef, status: s.status, events: s.events?.map((e) => ({ status: e.status, location: e.location, note: e.note, at: e.occurredAt, source: e.source })) ?? [] })),
      items: (o.items ?? []).filter((i) => i.sellerOrderId === so.id).map((i) => ({
        id: i.id, listingId: i.listingId, catalogProductId: i.catalogProductId, name: i.name, variantLabel: i.variantLabel, image: i.image,
        quantity: i.quantity, unitPaise: money(i.unitPaise), discountPaise: money(i.discountPaise), totalPaise: money(i.totalPaise), taxRateBps: i.taxRateBps,
      })),
    })),
    itemCount: (o.items ?? []).reduce((s, i) => s + i.quantity, 0),
    history: (o.history ?? []).map((h) => ({ status: h.status, note: h.note, at: h.createdAt, parcelId: h.sellerOrderId })),
    returns: (o.returns ?? []).map((r) => ({ id: r.id, parcelId: r.sellerOrderId, status: r.status, reason: r.reason, note: r.note, refundPaise: money(r.refundPaise), createdAt: r.createdAt })),
    refunds: (o.refunds ?? []).map((r) => ({ id: r.id, amountPaise: money(r.amountPaise), status: r.status, reason: r.reason, createdAt: r.createdAt, processedAt: r.processedAt })),
  };
}

export const orderDetailInclude = {
  items: true,
  sellerOrders: { include: { store: { select: { name: true, slug: true } }, invoice: true, shipments: { include: { events: { orderBy: { occurredAt: 'asc' } } } } }, orderBy: { createdAt: 'asc' } },
  history: { orderBy: { createdAt: 'asc' } },
  returns: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' } },
};

const guestSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().toLowerCase().max(254), phone: mobileSchema, acceptTerms: z.literal(true, { message: 'Please accept the Terms of Use to continue' }) });

export function registerOrders(app, { prisma, config, payments, limits, logger }) {
  // ───────────── Checkout ─────────────
  app.post('/api/checkout', limits.checkout, async (req, res) => {
    const key = req.get('idempotency-key');
    if (typeof key !== 'string' || !/^[A-Za-z0-9-]{8,128}$/.test(key)) throw new DomainError('A valid Idempotency-Key header is required');
    const input = checkoutSchema.parse(req.body);

    // Guest checkout: a light account is created so the customer can track the order; they set a password later.
    let user = req.user;
    if (!user) {
      const guest = guestSchema.parse(req.body.guest ?? {});
      const existing = await prisma.user.findFirst({ where: { OR: [{ email: guest.email }, { phone: guest.phone }] } });
      if (existing) throw new DomainError('An account already uses this email or mobile number. Please sign in to place your order.', 409);
      user = await prisma.user.create({ data: { name: guest.name, email: guest.email, phone: guest.phone, passwordHash: 'guest$unset', termsAcceptedAt: new Date() } });
      const token = randomToken();
      await prisma.session.create({ data: { id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000), userAgent: req.get('user-agent')?.slice(0, 300) ?? null, ip: req.ip } });
      res.cookie(SESSION_COOKIE, token, cookieOptions(config));
      await audit(prisma, { actorId: user.id, action: 'user.registered.guest', entityType: 'user', entityId: user.id, ip: req.ip });
    }

    let organizationId = null;
    let departmentId = null;
    if (input.mode === 'BUSINESS') {
      const memberships = req.user?.orgMemberships ?? [];
      const m = memberships.find((x) => x.organizationId === req.session?.activeOrganizationId) ?? memberships[0];
      if (!m) throw new DomainError('Create a business account before wholesale checkout', 403);
      if (m.organization.status !== 'APPROVED') throw new DomainError('Your business account is awaiting verification', 403);
      organizationId = m.organizationId;
      // Wholesale cart orders count against the buyer's department, like purchase orders.
      departmentId = m.departmentId ?? null;
    }
    if (input.paymentMethod === 'BANK_TRANSFER' && input.mode !== 'BUSINESS') throw new DomainError('Bank transfer is available for business orders', 400);
    if (input.paymentMethod === 'ONLINE' && !payments.configured && !config.demoPayments) throw new DomainError('Online payment isn’t available right now. Please choose another payment method.', 503);

    const fingerprint = sha256(JSON.stringify({ ...input, saveAddress: undefined }));
    const keyId = sha256(`checkout:${user.id}:${key}`);
    const order = await transaction(prisma, async (tx) => {
      const prior = await tx.idempotencyKey.findUnique({ where: { id: keyId } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new DomainError('This checkout was already submitted with different details. Please refresh and try again.', 409);
        return tx.order.findUnique({ where: { id: prior.resourceId } });
      }
      const q = await quote(tx, { ...input, state: input.address.state, pincode: input.address.pincode, userId: user.id, strict: true });
      // If prices moved since the customer last saw the total, stop and show them the new total.
      if (input.expectedTotalPaise != null && input.expectedTotalPaise !== q.totalPaise) {
        throw new DomainError('Prices in your cart changed. Please review the new total before placing your order.', 409, { quote: publicQuote(q) });
      }
      const created = await orders.createOrder(tx, {
        user, organizationId, departmentId, q, address: input.address, billingGstin: input.billingGstin, paymentMethod: input.paymentMethod,
        // Only a simulated online payment is demo money; COD, bank transfer and credit terms are real commitments.
        demo: !payments.configured && config.demoPayments && input.paymentMethod === 'ONLINE',
      });
      await tx.idempotencyKey.create({ data: { id: keyId, scope: 'checkout', userId: user.id, fingerprint, resourceId: created.id } });
      if (input.saveAddress && req.user) {
        const count = await tx.address.count({ where: { userId: user.id } });
        if (count < 10) await tx.address.create({ data: { userId: user.id, label: 'Home', ...input.address, isDefault: count === 0 } });
      }
      // The ordered items leave the saved cart.
      const cart = await tx.cart.findUnique({ where: { userId: user.id } });
      if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id, savedForLater: false, listingId: { in: input.items.map((i) => i.listingId) } } });
      return created;
    });
    const full = await prisma.order.findUnique({ where: { id: order.id }, include: orderDetailInclude });
    res.status(201).json({ order: customerOrder(full), payment: paymentOptions(full) });
  });

  function paymentOptions(order) {
    return {
      required: order.status === 'AWAITING_PAYMENT',
      method: order.paymentMethod,
      provider: payments.configured ? 'razorpay' : config.demoPayments ? 'demo' : null,
      dueAt: order.paymentDueAt,
    };
  }

  // ───────────── Customer orders ─────────────
  app.get('/api/orders', requireAuth, async (req, res) => {
    const paging = pageParams(req.query, { size: 10, max: 50 });
    const where = { userId: req.user.id, ...(req.query.status ? { status: String(req.query.status) } : {}) };
    const [rows, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: { items: true, sellerOrders: { include: { store: { select: { name: true, slug: true } } } } } }),
      prisma.order.count({ where }),
    ]);
    res.json({ orders: rows.map(customerOrder), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });

  async function ownOrder(req) {
    const id = uuid.parse(req.params.id);
    const order = await prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    if (!order || order.userId !== req.user.id) throw new DomainError('Order not found', 404);
    return order;
  }

  app.get('/api/orders/:id', requireAuth, async (req, res) => {
    const order = await ownOrder(req);
    const bank = order.paymentMethod === 'BANK_TRANSFER' && order.paymentStatus === 'BANK_TRANSFER_PENDING' ? await getSetting(prisma, 'bank') : null;
    const platform = await getSetting(prisma, 'platform');
    res.json({ order: customerOrder(order), payment: paymentOptions(order), bankTransfer: bank, returnWindowDays: platform.returnWindowDays });
  });

  app.post('/api/orders/:id/cancel', requireAuth, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body ?? {});
    await transaction(prisma, async (tx) => {
      const o = await tx.order.findUnique({ where: { id }, select: { userId: true, status: true } });
      if (!o || o.userId !== req.user.id) throw new DomainError('Order not found', 404);
      if (o.status === 'AWAITING_PAYMENT') return orders.cancelUnpaid(tx, id, { actorId: req.user.id, ownerId: req.user.id, note: 'Cancelled by customer' });
      // Paid online, cash on delivery or bank transfer: allowed until a parcel ships; online payments are refunded.
      return orders.customerCancel(tx, id, { ownerId: req.user.id, reason });
    });
    res.json({ order: customerOrder(await prisma.order.findUnique({ where: { id }, include: orderDetailInclude })) });
  });

  app.post('/api/orders/:id/returns', requireAuth, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({
      parcelId: uuid,
      reason: z.string().trim().min(10, 'Please tell the seller what went wrong (at least 10 characters)').max(1000),
      items: z.array(z.object({ orderItemId: uuid, quantity: z.number().int().min(1).max(10000) })).max(50).optional(),
    }).parse(req.body);
    const ret = await transaction(prisma, (tx) => orders.requestReturn(tx, { user: req.user, orderId: id, sellerOrderId: input.parcelId, items: input.items, reason: input.reason }));
    res.status(201).json({ return: { id: ret.id, status: ret.status, refundPaise: money(ret.refundPaise) } });
  });

  /** Data for a GST tax invoice. Issued by the seller (the supplier); IBazzzar is the marketplace operator. */
  app.get('/api/orders/:id/invoices/:parcelId', requireAuth, async (req, res) => {
    const order = await ownOrder(req);
    res.json({ invoice: await invoiceData(prisma, order, uuid.parse(req.params.parcelId)) });
  });

  // ───────────── Addresses ─────────────
  app.get('/api/account/addresses', requireAuth, async (req, res) => {
    res.json({ addresses: await prisma.address.findMany({ where: { userId: req.user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }), states: indianStates });
  });
  app.post('/api/account/addresses', requireAuth, async (req, res) => {
    const input = addressSchema.parse(req.body);
    const address = await transaction(prisma, async (tx) => {
      const count = await tx.address.count({ where: { userId: req.user.id } });
      if (count >= 10) throw new DomainError('You can save up to 10 addresses', 409);
      if (input.isDefault || count === 0) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...input, isDefault: input.isDefault || count === 0, userId: req.user.id } });
    });
    res.status(201).json({ address });
  });
  app.patch('/api/account/addresses/:id', requireAuth, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = addressPatchSchema.parse(req.body);
    const address = await transaction(prisma, async (tx) => {
      const a = await tx.address.findUnique({ where: { id } });
      if (!a || a.userId !== req.user.id) throw new DomainError('Address not found', 404);
      if (input.isDefault) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: input });
    });
    res.json({ address });
  });
  app.delete('/api/account/addresses/:id', requireAuth, async (req, res) => {
    const { count } = await prisma.address.deleteMany({ where: { id: uuid.parse(req.params.id), userId: req.user.id } });
    if (!count) throw new DomainError('Address not found', 404);
    res.json({ ok: true });
  });

  app.get('/api/account/returns', requireAuth, async (req, res) => {
    const [returns, refunds] = await Promise.all([
      prisma.returnRequest.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { number: true } }, items: { include: { orderItem: { select: { name: true, image: true } } } } } }),
      prisma.refund.findMany({ where: { order: { userId: req.user.id } }, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { number: true } } } }),
    ]);
    res.json({
      returns: returns.map((r) => ({ id: r.id, orderId: r.orderId, orderNumber: r.order.number, status: r.status, reason: r.reason, note: r.note, refundPaise: money(r.refundPaise), createdAt: r.createdAt, items: r.items.map((i) => ({ name: i.orderItem.name, image: i.orderItem.image, quantity: i.quantity })) })),
      refunds: refunds.map((r) => ({ id: r.id, orderId: r.orderId, orderNumber: r.order.number, amountPaise: money(r.amountPaise), status: r.status, reason: r.reason, createdAt: r.createdAt, processedAt: r.processedAt })),
    });
  });

  app.get('/api/account/summary', requireAuth, async (req, res) => {
    const [orderCount, activeOrders, wishlist, openTickets, unread] = await Promise.all([
      prisma.order.count({ where: { userId: req.user.id } }),
      prisma.order.count({ where: { userId: req.user.id, status: { in: ['AWAITING_PAYMENT', 'CONFIRMED', 'PARTIALLY_SHIPPED', 'SHIPPED'] } } }),
      prisma.wishlistItem.count({ where: { userId: req.user.id } }),
      prisma.supportTicket.count({ where: { userId: req.user.id, status: { not: 'CLOSED' } } }),
      prisma.notification.count({ where: { userId: req.user.id, read: false } }),
    ]);
    res.json({ user: publicUser(req.user, req.session), orderCount, activeOrders, wishlist, openTickets, unread });
  });

  // ───────────── Payments ─────────────

  /** Creates (or reuses) a Razorpay test order for the exact server-side total. */
  app.post('/api/orders/:id/payment', requireAuth, async (req, res) => {
    const order = await ownOrder(req);
    if (order.status !== 'AWAITING_PAYMENT' || order.paymentMethod !== 'ONLINE') throw new DomainError('This order isn’t waiting for an online payment', 409);
    if (!payments.configured) throw new DomainError('Online payments aren’t configured yet', 503);
    const total = money(order.totalPaise);
    const prior = await prisma.paymentIntent.findFirst({ where: { orderId: order.id, status: 'CREATED', amountPaise: total } });
    const intent = prior ?? await (async () => {
      const remote = await payments.createOrder({ amountPaise: total, receipt: order.number });
      return prisma.paymentIntent.create({ data: { orderId: order.id, provider: 'razorpay', providerOrderId: remote.id, amountPaise: total } });
    })();
    res.json({ key: payments.publicKey, providerOrderId: intent.providerOrderId, amount: total, currency: 'INR', name: 'IBazzzar', description: `Order ${order.number}`, prefill: { name: req.user.name, email: req.user.email, contact: req.user.phone } });
  });

  app.post('/api/orders/:id/payment/verify', requireAuth, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const body = z.object({ razorpay_order_id: z.string().min(5).max(64), razorpay_payment_id: z.string().min(5).max(64), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i) }).parse(req.body);
    if (!payments.verifyCheckoutSignature({ orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature })) {
      throw new DomainError('We couldn’t verify this payment. If money was deducted, it will be confirmed automatically or refunded by the bank.', 400);
    }
    await transaction(prisma, async (tx) => {
      const intent = await tx.paymentIntent.findUnique({ where: { providerOrderId: body.razorpay_order_id }, include: { order: true } });
      if (!intent || intent.orderId !== id || intent.order.userId !== req.user.id) throw new DomainError('Order not found', 404);
      await recordCapture(tx, intent, { providerPaymentId: body.razorpay_payment_id, amountPaise: money(intent.amountPaise), source: 'CHECKOUT_SIGNATURE', actorId: req.user.id });
    });
    res.json({ order: customerOrder(await prisma.order.findUnique({ where: { id }, include: orderDetailInclude })) });
  });

  async function recordCapture(tx, intent, { providerPaymentId, amountPaise, source, actorId, method }) {
    await tx.paymentTransaction.upsert({
      where: { providerPaymentId }, update: {},
      create: { intentId: intent.id, providerPaymentId, amountPaise, status: 'captured', method: method ?? null, source },
    });
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'CAPTURED' } });
    await orders.applyPayment(tx, intent.orderId, { paymentStatus: 'PAID', reference: providerPaymentId, actorId, amountPaise });
  }

  /** Razorpay webhook: raw body, verified HMAC, deduplicated by event id, amount and currency re-checked. */
  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    if (!payments.webhookConfigured) throw new DomainError('Payment webhook is not configured', 503);
    if (!Buffer.isBuffer(req.body) || !payments.verifyWebhook(req.body, req.get('x-razorpay-signature'))) throw new DomainError('Invalid webhook signature', 400);
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { throw new DomainError('Invalid JSON', 400); }
    const eventId = req.get('x-razorpay-event-id');
    if (!eventId || eventId.length > 200) throw new DomainError('Missing event ID', 400);
    if (await prisma.paymentWebhookEvent.findUnique({ where: { id: eventId } })) return res.json({ received: true, duplicate: true });

    const payment = event.payload?.payment?.entity;
    let outcome = 'ignored';
    let orderId = null;
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      await transaction(prisma, async (tx) => {
        const intent = payment && await tx.paymentIntent.findUnique({ where: { providerOrderId: payment.order_id }, include: { order: true } });
        if (!intent) { outcome = 'unknown-order'; return; }
        orderId = intent.orderId;
        if (payment.currency !== 'INR' || payment.status !== 'captured' || payment.amount !== money(intent.amountPaise) || payment.amount !== money(intent.order.totalPaise)) {
          outcome = 'amount-mismatch';
          await audit(tx, { action: 'payment.mismatch', entityType: 'order', entityId: intent.orderId, metadata: { eventId, amount: payment.amount, currency: payment.currency } });
          return;
        }
        if (intent.order.status === 'CANCELLED') {
          // Paid after expiry: money must go back. Finance sees this in the payments console.
          outcome = 'paid-after-cancel';
          await audit(tx, { action: 'payment.after-cancel', entityType: 'order', entityId: intent.orderId, metadata: { paymentId: payment.id } });
          return;
        }
        await recordCapture(tx, intent, { providerPaymentId: payment.id, amountPaise: payment.amount, source: 'WEBHOOK', actorId: null, method: payment.method });
        outcome = 'captured';
      });
    } else if (event.event === 'payment.failed' && payment?.order_id) {
      const intent = await prisma.paymentIntent.findUnique({ where: { providerOrderId: payment.order_id } });
      if (intent) { orderId = intent.orderId; await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED' } }); outcome = 'failed'; }
    }
    await prisma.paymentWebhookEvent.create({ data: { id: eventId, type: String(event.event).slice(0, 60), orderId, outcome } }).catch(() => {});
    logger?.info({ eventId, outcome }, 'Payment webhook processed');
    res.json({ received: true });
  });

  /** Demo mode only (never production): simulates a successful payment so the full flow can be tried without money. */
  app.post('/api/orders/:id/demo-payment', requireAuth, async (req, res) => {
    if (!config.demoPayments || config.production || payments.configured) throw new DomainError('Payment simulation is only available in demo mode', 403);
    const order = await ownOrder(req);
    await transaction(prisma, (tx) => orders.applyPayment(tx, order.id, { paymentStatus: 'DEMO_SIMULATED', reference: `txn_${randomToken(6)}`, actorId: req.user.id }));
    res.json({ order: customerOrder(await prisma.order.findUnique({ where: { id: order.id }, include: orderDetailInclude })) });
  });
}

export async function invoiceData(prisma, order, parcelId) {
  const so = order.sellerOrders.find((s) => s.id === parcelId);
  if (!so) throw new DomainError('Invoice not found', 404);
  if (!so.invoice) throw new DomainError('The seller issues the tax invoice when your parcel ships', 409);
  const store = await prisma.sellerStore.findUnique({ where: { id: so.storeId } });
  const items = order.items.filter((i) => i.sellerOrderId === so.id);
  const sum = (k) => items.reduce((s, i) => s + money(i[k]), 0);
  const org = order.organizationId ? await prisma.organization.findUnique({ where: { id: order.organizationId }, select: { legalName: true, tradeName: true, registeredAddress: true } }) : null;
  const shipTo = { name: order.shippingAddress.name, address: order.shippingAddress };
  return {
    number: so.invoice.number, financialYear: so.invoice.financialYear, issuedAt: so.invoice.issuedAt, orderNumber: order.number, orderDate: order.createdAt,
    seller: { name: store.legalName, tradeName: store.name, gstin: store.gstin, pan: store.pan, address: store.pickupAddress, stateCode: store.stateCode, gstRegistered: store.gstRegistered },
    buyer: org ? { name: org.legalName, tradeName: org.tradeName, address: org.registeredAddress, gstin: order.billingGstin, business: true } : { name: order.shippingAddress.name, address: order.shippingAddress, gstin: order.billingGstin, business: false },
    shipTo,
    placeOfSupply: order.placeOfSupply, reverseCharge: false,
    items: items.map((i) => ({ name: i.name, variantLabel: i.variantLabel, sku: i.sku, hsnCode: i.hsnCode, quantity: i.quantity, unitPaise: money(i.unitPaise), discountPaise: money(i.discountPaise), taxablePaise: money(i.taxablePaise), taxRateBps: i.taxRateBps, cgstPaise: money(i.cgstPaise), sgstPaise: money(i.sgstPaise), igstPaise: money(i.igstPaise), totalPaise: money(i.totalPaise) })),
    totals: { taxablePaise: sum('taxablePaise'), cgstPaise: sum('cgstPaise'), sgstPaise: sum('sgstPaise'), igstPaise: sum('igstPaise'), shippingPaise: money(so.shippingPaise), totalPaise: money(so.totalPaise) },
    note: store.gstRegistered ? null : 'The seller is not registered under GST; this is a bill of supply and no GST is charged separately.',
  };
}
