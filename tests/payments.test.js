import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { createContext, address, key, RAZORPAY } from './setup/context.js';

let ctx;
let razorpayOrders = 0;
const fakeRazorpay = async (url, init) => {
  if (String(url).endsWith('/orders')) {
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: `order_test${++razorpayOrders}`, amount: body.amount, currency: 'INR' }), { status: 200 });
  }
  if (String(url).includes('/refund')) return new Response(JSON.stringify({ id: 'rfnd_test123456' }), { status: 200 });
  return new Response('{}', { status: 404 });
};
beforeAll(async () => { ctx = await createContext({ payments: 'razorpay', fetchImpl: fakeRazorpay }); });
afterAll(async () => { await ctx?.close(); });

async function placeOrder() {
  const { agent, user } = await ctx.register();
  const l = await ctx.listing('arc-desk-lamp');
  const res = await agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: l.id, quantity: 1 }], address, paymentMethod: 'ONLINE' });
  expect(res.status).toBe(201);
  const pay = await agent.post(`/api/orders/${res.body.order.id}/payment`).send({});
  expect(pay.status).toBe(200);
  return { agent, user, order: res.body.order, providerOrderId: pay.body.providerOrderId, amount: pay.body.amount, listingId: l.id };
}
const captured = (providerOrderId, amount, extra = {}) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: `pay_${Math.random().toString(36).slice(2, 12)}`, order_id: providerOrderId, amount, currency: 'INR', status: 'captured', method: 'upi', ...extra } } },
});

describe('Razorpay test-mode payments', () => {
  it('creates a provider order for the exact server total and reuses it', async () => {
    const { agent, order, providerOrderId, amount } = await placeOrder();
    expect(amount).toBe(order.totalPaise);
    const again = await agent.post(`/api/orders/${order.id}/payment`).send({});
    expect(again.body.providerOrderId).toBe(providerOrderId);
  });

  it('confirms the order only with a valid checkout signature', async () => {
    const { agent, order, providerOrderId } = await placeOrder();
    const paymentId = 'pay_signaturetest1';
    const bad = await agent.post(`/api/orders/${order.id}/payment/verify`).send({ razorpay_order_id: providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: 'a'.repeat(64) });
    expect(bad.status).toBe(400);
    const signature = createHmac('sha256', RAZORPAY.keySecret).update(`${providerOrderId}|${paymentId}`).digest('hex');
    const ok = await agent.post(`/api/orders/${order.id}/payment/verify`).send({ razorpay_order_id: providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
    expect(ok.status).toBe(200);
    expect(ok.body.order).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID', paymentRef: paymentId });
  });

  it('rejects webhooks with an invalid signature', async () => {
    const { order, providerOrderId, amount } = await placeOrder();
    const res = await ctx.webhook(captured(providerOrderId, amount), { secret: 'wrong-secret' });
    expect(res.status).toBe(400);
    expect((await ctx.prisma.order.findUnique({ where: { id: order.id } })).status).toBe('AWAITING_PAYMENT');
  });

  it('never marks an order paid when the amount does not match', async () => {
    const { order, providerOrderId, amount } = await placeOrder();
    const res = await ctx.webhook(captured(providerOrderId, amount - 100));
    expect(res.status).toBe(200);
    expect((await ctx.prisma.order.findUnique({ where: { id: order.id } })).status).toBe('AWAITING_PAYMENT');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'payment.mismatch', entityId: order.id } })).toBe(1);
  });

  it('captures through a valid webhook exactly once, even when the event is delivered twice', async () => {
    const { order, providerOrderId, amount, listingId } = await placeOrder();
    const before = await ctx.stock(listingId);
    const event = captured(providerOrderId, amount);
    const first = await ctx.webhook(event, { eventId: 'evt_dup_1' });
    const second = await ctx.webhook(event, { eventId: 'evt_dup_1' });
    expect(first.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    const stored = await ctx.prisma.order.findUnique({ where: { id: order.id } });
    expect(stored).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(await ctx.prisma.paymentTransaction.count({ where: { intent: { orderId: order.id } } })).toBe(1);
    expect(await ctx.stock(listingId)).toEqual({ onHand: before.onHand - 1, reserved: before.reserved - 1 });
    expect(await ctx.prisma.orderStatusHistory.count({ where: { orderId: order.id, status: 'CONFIRMED' } })).toBe(1);
  });

  it('flags a payment that arrives after the order expired instead of reviving it', async () => {
    const { agent, order, providerOrderId, amount } = await placeOrder();
    await agent.post(`/api/orders/${order.id}/cancel`).send({});
    const res = await ctx.webhook(captured(providerOrderId, amount));
    expect(res.status).toBe(200);
    expect((await ctx.prisma.order.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'payment.after-cancel', entityId: order.id } })).toBe(1);
  });

  it('disables demo payments when a real provider is configured', async () => {
    const { agent, order } = await placeOrder();
    expect((await agent.post(`/api/orders/${order.id}/demo-payment`).send({})).status).toBe(403);
  });
});
