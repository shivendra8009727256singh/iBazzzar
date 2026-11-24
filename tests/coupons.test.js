// Coupons in the cart and at checkout: eligibility rules, caps, exact splitting across items, GST on the final
// amounts, per-customer and overall limits (including two orders at the same moment) and release on cancellation.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address, key } from './setup/context.js';
import { gstSplit } from '../packages/shared/src/index.js';

let ctx;
let A; // ₹999.99
let B; // ₹333.33 (awkward amounts make rounding visible)

async function prepare(slug, pricePaise) {
  const l = await ctx.listing(slug);
  await ctx.prisma.promotionItem.deleteMany({ where: { listingId: l.id } });
  await ctx.prisma.priceTier.deleteMany({ where: { listingId: l.id } });
  await ctx.prisma.sellerListing.update({ where: { id: l.id }, data: { pricePaise, mrpPaise: pricePaise * 2, moq: 1, bulkPackUnits: 1, codAllowed: true } });
  await ctx.prisma.sellerStore.update({ where: { id: l.storeId }, data: { codEnabled: true } });
  await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: l.id }, data: { onHand: 1000, reserved: 0 } });
  return l;
}
async function coupon(code, data = {}) {
  const base = { description: `${code} test coupon`, kind: 'PERCENT', value: 10, maxDiscountPaise: null, minOrderPaise: 0, mode: 'ANY', startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000), active: true, public: false, perUserLimit: 1, usageLimit: null, used: 0 };
  return ctx.prisma.coupon.upsert({ where: { code }, update: { ...base, ...data }, create: { code, ...base, ...data } });
}
const quote = (agent, body) => agent.post('/api/cart/quote').send(body);
const place = (agent, body) => agent.post('/api/checkout').set('Idempotency-Key', key()).send({ address, paymentMethod: 'COD', ...body });

beforeAll(async () => {
  ctx = await createContext();
  A = await prepare('aura-wireless-headphones', 99999);
  B = await prepare('arc-desk-lamp', 33333);
});
afterAll(async () => { await ctx?.close(); });

