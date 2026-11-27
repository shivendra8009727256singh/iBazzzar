// Order lifecycle. Every public function expects a transaction client (tx) and leaves the order, its seller orders,
// stock, ledger, history and audit consistent, or throws and changes nothing.
import { randomUUID } from 'node:crypto';
import {
  DomainError, assertTransition, sellerOrderFlow, orderStatusFrom, commissionPaise, money, stateCode,
} from '../../../../packages/shared/src/index.js';
import { toPaise } from '../lib/db.js';
import { audit, notifyStoreOwners } from '../lib/audit.js';
import { notifyCustomer } from '../lib/email.js';
import { nextNumber, nextInvoiceNumber } from '../lib/sequence.js';
import { shortRef } from '../lib/http.js';
import * as inventory from './inventory.js';
import { getSetting, commissionRateFor } from './settings.js';
import { couponUsesBy } from './pricing.js';

const CONFIRMED_PAYMENTS = ['PAID', 'DEMO_SIMULATED', 'COD_PENDING', 'COD_COLLECTED', 'ON_TERMS', 'REFUNDED', 'PARTIALLY_REFUNDED'];
export const isPaidOnline = (o) => ['PAID', 'DEMO_SIMULATED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.paymentStatus);

async function history(tx, orderId, status, { note = null, actorId = null, sellerOrderId = null } = {}) {
  await tx.orderStatusHistory.create({ data: { orderId, sellerOrderId, status, note, actorId } });
}

/** Locks the order row so concurrent payment/cancel/expiry calls serialise on it. */
export async function lockOrder(tx, orderId) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  return tx.order.findUnique({ where: { id: orderId }, include: { sellerOrders: true, items: true } });
}

// ───────────── Create ─────────────

/**
 * Persists a priced quote as an order.
 * @param q quote from pricing.quote (must include tax, i.e. computed with a delivery state)
 */
export async function createOrder(tx, { user, organizationId = null, purchaseOrderId = null, departmentId = null, q, address, billingGstin, paymentMethod, demo = false }) {
  if (q.taxPaise == null) throw new DomainError('Choose a delivery address before placing the order');
  if (!q.serviceable) throw new DomainError('We can’t deliver to this PIN code yet. Please use another address.', 409);
  if (paymentMethod === 'COD' && !q.payment.cod.available) throw new DomainError(q.payment.cod.reason || 'Cash on delivery isn’t available for this order', 409);

  const platform = await getSetting(tx, 'platform');
  const now = new Date();
  const immediate = paymentMethod === 'COD' || paymentMethod === 'CREDIT_TERMS';
  const paymentStatus = { ONLINE: 'UNPAID', BANK_TRANSFER: 'BANK_TRANSFER_PENDING', COD: 'COD_PENDING', CREDIT_TERMS: 'ON_TERMS' }[paymentMethod];
  const paymentDueAt = paymentMethod === 'ONLINE' ? new Date(now.getTime() + platform.paymentWindowMinutes * 60_000)
    : paymentMethod === 'BANK_TRANSFER' ? new Date(now.getTime() + platform.bankTransferWindowDays * 86_400_000)
    : paymentMethod === 'CREDIT_TERMS' ? new Date(now.getTime() + (q.creditDays ?? 30) * 86_400_000) : null;

  const number = await nextNumber(tx, 'order', 'IBZ');
  const order = await tx.order.create({
    data: {
      number, userId: user.id, organizationId, purchaseOrderId, departmentId, mode: q.mode,
      status: immediate ? 'CONFIRMED' : 'AWAITING_PAYMENT', paymentStatus, paymentMethod, paymentDueAt,
      subtotalPaise: q.subtotalPaise, discountPaise: q.discountPaise, shippingPaise: q.shippingPaise, codFeePaise: q.codFeePaise,
      taxPaise: q.taxPaise, totalPaise: q.totalPaise, couponCode: q.coupon?.code ?? null,
      shippingAddress: address, billingGstin: billingGstin ?? null, placeOfSupply: stateCode(address.state), demo,
    },
  });

  const lineRecords = [];
  for (const g of q.groups) {
    const own = q.lines.filter((l) => l.storeId === g.storeId);
    const maxDays = g.estimate?.maxDays;
    const so = await tx.sellerOrder.create({
      data: {
        orderId: order.id, storeId: g.storeId,
        subtotalPaise: own.reduce((s, l) => s + l.lineTotalPaise, 0),
        discountPaise: own.reduce((s, l) => s + l.discountPaise, 0),
        shippingPaise: g.shippingPaise, taxPaise: g.taxPaise, totalPaise: g.totalPaise,
        estimatedDeliveryAt: maxDays ? new Date(now.getTime() + maxDays * 86_400_000) : null,
      },
    });
    for (const l of own) {
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id, sellerOrderId: so.id, listingId: l.listingId, catalogProductId: l.catalogProductId,
          name: l.name, variantLabel: l.variantLabel, sku: l.sku, hsnCode: l.hsnCode, image: l.image,
          quantity: l.quantity, unitPaise: l.unitPaise, mrpPaise: l.mrpPaise, lineTotalPaise: l.lineTotalPaise,
          discountPaise: l.discountPaise, taxRateBps: l.taxRateBps, taxablePaise: l.taxablePaise,
          cgstPaise: l.cgstPaise, sgstPaise: l.sgstPaise, igstPaise: l.igstPaise, totalPaise: l.totalPaise,
        },
      });
      lineRecords.push({ listingId: l.listingId, quantity: l.quantity, orderItemId: item.id, name: l.name });
    }
  }

  if (immediate) await inventory.deduct(tx, lineRecords, `order:${number}`);
  else await inventory.reserve(tx, lineRecords, paymentDueAt);

  if (q.coupon) {
    const coupon = await tx.coupon.findUnique({ where: { code: q.coupon.code } });
    // Conditional increment: if the usage limit was reached by a concurrent order, nothing updates and we stop.
    const updated = await tx.coupon.updateMany({
      where: { id: coupon.id, ...(coupon.usageLimit != null ? { used: { lt: coupon.usageLimit } } : {}) },
      data: { used: { increment: 1 } },
    });
    if (!updated.count) throw new DomainError('This coupon has just reached its usage limit', 409, { coupon: coupon.code });
    // The increment above holds the coupon row lock until commit, so this count sees any order placed at the same moment.
    if (await couponUsesBy(tx, coupon.id, user.id) >= coupon.perUserLimit) throw new DomainError('You have already used this coupon', 409, { coupon: coupon.code });
    await tx.couponRedemption.create({ data: { couponId: coupon.id, userId: user.id, orderId: order.id } });
  }

  await history(tx, order.id, order.status, {
    note: { COD: 'Cash on delivery', CREDIT_TERMS: 'Approved payment terms', BANK_TRANSFER: 'Awaiting bank transfer', ONLINE: null }[paymentMethod],
    actorId: user.id,
  });
  await audit(tx, { actorId: user.id, action: 'order.created', entityType: 'order', entityId: order.id, metadata: { number, totalPaise: q.totalPaise, paymentMethod } });
  if (immediate) await announceConfirmed(tx, order);
  return order;
}

