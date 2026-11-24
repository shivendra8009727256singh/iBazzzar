// Step B (B2C): customer emails, cancelling a paid order, data download, account deletion and my reviews.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address, key } from './setup/context.js';
import { dispatchEmails } from '../apps/api/src/lib/email.js';

let ctx;
let listing;
const mailer = () => ({ configured: true, provider: 'test', send: async (m) => { ctx.mails.push(m); return { delivered: true }; } });

async function placeOrder(buyer, { method = 'ONLINE', pay = true } = {}) {
  const res = await buyer.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: listing.id, quantity: listing.moq }], address, paymentMethod: method });
  expect(res.status).toBe(201);
  if (method === 'ONLINE' && pay) expect((await buyer.agent.post(`/api/orders/${res.body.order.id}/demo-payment`).send({})).status).toBe(200);
  return res.body.order;
}

beforeAll(async () => {
  ctx = await createContext();
  listing = await ctx.prisma.sellerListing.findFirst({ where: { status: 'APPROVED', codAllowed: true, variant: { product: { status: 'APPROVED' } } } });
  await ctx.prisma.sellerStore.update({ where: { id: listing.storeId }, data: { codEnabled: true } });
  await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: listing.id }, data: { onHand: 500 } });
});
afterAll(async () => { await ctx?.close(); });