describe('Coupon maths', () => {
  it('splits the discount across items to the paisa, and each item is taxed on what is left', async () => {
    await coupon('SPLIT15', { value: 15 });
    const items = [{ listingId: A.id, quantity: 1 }, { listingId: B.id, quantity: 2 }];
    const res = await quote(ctx.agent(), { items, couponCode: 'SPLIT15', state: address.state, pincode: address.pincode });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const q = res.body.quote;
    expect(q.subtotalPaise).toBe(99999 + 33333 * 2);
    expect(q.discountPaise).toBe(Math.floor(q.subtotalPaise * 15 / 100));
    expect(q.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(q.discountPaise); // nothing lost or created
    for (const l of q.lines) {
      expect(l.totalPaise).toBe(l.lineTotalPaise - l.discountPaise);
      expect(l.taxPaise).toBe(gstSplit(l.totalPaise, l.taxRateBps, true).taxPaise);
    }
    expect(q.totalPaise).toBe(q.subtotalPaise - q.discountPaise + q.shippingPaise + q.codFeePaise);
  });

  it('caps the discount, and a flat coupon bigger than the order still leaves ₹1 to pay', async () => {
    await coupon('CAP50', { value: 50, maxDiscountPaise: 20000 });
    const capped = (await quote(ctx.agent(), { items: [{ listingId: A.id, quantity: 1 }], couponCode: 'CAP50' })).body.quote;
    expect(capped.discountPaise).toBe(20000);
    await coupon('HUGEFLAT', { kind: 'FLAT', value: 500000 });
    const flat = (await quote(ctx.agent(), { items: [{ listingId: B.id, quantity: 1 }], couponCode: 'HUGEFLAT' })).body.quote;
    expect(flat.discountPaise).toBe(33333 - 100);
    expect(flat.subtotalPaise - flat.discountPaise).toBe(100);
  });

  it('accepts codes typed in lowercase', async () => {
    await coupon('LOWER10');
    const res = await quote(ctx.agent(), { items: [{ listingId: A.id, quantity: 1 }], couponCode: 'lower10' });
    expect(res.status).toBe(200);
    expect(res.body.quote.coupon.code).toBe('LOWER10');
  });
});

describe('Coupon rules', () => {
  it('says why a coupon does not apply, and marks it as a coupon problem', async () => {
    await coupon('MIN2000', { minOrderPaise: 200000 });
    await coupon('BIZONLY', { mode: 'BUSINESS' });
    await coupon('OLDCODE', { startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 60_000) });
    await coupon('PAUSED1', { active: false });
    const one = [{ listingId: A.id, quantity: 1 }];
    const cases = [
      ['MIN2000', /minimum order of ₹2,000/],
      ['BIZONLY', /business orders only/],
      ['OLDCODE', /not active/],
      ['PAUSED1', /not active/],
      ['NOSUCHCODE', /couldn’t find/],
    ];
    for (const [code, message] of cases) {
      const res = await quote(ctx.agent(), { items: one, couponCode: code });
      expect(res.status, code).toBeGreaterThanOrEqual(400);
      expect(res.body.error, code).toMatch(message);
      expect(res.body.fields?.coupon, code).toBe(code); // the website removes just the coupon
    }
    // Reaching the minimum makes it valid; the minimum is judged on the price after deals.
    const ok = await quote(ctx.agent(), { items: [{ listingId: A.id, quantity: 3 }], couponCode: 'MIN2000' });
    expect(ok.status).toBe(200);
  });

  it('a once-per-customer coupon works once, comes back when that order is cancelled, and is refused again after reuse', async () => {
    await coupon('ONCE1', { perUserLimit: 1 });
    const buyer = await ctx.register();
    const items = [{ listingId: A.id, quantity: 1 }];
    const first = await place(buyer.agent, { items, couponCode: 'ONCE1' });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect((await ctx.prisma.coupon.findUnique({ where: { code: 'ONCE1' } })).used).toBe(1);

    const again = await quote(buyer.agent, { items, couponCode: 'ONCE1' });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already used/);
    expect((await place(buyer.agent, { items, couponCode: 'ONCE1' })).status).toBe(409);

    expect((await buyer.agent.post(`/api/orders/${first.body.order.id}/cancel`).send({})).status).toBe(200);
    expect((await ctx.prisma.coupon.findUnique({ where: { code: 'ONCE1' } })).used).toBe(0);
    expect((await quote(buyer.agent, { items, couponCode: 'ONCE1' })).status).toBe(200);
    expect((await place(buyer.agent, { items, couponCode: 'ONCE1' })).status).toBe(201);
    expect((await ctx.prisma.coupon.findUnique({ where: { code: 'ONCE1' } })).used).toBe(1);
  });

  it('two orders at the same moment cannot both use a once-per-customer coupon', async () => {
    await coupon('RACE1', { perUserLimit: 1 });
    const buyer = await ctx.register();
    const items = [{ listingId: B.id, quantity: 1 }];
    const results = await Promise.all([place(buyer.agent, { items, couponCode: 'RACE1' }), place(buyer.agent, { items, couponCode: 'RACE1' })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.prisma.couponRedemption.count({ where: { coupon: { code: 'RACE1' } } })).toBe(1);
    expect((await ctx.prisma.coupon.findUnique({ where: { code: 'RACE1' } })).used).toBe(1);
  });

  it('an overall usage limit is never exceeded, even by simultaneous orders from different customers', async () => {
    await coupon('LIMIT2', { usageLimit: 2, perUserLimit: 5 });
    const buyers = await Promise.all([ctx.register(), ctx.register(), ctx.register()]);
    const items = [{ listingId: B.id, quantity: 1 }];
    const results = await Promise.all(buyers.map((b) => place(b.agent, { items, couponCode: 'LIMIT2' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect((await ctx.prisma.coupon.findUnique({ where: { code: 'LIMIT2' } })).used).toBe(2);
  });

  it('the saved order matches the coupon quote exactly', async () => {
    await coupon('MATCH12', { value: 12, perUserLimit: 3 });
    const buyer = await ctx.register();
    const items = [{ listingId: A.id, quantity: 2 }, { listingId: B.id, quantity: 3 }];
    const q = (await quote(buyer.agent, { items, couponCode: 'MATCH12', state: address.state, pincode: address.pincode, paymentMethod: 'COD' })).body.quote;
    const res = await place(buyer.agent, { items, couponCode: 'MATCH12', expectedTotalPaise: q.totalPaise });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const order = await ctx.prisma.order.findUnique({ where: { id: res.body.order.id }, include: { items: true } });
    const n = Number;
    expect(n(order.discountPaise)).toBe(q.discountPaise);
    expect(n(order.totalPaise)).toBe(q.totalPaise);
    expect(order.couponCode).toBe('MATCH12');
    expect(order.items.reduce((s, i) => s + n(i.discountPaise), 0)).toBe(q.discountPaise);
    for (const i of order.items) {
      const line = q.lines.find((l) => l.listingId === i.listingId);
      expect(n(i.discountPaise)).toBe(line.discountPaise);
      expect(n(i.totalPaise)).toBe(line.totalPaise);
    }
  });
});