async function announceConfirmed(tx, order) {
  const items = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { name: true, variantLabel: true, quantity: true, totalPaise: true } });
  await notifyCustomer(tx, order.userId, {
    kind: 'order.confirmed', title: 'Order confirmed', subject: `Order ${order.number} confirmed`, link: `/account/orders/${order.id}`,
    body: `Thank you! Order ${order.number} is confirmed and with the seller. Total ${money(toPaise(order.totalPaise))}${order.paymentMethod === 'COD' ? ', to pay on delivery' : ''}.`,
    lines: items.map((i) => `${i.quantity} × ${i.name}${i.variantLabel && i.variantLabel !== 'Standard' ? ` (${i.variantLabel})` : ''} — ${money(toPaise(i.totalPaise))}`),
  });
  const sellerOrders = await tx.sellerOrder.findMany({ where: { orderId: order.id }, select: { storeId: true } });
  for (const so of sellerOrders) {
    await notifyStoreOwners(tx, so.storeId, { title: 'New order to fulfil', body: `Order ${order.number} is ready for packing.`, link: '/seller/orders' });
  }
}

// ───────────── Payment ─────────────

/**
 * Single path for every payment confirmation (verified checkout signature, verified webhook, bank transfer receipt,
 * demo simulation). Idempotent: a second confirmation of the same order is a no-op.
 */
export async function applyPayment(tx, orderId, { paymentStatus, reference, actorId, amountPaise }) {
  const order = await lockOrder(tx, orderId);
  if (!order) throw new DomainError('Order not found', 404);
  if (['PAID', 'DEMO_SIMULATED'].includes(order.paymentStatus)) return order;
  if (order.status !== 'AWAITING_PAYMENT') throw new DomainError('This order can no longer receive payment', 409);
  if (amountPaise != null && amountPaise !== toPaise(order.totalPaise)) throw new DomainError('Payment amount does not match the order', 400);

  await inventory.consumeReservations(tx, order.id, `order:${order.number}`);
  const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', paymentStatus, paymentRef: reference ?? null, paymentDueAt: null, paidAt: new Date() } });
  await history(tx, order.id, 'CONFIRMED', { note: `Payment received${reference ? ` (${reference})` : ''}`, actorId });
  await audit(tx, { actorId, action: paymentStatus === 'DEMO_SIMULATED' ? 'payment.demo-simulated' : 'payment.captured', entityType: 'order', entityId: order.id, metadata: { reference } });
  await announceConfirmed(tx, updated);
  return updated;
}