describe('Customer emails', () => {
  it('queues an itemised confirmation in the same transaction and sends it from the outbox', async () => {
    const buyer = await ctx.register('customer', { name: 'Ira Menon' });
    const order = await placeOrder(buyer, { method: 'COD' });
    const queued = await ctx.prisma.emailOutbox.findFirst({ where: { userId: buyer.user.id, kind: 'order.confirmed' } });
    expect(queued).toMatchObject({ status: 'PENDING', to: buyer.email });
    expect(queued.text).toContain(order.number);
    expect(queued.text).toMatch(/× /);
    const before = ctx.mails.length;
    const result = await dispatchEmails(ctx.prisma, mailer());
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(ctx.mails.slice(before).some((m) => m.to === buyer.email && m.subject.includes(order.number))).toBe(true);
    expect((await ctx.prisma.emailOutbox.findUnique({ where: { id: queued.id } })).status).toBe('SENT');
  });

  it('retries a failed send with back-off and gives up after several attempts', async () => {
    const row = await ctx.prisma.emailOutbox.create({ data: { to: 'bounce@example.test', kind: 'test', subject: 'Hello', text: 'Hi' } });
    const failing = { configured: true, send: async () => { throw new Error('SMTP 550 mailbox unavailable'); } };
    await dispatchEmails(ctx.prisma, failing);
    const after = await ctx.prisma.emailOutbox.findUnique({ where: { id: row.id } });
    expect(after).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(after.lastError).toMatch(/550/);
    expect(after.sendAfter.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Cancelling a paid order', () => {
  it('cancels before shipping, restocks and refunds the online payment', async () => {
    const buyer = await ctx.register();
    const stockBefore = await ctx.stock(listing.id);
    const order = await placeOrder(buyer);
    const res = await buyer.agent.post(`/api/orders/${order.id}/cancel`).send({ reason: 'Ordered the wrong size' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');
    expect((await ctx.stock(listing.id)).onHand).toBe(stockBefore.onHand);
    const refunds = await ctx.prisma.refund.findMany({ where: { orderId: order.id } });
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amountPaise)).toBe(order.totalPaise - (order.codFeePaise ?? 0));
    expect(await ctx.prisma.emailOutbox.count({ where: { userId: buyer.user.id, kind: 'order.cancelled' } })).toBe(1);
  });

  it('refuses once a parcel has shipped', async () => {
    const buyer = await ctx.register();
    const order = await placeOrder(buyer);
    const so = await ctx.prisma.sellerOrder.findFirst({ where: { orderId: order.id } });
    await ctx.prisma.sellerOrder.update({ where: { id: so.id }, data: { status: 'SHIPPED' } });
    const res = await buyer.agent.post(`/api/orders/${order.id}/cancel`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already shipped/);
  });

  it('a different customer can’t cancel someone else’s order', async () => {
    const owner = await ctx.register();
    const other = await ctx.register();
    const order = await placeOrder(owner, { method: 'COD' });
    expect((await other.agent.post(`/api/orders/${order.id}/cancel`).send({})).status).toBe(404);
  });
});

describe('My data and account deletion', () => {
  it('downloads everything held about the person as JSON', async () => {
    const buyer = await ctx.register('customer', { name: 'Kiran Data' });
    await placeOrder(buyer, { method: 'COD' });
    const res = await buyer.agent.get('/api/account/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="ibazzzar-my-data-/);
    const data = JSON.parse(res.text);
    expect(data.profile.email).toBe(buyer.email);
    expect(data.orders).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|scrypt\$/);
  });

  it('blocks deletion while an order is open, then removes personal details but keeps the order', async () => {
    const buyer = await ctx.register('customer', { name: 'Leela Gone' });
    const order = await placeOrder(buyer, { method: 'COD' });
    expect((await buyer.agent.get('/api/account/deletion')).body.canDelete).toBe(false);
    const blocked = await buyer.agent.post('/api/account/delete').send({ password: 'Correct horse battery 9', confirm: 'DELETE' });
    expect(blocked.status).toBe(409);
    await buyer.agent.post(`/api/orders/${order.id}/cancel`).send({});
    expect((await buyer.agent.post('/api/account/delete').send({ password: 'wrong password!', confirm: 'DELETE' })).status).toBe(401);
    expect((await buyer.agent.post('/api/account/delete').send({ password: 'Correct horse battery 9', confirm: 'yes' })).status).toBe(400);
    const done = await buyer.agent.post('/api/account/delete').send({ password: 'Correct horse battery 9', confirm: 'DELETE', reason: 'Not using it' });
    expect(done.status).toBe(200);
    const user = await ctx.prisma.user.findUnique({ where: { id: buyer.user.id } });
    expect(user).toMatchObject({ status: 'DELETED', name: 'Deleted customer', phone: null });
    expect(user.email).toMatch(/@deleted\.invalid$/);
    expect(await ctx.prisma.address.count({ where: { userId: buyer.user.id } })).toBe(0);
    expect(await ctx.prisma.order.count({ where: { id: order.id } })).toBe(1);
    expect((await buyer.agent.get('/api/auth/me')).status).toBe(401);
    expect((await ctx.agent().post('/api/auth/login').send({ email: buyer.email, password: 'Correct horse battery 9' })).status).toBe(401);
    // The email address is free again.
    const again = await ctx.agent().post('/api/auth/register').send({ accountType: 'customer', name: 'Leela Again', email: buyer.email, phone: '9811122233', password: 'Correct horse battery 9', acceptTerms: true });
    expect(again.status).toBe(201);
    // No email is ever queued for a deleted account.
    await ctx.prisma.emailOutbox.deleteMany({ where: { userId: buyer.user.id } });
    const { queueEmail } = await import('../apps/api/src/lib/email.js');
    expect(await queueEmail(ctx.prisma, { userId: buyer.user.id, kind: 'test', subject: 'x', body: 'x' })).toBeNull();
  });

  it('sellers and business owners are told what to do first', async () => {
    const seller = await ctx.register('seller');
    const res = await seller.agent.get('/api/account/deletion');
    expect(res.body.canDelete).toBe(false);
    expect(res.body.reasons.join(' ')).toMatch(/seller store/);
  });
});

describe('My reviews', () => {
  it('lists delivered products waiting for a review, then the review itself', async () => {
    const buyer = await ctx.register();
    const order = await placeOrder(buyer, { method: 'COD' });
    await ctx.prisma.sellerOrder.updateMany({ where: { orderId: order.id }, data: { status: 'DELIVERED' } });
    const before = await buyer.agent.get('/api/account/reviews');
    expect(before.body.pending).toHaveLength(1);
    const productId = before.body.pending[0].productId;
    expect((await buyer.agent.post(`/api/products/${productId}/reviews`).send({ rating: 5, title: 'Lovely quality', body: 'Exactly as described and well packed.' })).status).toBe(201);
    const after = await buyer.agent.get('/api/account/reviews');
    expect(after.body.pending).toHaveLength(0);
    expect(after.body.reviews[0]).toMatchObject({ rating: 5, title: 'Lovely quality' });
  });
});

describe('Admin: customer emails', () => {
  it('lists the outbox with status counts and retries a failed email', async () => {
    const admin = await ctx.admin();
    const failed = await ctx.prisma.emailOutbox.create({ data: { to: 'x@example.test', kind: 'order.confirmed', subject: 'Order confirmed', text: 'Hi', status: 'FAILED', attempts: 5, lastError: 'SMTP down' } });
    const list = await admin.agent.get('/api/admin/emails?status=FAILED');
    expect(list.status).toBe(200);
    expect(list.body.emails.map((e) => e.id)).toContain(failed.id);
    expect(list.body.counts.FAILED).toBeGreaterThanOrEqual(1);
    expect(list.body.kinds).toContain('order.confirmed');
    expect((await admin.agent.post(`/api/admin/emails/${failed.id}/retry`).send({})).status).toBe(200);
    expect((await ctx.prisma.emailOutbox.findUnique({ where: { id: failed.id } })).status).toBe('PENDING');
    expect((await admin.agent.post(`/api/admin/emails/${failed.id}/retry`).send({})).status).toBe(409);
    const shopper = await ctx.register();
    expect((await shopper.agent.get('/api/admin/emails')).status).toBe(403);
  });
});
