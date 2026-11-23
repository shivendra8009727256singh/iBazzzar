import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address, otherStateAddress, key } from './setup/context.js';

let ctx;
beforeAll(async () => { ctx = await createContext(); });
afterAll(async () => { await ctx?.close(); });

describe('Catalogue', () => {
  it('reports health with the database connected', async () => {
    const res = await ctx.agent().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok', shipping: 'sandbox' });
  });

  it('lists one card per product with its best offer, paginated in the database', async () => {
    const res = await ctx.agent().get('/api/products?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(12);
    expect(res.body.products).toHaveLength(5);
    expect(res.body.pages).toBe(3);
    const ids = new Set(res.body.products.map((p) => p.catalogProductId));
    expect(ids.size).toBe(5);
  });

  it('finds products despite a typo and filters by category, price and stock', async () => {
    const typo = await ctx.agent().get('/api/products?q=hedphones');
    expect(typo.body.products.map((p) => p.name)).toContain('Aura wireless headphones');
    const cat = await ctx.agent().get('/api/products?category=furniture');
    expect(cat.body.products.every((p) => p.category === 'Furniture')).toBe(true);
    const cheap = await ctx.agent().get('/api/products?max=1000&sort=price-asc');
    expect(cheap.body.products.every((p) => p.pricePaise <= 100000)).toBe(true);
    const prices = cheap.body.products.map((p) => p.pricePaise);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('shows variants and every seller offering a product', async () => {
    const head = await ctx.agent().get('/api/products/aura-wireless-headphones');
    expect(head.status).toBe(200);
    expect(head.body.offers).toHaveLength(2);
    expect(head.body.offer.pricePaise).toBeLessThan(head.body.offers[1].pricePaise);
    const watch = await ctx.agent().get('/api/products/pulse-smart-watch');
    expect(watch.body.variants.map((v) => v.label)).toEqual(['Midnight', 'Sand']);
    expect((await ctx.agent().get('/api/products/does-not-exist')).status).toBe(404);
  });

  it('suggests products, brands and categories', async () => {
    const res = await ctx.agent().get('/api/search/suggest?q=lamp');
    expect(res.body.products[0].name).toMatch(/lamp/i);
  });
});

describe('Quote', () => {
  it('prices a multi-seller cart with per-seller shipping and the right GST split', async () => {
    const headphones = await ctx.listing('aura-wireless-headphones'); // Pune seller, GST registered
    const lamp = await ctx.listing('arc-desk-lamp'); // Bengaluru seller, not GST registered
    const res = await ctx.agent().post('/api/cart/quote').send({ items: [{ listingId: headphones.id, quantity: 1 }, { listingId: lamp.id, quantity: 1 }], state: 'Maharashtra', pincode: '411002' });
    expect(res.status).toBe(200);
    const q = res.body.quote;
    expect(q.sellers).toHaveLength(2);
    const [hp] = q.lines.filter((l) => l.listingId === headphones.id);
    expect(hp.taxRateBps).toBe(1800);
    const lampLine = q.lines.find((l) => l.listingId === lamp.id);
    expect(lampLine.taxRateBps).toBe(0); // unregistered sellers cannot charge GST
    expect(q.totalPaise).toBe(q.subtotalPaise - q.discountPaise + q.shippingPaise);
    expect(q.payment.cod.available).toBe(true);
  });

  it('uses IGST when the customer is in another state', async () => {
    const headphones = await ctx.listing('aura-wireless-headphones');
    const res = await ctx.agent().post('/api/cart/quote').send({ items: [{ listingId: headphones.id, quantity: 1 }], state: 'Tamil Nadu', pincode: '600001' });
    expect(res.body.quote.lines[0].taxPaise).toBeGreaterThan(0);
    const intra = await ctx.agent().post('/api/cart/quote').send({ items: [{ listingId: headphones.id, quantity: 1 }], state: 'Maharashtra', pincode: '411002' });
    expect(intra.body.quote.lines[0].taxPaise).toBe(res.body.quote.lines[0].taxPaise);
  });

  it('enforces MOQ for business pricing and applies wholesale tiers', async () => {
    const l = await ctx.listing('notebook-work-set');
    const low = await ctx.agent().post('/api/cart/quote').send({ items: [{ listingId: l.id, quantity: 5 }], mode: 'BUSINESS' });
    expect(low.status).toBe(409);
    expect(low.body.error).toMatch(/minimum order of 20/);
    const ok = await ctx.agent().post('/api/cart/quote').send({ items: [{ listingId: l.id, quantity: 20 }], mode: 'BUSINESS' });
    expect(ok.body.quote.lines[0].unitPaise).toBe(Math.round(Number(l.pricePaise) * 0.92 / 100) * 100);
  });
});

describe('Checkout', () => {
  it('creates an order with seller parcels, reserves stock and is idempotent', async () => {
    const { agent } = await ctx.register();
    const l = await ctx.listing('ceramic-pour-over-set');
    const before = await ctx.stock(l.id);
    const k = key();
    const body = { items: [{ listingId: l.id, quantity: 2 }], address, paymentMethod: 'ONLINE' };
    const first = await agent.post('/api/checkout').set('Idempotency-Key', k).send(body);
    expect(first.status).toBe(201);
    expect(first.body.order.status).toBe('AWAITING_PAYMENT');
    expect(first.body.order.number).toMatch(/^IBZ-\d{4}-\d{2}-\d{6}$/);
    expect(first.body.order.parcels).toHaveLength(1);
    const again = await agent.post('/api/checkout').set('Idempotency-Key', k).send(body);
    expect(again.body.order.id).toBe(first.body.order.id);
    const changed = await agent.post('/api/checkout').set('Idempotency-Key', k).send({ ...body, items: [{ listingId: l.id, quantity: 1 }] });
    expect(changed.status).toBe(409);
    expect(await ctx.stock(l.id)).toEqual({ onHand: before.onHand, reserved: before.reserved + 2 });

    const paid = await agent.post(`/api/orders/${first.body.order.id}/demo-payment`).send({});
    expect(paid.body.order.status).toBe('CONFIRMED');
    expect(paid.body.order.paymentStatus).toBe('DEMO_SIMULATED');
    expect(await ctx.stock(l.id)).toEqual({ onHand: before.onHand - 2, reserved: before.reserved });
  });

  it('never oversells under concurrent checkouts', async () => {
    const l = await ctx.listing('studio-task-chair');
    await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: l.id }, data: { onHand: 3, reserved: 0 } });
    const buyers = await Promise.all([...Array(6)].map(() => ctx.register()));
    const results = await Promise.all(buyers.map(({ agent }) => agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: l.id, quantity: 1 }], address, paymentMethod: 'ONLINE' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await ctx.stock(l.id)).toEqual({ onHand: 3, reserved: 3 });
  });

  it('stops when prices changed since the customer saw the total', async () => {
    const { agent } = await ctx.register();
    const l = await ctx.listing('weekend-training-mat');
    const res = await agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: l.id, quantity: 1 }], address, expectedTotalPaise: 1 });
    expect(res.status).toBe(409);
    expect(res.body.fields.quote.totalPaise).toBeGreaterThan(1);
  });

  it('cancelling an unpaid order releases stock and the coupon', async () => {
    const { agent, user } = await ctx.register();
    const l = await ctx.listing('everyday-canvas-tote');
    const before = await ctx.stock(l.id);
    const res = await agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: l.id, quantity: 2 }], address, couponCode: 'WELCOME10' });
    expect(res.status).toBe(201);
    expect(res.body.order.discountPaise).toBeGreaterThan(0);
    const cancel = await agent.post(`/api/orders/${res.body.order.id}/cancel`).send({});
    expect(cancel.body.order.status).toBe('CANCELLED');
    expect(await ctx.stock(l.id)).toEqual(before);
    expect(await ctx.prisma.couponRedemption.count({ where: { userId: user.id } })).toBe(0);
  });

  it('confirms cash-on-delivery orders immediately and deducts stock', async () => {
    const { agent } = await ctx.register();
    const l = await ctx.listing('botanical-care-duo');
    const before = await ctx.stock(l.id);
    const res = await agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: l.id, quantity: 1 }], address, paymentMethod: 'COD' });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'COD_PENDING' });
    expect(res.body.order.codFeePaise).toBeGreaterThan(0);
    expect(await ctx.stock(l.id)).toEqual({ onHand: before.onHand - 1, reserved: before.reserved });
  });

  it('lets a guest check out and creates their account', async () => {
    const l = await ctx.listing('notebook-work-set');
    const guest = ctx.agent();
    const res = await guest.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: l.id, quantity: 1 }], address: otherStateAddress, guest: { name: 'Guest Shopper', email: 'guest@example.test', phone: '9123456780', acceptTerms: true } });
    expect(res.status).toBe(201);
    const me = await guest.get('/api/auth/me');
    expect(me.body.user.email).toBe('guest@example.test');
  });

  it('rejects checkout without an idempotency key', async () => {
    const { agent } = await ctx.register();
    const l = await ctx.listing('notebook-work-set');
    const res = await agent.post('/api/checkout').send({ items: [{ listingId: l.id, quantity: 1 }], address });
    expect(res.status).toBe(400);
  });
});