// ───────────── Cancellation ─────────────

async function cancelWhole(tx, order, { actorId, note }) {
  await inventory.releaseReservations(tx, order.id);
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId: order.id } });
  if (redemption) {
    await tx.coupon.update({ where: { id: redemption.couponId }, data: { used: { decrement: 1 } } });
    await tx.couponRedemption.delete({ where: { orderId: order.id } });
  }
  await tx.sellerOrder.updateMany({ where: { orderId: order.id }, data: { status: 'CANCELLED' } });
  const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', paymentDueAt: null } });
  await history(tx, order.id, 'CANCELLED', { note, actorId });
  await audit(tx, { actorId, action: 'order.cancelled', entityType: 'order', entityId: order.id, metadata: { note } });
  return updated;
}

/** Customer or staff cancels an order that has not been paid. Paid orders go through seller cancellation or returns. */
export async function cancelUnpaid(tx, orderId, { actorId, ownerId, note }) {
  const order = await lockOrder(tx, orderId);
  if (!order || (ownerId && order.userId !== ownerId)) throw new DomainError('Order not found', 404);
  if (order.status === 'CANCELLED') return order;
  if (order.status !== 'AWAITING_PAYMENT') throw new DomainError('Only an unpaid order can be cancelled here. For a paid order, contact the seller or request a return.', 409);
  return cancelWhole(tx, order, { actorId, note });
}

/** Customer cancels a COD order before any parcel has shipped. */
export async function cancelCodBeforeShipping(tx, orderId, { ownerId }) {
  const order = await lockOrder(tx, orderId);
  if (!order || order.userId !== ownerId) throw new DomainError('Order not found', 404);
  if (order.paymentMethod !== 'COD') throw new DomainError('Only cash-on-delivery orders can be cancelled this way', 409);
  if (order.sellerOrders.some((so) => !['PENDING', 'PACKED', 'CANCELLED'].includes(so.status))) throw new DomainError('Part of this order has already shipped', 409);
  for (const so of order.sellerOrders.filter((s) => s.status !== 'CANCELLED')) {
    await restockSellerOrder(tx, order, so.id, 'Customer cancelled cash-on-delivery order');
  }
  await tx.sellerOrder.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } });
  const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
  await history(tx, orderId, 'CANCELLED', { note: 'Cancelled by customer before shipping', actorId: ownerId });
  for (const so of order.sellerOrders) await notifyStoreOwners(tx, so.storeId, { title: 'Order cancelled', body: `The customer cancelled order ${order.number} before shipping.`, link: '/seller/orders' });
  await audit(tx, { actorId: ownerId, action: 'order.cancelled', entityType: 'order', entityId: orderId, metadata: { cod: true } });
  return updated;
}

async function restockSellerOrder(tx, order, sellerOrderId, note) {
  const items = order.items.filter((i) => i.sellerOrderId === sellerOrderId);
  await inventory.restock(tx, items.map((i) => ({ listingId: i.listingId, quantity: i.quantity })), 'RETURN_RESTOCK', `${order.number}: ${note}`);
}

/** Cancels unpaid orders whose payment window has passed. Run by the scheduled jobs (services/jobs.js); each order is its own transaction. */
export async function expireUnpaid(prisma, at = new Date()) {
  const stale = await prisma.order.findMany({
    where: { status: 'AWAITING_PAYMENT', paymentDueAt: { lt: at } },
    select: { id: true }, take: 500, orderBy: { paymentDueAt: 'asc' },
  });
  let expired = 0;
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order?.status !== 'AWAITING_PAYMENT' || order.paymentDueAt > at) return;
      await cancelWhole(tx, order, { actorId: null, note: order.paymentMethod === 'BANK_TRANSFER' ? 'Bank transfer not received in time' : 'Payment window expired' });
      await notifyCustomer(tx, order.userId, { kind: 'order.expired', title: 'Order expired', body: `Payment for ${order.number} wasn’t received in time, so the reserved stock was released.`, link: `/account/orders/${order.id}` });
      expired++;
    });
  }
  return expired;
}

// ───────────── Fulfilment ─────────────

async function lockSellerOrder(tx, sellerOrderId, storeId) {
  await tx.$queryRaw`SELECT id FROM seller_orders WHERE id = ${sellerOrderId}::uuid FOR UPDATE`;
  const so = await tx.sellerOrder.findUnique({ where: { id: sellerOrderId }, include: { order: { include: { items: true, sellerOrders: true } }, items: true } });
  if (!so || (storeId && so.storeId !== storeId)) throw new DomainError('Order not found', 404);
  return so;
}

async function syncOrderStatus(tx, orderId, actorId) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { sellerOrders: true } });
  const status = orderStatusFrom(order.sellerOrders.map((s) => s.status));
  const data = {};
  if (status !== order.status) data.status = status;
  // Cash is collected when the last live parcel is delivered.
  if (order.paymentStatus === 'COD_PENDING' && status === 'DELIVERED') { data.paymentStatus = 'COD_COLLECTED'; data.paidAt = new Date(); }
  if (Object.keys(data).length) {
    await tx.order.update({ where: { id: orderId }, data });
    if (data.status) await history(tx, orderId, status, { actorId });
  }
  return status;
}

export async function markPacked(tx, sellerOrderId, { storeId, actorId }) {
  const so = await lockSellerOrder(tx, sellerOrderId, storeId);
  if (so.order.status === 'AWAITING_PAYMENT' || so.order.status === 'CANCELLED') throw new DomainError('This order isn’t ready for fulfilment yet', 409);
  assertTransition(so.status, 'PACKED', sellerOrderFlow);
  await tx.sellerOrder.update({ where: { id: so.id }, data: { status: 'PACKED' } });
  await history(tx, so.orderId, 'PACKED', { sellerOrderId: so.id, actorId });
  await audit(tx, { actorId, action: 'fulfilment.packed', entityType: 'seller_order', entityId: so.id });
  return so;
}

/** Books a shipment (sandbox or the seller's own courier), issues the GST invoice and marks the parcel shipped. */
export async function ship(tx, sellerOrderId, { storeId, actorId, booking }) {
  const so = await lockSellerOrder(tx, sellerOrderId, storeId);
  assertTransition(so.status, 'SHIPPED', sellerOrderFlow);
  const shipment = await tx.shipment.create({
    data: {
      sellerOrderId: so.id, provider: booking.provider, carrier: booking.carrier, trackingRef: booking.trackingRef,
      items: { create: so.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })) },
      events: { create: { status: 'CREATED', source: booking.provider === 'SANDBOX' ? 'SANDBOX' : 'SELLER', note: `Booked with ${booking.carrier}` } },
    },
  });
  const existing = await tx.invoice.findUnique({ where: { sellerOrderId: so.id } });
  if (!existing) {
    const { number, financialYear } = await nextInvoiceNumber(tx, so.storeId);
    await tx.invoice.create({ data: { sellerOrderId: so.id, storeId: so.storeId, number, financialYear } });
  }
  await tx.sellerOrder.update({ where: { id: so.id }, data: { status: 'SHIPPED' } });
  await history(tx, so.orderId, 'SHIPPED', { sellerOrderId: so.id, note: `${booking.carrier} · ${booking.trackingRef}`, actorId });
  await syncOrderStatus(tx, so.orderId, actorId);
  await notifyCustomer(tx, so.order.userId, { kind: 'parcel.shipped', title: 'Your parcel is on its way', body: `Part of order ${so.order.number} shipped with ${booking.carrier} (tracking ${booking.trackingRef}).`, link: `/account/orders/${so.orderId}` });
  await audit(tx, { actorId, action: 'fulfilment.shipped', entityType: 'seller_order', entityId: so.id, metadata: { carrier: booking.carrier, trackingRef: booking.trackingRef } });
  return shipment;
}

/** Adds a courier tracking event. DELIVERED closes the parcel and records the seller's earnings in the ledger. */
export async function addTrackingEvent(tx, shipmentId, { storeId, actorId, status, location, note, source, flow }) {
  await tx.$queryRaw`SELECT id FROM shipments WHERE id = ${shipmentId}::uuid FOR UPDATE`;
  const shipment = await tx.shipment.findUnique({ where: { id: shipmentId }, include: { sellerOrder: true } });
  if (!shipment || (storeId && shipment.sellerOrder.storeId !== storeId)) throw new DomainError('Shipment not found', 404);
  assertTransition(shipment.status, status, flow);
  await tx.trackingEvent.create({ data: { shipmentId, status, location, note, source } });
  await tx.shipment.update({ where: { id: shipmentId }, data: { status } });
  if (status === 'DELIVERED') await markDelivered(tx, shipment.sellerOrderId, { actorId });
  return tx.shipment.findUnique({ where: { id: shipmentId }, include: { events: { orderBy: { occurredAt: 'asc' } } } });
}

async function markDelivered(tx, sellerOrderId, { actorId }) {
  const so = await lockSellerOrder(tx, sellerOrderId);
  if (so.status === 'DELIVERED') return;
  assertTransition(so.status, 'DELIVERED', sellerOrderFlow);
  await tx.sellerOrder.update({ where: { id: so.id }, data: { status: 'DELIVERED' } });
  await history(tx, so.orderId, 'DELIVERED', { sellerOrderId: so.id, actorId });
  await syncOrderStatus(tx, so.orderId, actorId);
  await recordEarnings(tx, so);
  await notifyCustomer(tx, so.order.userId, { kind: 'parcel.delivered', title: 'Delivered', body: `A parcel from order ${so.order.number} was delivered. We hope you love it.`, link: `/account/orders/${so.orderId}` });
}

/**
 * Seller earnings: gross goods at the price before platform-funded coupons, plus shipping collected,
 * minus commission on goods. Demo-simulated payments are flagged so they never count as real money.
 */
async function recordEarnings(tx, so) {
  const order = await tx.order.findUnique({ where: { id: so.orderId } });
  const demo = order.paymentStatus === 'DEMO_SIMULATED' || order.demo;
  const goods = so.items.reduce((s, i) => s + toPaise(i.lineTotalPaise), 0);
  const firstItem = so.items[0];
  const product = firstItem ? await tx.catalogProduct.findUnique({ where: { id: firstItem.catalogProductId }, select: { categoryId: true } }) : null;
  const rate = await commissionRateFor(tx, product?.categoryId, so.storeId);
  const fee = commissionPaise(goods, rate);
  const base = { storeId: so.storeId, orderId: so.orderId, sellerOrderId: so.id, demo };
  await tx.settlementEntry.create({ data: { ...base, kind: 'SALE', amountPaise: goods, note: `Order ${order.number}` } });
  if (toPaise(so.shippingPaise)) await tx.settlementEntry.create({ data: { ...base, kind: 'SHIPPING_FEE', amountPaise: toPaise(so.shippingPaise), note: 'Delivery charge collected' } });
  if (fee) await tx.settlementEntry.create({ data: { ...base, kind: 'COMMISSION', amountPaise: -fee, note: `${rate / 100}% marketplace commission` } });
}

/** Seller cannot fulfil: cancels their part, puts stock back and records the refund owed for that part. */
export async function sellerCancel(tx, sellerOrderId, { storeId, actorId, reason }) {
  const so = await lockSellerOrder(tx, sellerOrderId, storeId);
  assertTransition(so.status, 'CANCELLED', sellerOrderFlow);
  const order = so.order;
  // Unpaid orders are not visible for fulfilment; the customer pays for the whole order or it expires.
  if (order.status === 'AWAITING_PAYMENT') throw new DomainError('This order hasn’t been paid yet', 409);
  await restockSellerOrder(tx, order, so.id, 'Seller cancelled');
  await tx.sellerOrder.update({ where: { id: so.id }, data: { status: 'CANCELLED' } });
  await history(tx, so.orderId, 'CANCELLED', { sellerOrderId: so.id, note: `Seller cancelled: ${reason}`, actorId });
  await syncOrderStatus(tx, so.orderId, actorId);
  if (isPaidOnline(order)) {
    await createRefund(tx, { order, sellerOrder: so, amountPaise: toPaise(so.totalPaise), reason: `Seller cancelled: ${reason}`, returnId: null });
  }
  await notifyCustomer(tx, order.userId, { kind: 'parcel.cancelled', title: 'Part of your order was cancelled', body: `The seller couldn’t fulfil part of order ${order.number}: ${reason}.${isPaidOnline(order) ? ' A refund has been initiated.' : ''}`, link: `/account/orders/${order.id}` });
  await audit(tx, { actorId, action: 'fulfilment.cancelled', entityType: 'seller_order', entityId: so.id, metadata: { reason } });
}

/**
 * The customer cancels an order before any parcel has shipped. Stock goes back; money already received online is
 * refunded per parcel. Unpaid orders use cancelUnpaid instead.
 */
export async function customerCancel(tx, orderId, { ownerId, reason }) {
  const order = await lockOrder(tx, orderId);
  if (!order || order.userId !== ownerId) throw new DomainError('Order not found', 404);
  if (order.status === 'CANCELLED') return order;
  if (order.status === 'AWAITING_PAYMENT') return cancelUnpaid(tx, orderId, { actorId: ownerId, ownerId, note: 'Cancelled by customer' });
  const live = order.sellerOrders.filter((so) => so.status !== 'CANCELLED');
  if (live.some((so) => !['PENDING', 'PACKED'].includes(so.status))) throw new DomainError('Part of this order has already shipped. You can return it once it’s delivered.', 409);
  const why = reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer';
  for (const so of live) {
    await restockSellerOrder(tx, order, so.id, 'Customer cancelled');
    await tx.sellerOrder.update({ where: { id: so.id }, data: { status: 'CANCELLED' } });
    await history(tx, orderId, 'CANCELLED', { sellerOrderId: so.id, note: why, actorId: ownerId });
    if (isPaidOnline(order)) await createRefund(tx, { order, sellerOrder: so, amountPaise: toPaise(so.totalPaise), reason: why, returnId: null });
    await notifyStoreOwners(tx, so.storeId, { title: 'Order cancelled by the customer', body: `Order ${order.number} was cancelled before dispatch. Don’t ship it.`, link: '/seller/orders' });
  }
  await syncOrderStatus(tx, orderId, ownerId);
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (redemption) await tx.coupon.update({ where: { id: redemption.couponId }, data: { used: { decrement: 1 } } });
  await notifyCustomer(tx, order.userId, {
    kind: 'order.cancelled', title: 'Order cancelled', link: `/account/orders/${orderId}`,
    body: `Order ${order.number} has been cancelled.${isPaidOnline(order) ? ' Your refund has been initiated; banks usually take 5–7 working days to show it.' : ''}`,
  });
  await audit(tx, { actorId: ownerId, action: 'order.cancelled.customer', entityType: 'order', entityId: orderId, metadata: { reason: reason ?? null, refunded: isPaidOnline(order) } });
  return tx.order.findUnique({ where: { id: orderId } });
}

// ───────────── Refunds ─────────────

async function createRefund(tx, { order, sellerOrder, amountPaise, reason, returnId }) {
  const status = order.paymentStatus === 'DEMO_SIMULATED' ? 'DEMO_SIMULATED' : 'PENDING_PROVIDER';
  const refund = await tx.refund.create({ data: { orderId: order.id, storeId: sellerOrder.storeId, returnId, amountPaise, reason, status } });
  // Reverse what the seller earned for the refunded value, if earnings were already booked.
  const booked = await tx.settlementEntry.findMany({ where: { sellerOrderId: sellerOrder.id, kind: { in: ['SALE', 'COMMISSION'] } } });
  if (booked.length) {
    const sale = booked.filter((e) => e.kind === 'SALE').reduce((s, e) => s + toPaise(e.amountPaise), 0);
    const commission = booked.filter((e) => e.kind === 'COMMISSION').reduce((s, e) => s + toPaise(e.amountPaise), 0);
    const goodsRefund = Math.min(sale, amountPaise);
    const share = sale ? goodsRefund / sale : 0;
    const demo = booked[0].demo;
    const base = { storeId: sellerOrder.storeId, orderId: order.id, sellerOrderId: sellerOrder.id, demo };
    await tx.settlementEntry.create({ data: { ...base, kind: 'REFUND_ADJUSTMENT', amountPaise: -goodsRefund, note: reason } });
    if (commission) await tx.settlementEntry.create({ data: { ...base, kind: 'COMMISSION_REVERSAL', amountPaise: -Math.round(commission * share), note: 'Commission returned on refund' } });
  }
  const refunded = await tx.refund.aggregate({ where: { orderId: order.id }, _sum: { amountPaise: true } });
  const total = toPaise(refunded._sum.amountPaise ?? 0);
  if (order.paymentStatus !== 'DEMO_SIMULATED' && isPaidOnline(order)) {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: total >= toPaise(order.totalPaise) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
  }
  await notifyCustomer(tx, order.userId, { kind: 'refund.created', title: 'Refund initiated', body: `A refund of ${money(amountPaise)} for order ${order.number} has been initiated.`, link: `/account/orders/${order.id}` });
  return refund;
}

/**
 * Staff-initiated refund (goodwill, partial, or a correction) for one parcel. Never more than what is still refundable
 * for that parcel, and only on orders where money was actually received.
 */
export async function staffRefund(tx, { orderId, sellerOrderId, amountPaise, reason, actorId }) {
  const order = await lockOrder(tx, orderId);
  if (!order) throw new DomainError('Order not found', 404);
  const so = order.sellerOrders.find((s) => s.id === sellerOrderId);
  if (!so) throw new DomainError('Parcel not found', 404);
  const received = isPaidOnline(order) || ['COD_COLLECTED', 'ON_TERMS'].includes(order.paymentStatus);
  if (!received) throw new DomainError('No payment has been received for this order yet', 409);
  const already = await tx.refund.aggregate({ where: { orderId, storeId: so.storeId }, _sum: { amountPaise: true } });
  const refundable = toPaise(so.totalPaise) - toPaise(already._sum.amountPaise ?? 0);
  if (amountPaise > refundable) throw new DomainError(`At most ${money(refundable)} can still be refunded for this parcel`, 409);
  const refund = await createRefund(tx, { order, sellerOrder: so, amountPaise, reason: `Staff refund: ${reason}`, returnId: null });
  await history(tx, orderId, 'REFUND_CREATED', { sellerOrderId, note: `${money(amountPaise)} — ${reason}`, actorId });
  await audit(tx, { actorId, action: 'refund.staff-created', entityType: 'order', entityId: orderId, metadata: { sellerOrderId, amountPaise, reason } });
  return refund;
}

/** Finance records that a credit-terms (ON_TERMS) order has been paid by the business. */
export async function recordTermsPayment(tx, orderId, { reference, actorId }) {
  const order = await lockOrder(tx, orderId);
  if (!order) throw new DomainError('Order not found', 404);
  if (order.paymentStatus !== 'ON_TERMS') throw new DomainError('This order is not on credit terms', 409);
  // The due date stays on the order so statements can show whether the business paid on time.
  const updated = await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID', paymentRef: reference, paidAt: new Date() } });
  await history(tx, orderId, 'TERMS_PAID', { note: `Payment received (${reference})`, actorId });
  await audit(tx, { actorId, action: 'payment.terms-received', entityType: 'order', entityId: orderId, metadata: { reference } });
  await notifyCustomer(tx, order.userId, { kind: 'payment.received', title: 'Payment received', body: `We’ve recorded payment for ${order.number}. Thank you.`, link: `/account/orders/${orderId}` });
  return updated;
}

/** Unpaid credit-terms balance of a business account. */
export async function creditOutstanding(tx, organizationId) {
  const sum = await tx.order.aggregate({ where: { organizationId, paymentStatus: 'ON_TERMS', status: { not: 'CANCELLED' } }, _sum: { totalPaise: true } });
  return toPaise(sum._sum.totalPaise ?? 0);
}

// ───────────── Returns ─────────────

/** Customer asks to return delivered items from one seller's parcel. */
export async function requestReturn(tx, { user, orderId, sellerOrderId, items, reason }) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.userId !== user.id) throw new DomainError('Order not found', 404);
  const so = await lockSellerOrder(tx, sellerOrderId);
  if (so.orderId !== order.id) throw new DomainError('Order not found', 404);
  if (so.status !== 'DELIVERED') throw new DomainError('Returns open once the parcel is delivered', 409);
  const { returnWindowDays } = await getSetting(tx, 'platform');
  const delivered = await tx.orderStatusHistory.findFirst({ where: { sellerOrderId: so.id, status: 'DELIVERED' }, orderBy: { createdAt: 'desc' } });
  const closes = new Date((delivered?.createdAt ?? so.updatedAt).getTime() + returnWindowDays * 86_400_000);
  if (Date.now() > closes.getTime()) {
    throw new DomainError(`The ${returnWindowDays}-day return window closed on ${closes.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}. Please contact support if something is wrong.`, 409);
  }
  const chosen = items?.length ? items : so.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));
  const lines = [];
  for (const c of chosen) {
    const item = so.items.find((i) => i.id === c.orderItemId);
    if (!item) throw new DomainError('Choose items from this parcel', 400);
    const listing = await tx.sellerListing.findUnique({ where: { id: item.listingId }, select: { returnable: true } });
    if (!listing?.returnable) throw new DomainError(`${item.name} isn’t returnable`, 409);
    const already = await tx.returnItem.aggregate({ where: { orderItemId: item.id, returnRequest: { status: { not: 'REJECTED' } } }, _sum: { quantity: true } });
    if (c.quantity < 1 || c.quantity + (already._sum.quantity ?? 0) > item.quantity) throw new DomainError(`You can return at most ${item.quantity - (already._sum.quantity ?? 0)} of ${item.name}`, 409);
    lines.push({ item, quantity: c.quantity });
  }
  // Refund the share of what the customer paid for those units, including their part of any coupon discount.
  const refundPaise = lines.reduce((s, { item, quantity }) => s + Math.floor((toPaise(item.totalPaise) * quantity) / item.quantity), 0);
  const ret = await tx.returnRequest.create({
    data: { orderId: order.id, sellerOrderId: so.id, userId: user.id, reason, refundPaise, items: { create: lines.map(({ item, quantity }) => ({ orderItemId: item.id, quantity })) } },
  });
  await notifyStoreOwners(tx, so.storeId, { title: 'Return requested', body: `A customer asked to return items from order ${order.number}.`, link: '/seller/returns' });
  await audit(tx, { actorId: user.id, action: 'return.requested', entityType: 'return', entityId: ret.id, metadata: { refundPaise } });
  return ret;
}

async function lockReturn(tx, returnId, storeId) {
  await tx.$queryRaw`SELECT id FROM returns WHERE id = ${returnId}::uuid FOR UPDATE`;
  const r = await tx.returnRequest.findUnique({ where: { id: returnId }, include: { items: { include: { orderItem: true } } } });
  if (!r) throw new DomainError('Return not found', 404);
  if (storeId) {
    const so = await tx.sellerOrder.findUnique({ where: { id: r.sellerOrderId }, select: { storeId: true } });
    if (so.storeId !== storeId) throw new DomainError('Return not found', 404);
  }
  return r;
}

/** Seller or staff approves or rejects a return request. */
export async function decideReturn(tx, returnId, { storeId, actorId, decision, note }) {
  const r = await lockReturn(tx, returnId, storeId);
  if (r.status !== 'REQUESTED') throw new DomainError('This return has already been decided', 409);
  await tx.returnRequest.update({ where: { id: r.id }, data: { status: decision, decidedBy: actorId, note: note ?? null } });
  await notifyCustomer(tx, r.userId, decision === 'APPROVED'
    ? { kind: 'return.approved', title: 'Return approved', body: 'Please pack the items. The seller will arrange collection, and your refund starts once they receive them.', link: `/account/orders/${r.orderId}` }
    : { kind: 'return.declined', title: 'Return declined', body: note || 'Your return request was declined. Contact support if you need help.', link: `/account/orders/${r.orderId}` });
  await audit(tx, { actorId, action: `return.${decision.toLowerCase()}`, entityType: 'return', entityId: r.id, metadata: { note } });
}

/** Returned items reached the seller: restock them and refund the customer. */
export async function receiveReturn(tx, returnId, { storeId, actorId, restockItems = true }) {
  const r = await lockReturn(tx, returnId, storeId);
  if (!['APPROVED', 'PICKUP_SCHEDULED'].includes(r.status)) throw new DomainError('Only an approved return can be received', 409);
  if (restockItems) {
    await inventory.restock(tx, r.items.map((i) => ({ listingId: i.orderItem.listingId, quantity: i.quantity })), 'RETURN_RESTOCK', `return:${shortRef(r.id)}`);
  }
  const order = await tx.order.findUnique({ where: { id: r.orderId } });
  const so = await tx.sellerOrder.findUnique({ where: { id: r.sellerOrderId } });
  const refundable = isPaidOnline(order) || order.paymentStatus === 'COD_COLLECTED' || order.paymentStatus === 'ON_TERMS';
  const refund = refundable ? await createRefund(tx, { order, sellerOrder: so, amountPaise: toPaise(r.refundPaise), reason: `Return: ${r.reason}`, returnId: r.id }) : null;
  // A return is REFUNDED only once money has actually gone back (demo refunds complete immediately).
  await tx.returnRequest.update({ where: { id: r.id }, data: { status: refund?.status === 'DEMO_SIMULATED' ? 'REFUNDED' : 'RECEIVED' } });
  await audit(tx, { actorId, action: 'return.received', entityType: 'return', entityId: r.id });
}

// ───────────── Reviews ─────────────

export async function createReview(tx, user, catalogProductId, input) {
  const item = await tx.orderItem.findFirst({
    where: { catalogProductId, order: { userId: user.id }, sellerOrder: { status: 'DELIVERED' } },
    select: { id: true },
  });
  if (!item) throw new DomainError('Only customers who received this product can review it', 403);
  const exists = await tx.review.findUnique({ where: { catalogProductId_userId: { catalogProductId, userId: user.id } } });
  if (exists) throw new DomainError('You have already reviewed this product', 409);
  const images = [...new Set(input.images ?? [])];
  if (images.length) {
    // Every photo must be one this customer uploaded for a review.
    const own = await tx.mediaAsset.count({ where: { url: { in: images }, uploadedBy: user.id, ownerType: 'REVIEW' } });
    if (own !== images.length) throw new DomainError('Please upload your photos again', 400);
  }
  const review = await tx.review.create({ data: { id: randomUUID(), catalogProductId, userId: user.id, orderItemId: item.id, authorName: user.name.split(' ')[0], rating: input.rating, title: input.title, body: input.body, images } });
  await audit(tx, { actorId: user.id, action: 'review.created', entityType: 'review', entityId: review.id });
  return review;
}

export { CONFIRMED_PAYMENTS };
