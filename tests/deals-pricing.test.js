// Flash deals and discounts, end to end: the same price on every page, in the cart, at checkout and on the saved
// order; coupons on top; GST on the final price; deals that are scheduled, paused or ended never apply; a stale
// total is refused at checkout; business buyers get the lower of wholesale tier and deal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address, key } from './setup/context.js';
import { gstSplit, SERVICE_GST_BPS } from '../packages/shared/src/index.js';

let ctx;
let admin;
let L; // main listing: ₹999.99, MRP ₹1,999.00, tier ₹900 from 10 units
let L2; // second listing for scheduled deals
const PRICE = 99999;
const MRP = 199900;
const dealPrice = (price, bps) => price - Math.floor((price * bps) / 10000);
const iso = (ms) => new Date(Date.now() + ms).toISOString();

async function prepare(slug) {
  const l = await ctx.listing(slug);
  await ctx.prisma.promotionItem.deleteMany({ where: { listingId: l.id } }); // no seeded deals interfering
  await ctx.prisma.priceTier.deleteMany({ where: { listingId: l.id } });
  await ctx.prisma.sellerListing.update({ where: { id: l.id }, data: { pricePaise: PRICE, mrpPaise: MRP, moq: 1, bulkPackUnits: 1, codAllowed: true, wholesaleEnabled: true } });
  await ctx.prisma.sellerStore.update({ where: { id: l.storeId }, data: { codEnabled: true } });
  await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: l.id }, data: { onHand: 500, reserved: 0 } });
  return l;
}
async function createDeal(listingIds, discountBps, { startsAt = iso(-60_000), endsAt = iso(86_400_000), name = 'Test deal' } = {}) {
  const res = await admin.agent.post('/api/admin/promotions').send({ name, description: 'Deal used by pricing tests', discountBps, startsAt, endsAt, listingIds });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.promotion;
}
const quoteOf = async (items, extra = {}) => {
  const res = await ctx.agent().post('/api/cart/quote').send({ items, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.quote;
};
/** Finds every object with this listingId anywhere in a JSON response. */
const offersFor = (body, listingId) => {
  const found = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.listingId === listingId || v.id === listingId) found.push(v); Object.values(v).forEach(walk); } };
  walk(body);
  return found.filter((o) => o.pricePaise != null);
};

beforeAll(async () => {
  ctx = await createContext();
  admin = await ctx.admin();
  L = await prepare('aura-wireless-headphones');
  L2 = await prepare('arc-desk-lamp');
});
afterAll(async () => { await ctx?.close(); });

describe('A live deal', () => {
  let deal;
  it('shows one price on the deals page, product page and cart', async () => {
    deal = await createDeal([L.id], 2000); // 20% off
    const expected = dealPrice(PRICE, 2000);
    expect(expected).toBe(80000); // ₹999.99 − ₹199.99 (floored) = ₹800.00

    const deals = (await ctx.agent().get('/api/deals')).body;
    const onDeals = offersFor(deals, L.id);
    expect(onDeals.length).toBeGreaterThan(0);
    for (const o of onDeals) {
      expect(o.pricePaise).toBe(expected);
      expect(o.listPricePaise).toBe(PRICE);
      expect(o.mrpPaise).toBe(MRP);
      expect(o.promotion.discountBps).toBe(2000);
    }

    const product = await ctx.prisma.catalogProduct.findUnique({ where: { slug: 'aura-wireless-headphones' } });
    const page = (await ctx.agent().get(`/api/products/${product.slug}`)).body;
    for (const o of offersFor(page, L.id)) expect(o.pricePaise).toBe(expected);

    const q = await quoteOf([{ listingId: L.id, quantity: 3 }]);
    expect(q.lines[0]).toMatchObject({ unitPaise: expected, priceSource: 'DEAL', lineTotalPaise: expected * 3, mrpPaise: MRP });
    expect(q.subtotalPaise).toBe(expected * 3);
  });

  it('checkout saves exactly the quoted deal price, and every total adds up', async () => {
    const buyer = await ctx.register('customer');
    const items = [{ listingId: L.id, quantity: 3 }];
    const q = await quoteOf(items, { state: address.state, pincode: address.pincode, paymentMethod: 'COD' });
    const res = await buyer.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items, address, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const order = await ctx.prisma.order.findUnique({ where: { id: res.body.order.id }, include: { items: true, sellerOrders: true } });
    const n = (v) => Number(v);
    expect(n(order.totalPaise)).toBe(q.totalPaise);
    expect(n(order.subtotalPaise)).toBe(80000 * 3);
    const [item] = order.items;
    expect(n(item.unitPaise)).toBe(80000);
    expect(n(item.lineTotalPaise)).toBe(240000);
    expect(n(item.mrpPaise)).toBe(MRP);
    // total = goods after coupon + delivery + COD fee
    expect(n(order.totalPaise)).toBe(n(order.subtotalPaise) - n(order.discountPaise) + n(order.shippingPaise) + n(order.codFeePaise));
    // the items' final amounts add up to the goods value
    expect(order.items.reduce((s, i) => s + n(i.totalPaise), 0)).toBe(n(order.subtotalPaise) - n(order.discountPaise));
    // GST is worked out on the final (deal) price, never on the list price
    const split = gstSplit(n(item.totalPaise), item.taxRateBps, true);
    expect(n(item.taxablePaise)).toBe(split.taxablePaise);
    expect(n(item.cgstPaise) + n(item.sgstPaise) + n(item.igstPaise)).toBe(split.taxPaise);
    const shippingTax = order.sellerOrders.reduce((s, so) => s + gstSplit(n(so.shippingPaise), SERVICE_GST_BPS, true).taxPaise, 0);
    const codTax = n(order.codFeePaise) ? gstSplit(n(order.codFeePaise), SERVICE_GST_BPS, false).taxPaise : 0;
    expect(n(order.taxPaise)).toBe(split.taxPaise + shippingTax + codTax);
  });

  it('a coupon applies after the deal, is capped, and GST follows the final price', async () => {
    await ctx.prisma.coupon.upsert({
      where: { code: 'DEALTEST10' },
      update: {},
      create: { code: 'DEALTEST10', description: '10% off, up to ₹100', kind: 'PERCENT', value: 10, maxDiscountPaise: 10000, minOrderPaise: 50000, mode: 'ANY', startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000), active: true, public: true, perUserLimit: 5 },
    });
    const q = await quoteOf([{ listingId: L.id, quantity: 3 }], { couponCode: 'DEALTEST10', state: address.state, pincode: address.pincode });
    expect(q.subtotalPaise).toBe(240000); // deal price × 3
    expect(q.discountPaise).toBe(10000); // 10% would be ₹240, capped at ₹100
    expect(q.lines[0].totalPaise).toBe(230000);
    // GST is inside the final ₹2,300 (after deal and coupon), not worked out on ₹2,400 or the list price.
    expect(q.lines[0].taxPaise).toBe(gstSplit(230000, q.lines[0].taxRateBps, true).taxPaise);
    expect(q.totalPaise).toBe(230000 + q.shippingPaise + q.codFeePaise);
  });

  it('a paused deal stops applying at once, and checkout refuses the old total', async () => {
    const buyer = await ctx.register('customer');
    const items = [{ listingId: L.id, quantity: 1 }];
    const old = await quoteOf(items, { state: address.state, pincode: address.pincode, paymentMethod: 'COD' });
    expect(old.lines[0].unitPaise).toBe(80000);

    expect((await admin.agent.patch(`/api/admin/promotions/${deal.id}`).send({ active: false })).status).toBe(200);
    const now = await quoteOf(items, { state: address.state, pincode: address.pincode, paymentMethod: 'COD' });
    expect(now.lines[0]).toMatchObject({ unitPaise: PRICE, priceSource: 'LIST' });

    const res = await buyer.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items, address, paymentMethod: 'COD', expectedTotalPaise: old.totalPaise });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Prices in your cart changed/);
    expect(res.body.fields.quote.totalPaise).toBe(now.totalPaise); // the new total is sent so the page can show it
    const deals = (await ctx.agent().get('/api/deals')).body;
    expect(offersFor(deals, L.id)).toHaveLength(0);

    expect((await admin.agent.patch(`/api/admin/promotions/${deal.id}`).send({ active: true })).status).toBe(200);
    expect((await quoteOf(items)).lines[0].unitPaise).toBe(80000);
  });
});

describe('Deal timing and overlaps', () => {
  it('a scheduled deal shows as upcoming but does not change the price yet', async () => {
    await createDeal([L2.id], 3000, { startsAt: iso(2 * 86_400_000), endsAt: iso(3 * 86_400_000), name: 'Scheduled test deal' });
    const q = await quoteOf([{ listingId: L2.id, quantity: 1 }]);
    expect(q.lines[0]).toMatchObject({ unitPaise: PRICE, priceSource: 'LIST' });
    const upcoming = (await ctx.agent().get('/api/deals')).body.deals.find((d) => d.name === 'Scheduled test deal');
    expect(upcoming?.live).toBe(false);
    for (const p of upcoming?.products ?? []) expect(p.pricePaise).toBe(PRICE); // shown at today's price, not the future one
  });

  it('an ended deal never applies', async () => {
    const ended = await createDeal([L2.id], 4000, { startsAt: iso(-2 * 86_400_000), endsAt: iso(-86_400_000), name: 'Ended test deal' });
    expect(ended.id).toBeTruthy();
    expect((await quoteOf([{ listingId: L2.id, quantity: 1 }])).lines[0].unitPaise).toBe(PRICE);
  });

  it('when two live deals cover a product, the bigger discount wins everywhere', async () => {
    await createDeal([L2.id], 1000, { name: 'Small test deal' });
    await createDeal([L2.id], 2500, { name: 'Big test deal' });
    const expected = dealPrice(PRICE, 2500);
    expect((await quoteOf([{ listingId: L2.id, quantity: 1 }])).lines[0]).toMatchObject({ unitPaise: expected, priceSource: 'DEAL' });
    for (const o of offersFor((await ctx.agent().get('/api/deals')).body, L2.id)) expect(o.pricePaise).toBe(expected);
  });

  it('refuses deals outside 1–90%, with the end before the start, or on products that are not live', async () => {
    const base = { name: 'Bad deal', description: 'Should be refused', startsAt: iso(-60_000), endsAt: iso(86_400_000), listingIds: [L.id] };
    expect((await admin.agent.post('/api/admin/promotions').send({ ...base, discountBps: 50 })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/promotions').send({ ...base, discountBps: 9500 })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/promotions').send({ ...base, discountBps: 1000, endsAt: iso(-120_000) })).status).toBe(400);
    const hidden = await ctx.prisma.sellerListing.findFirst({ where: { status: { not: 'APPROVED' } } });
    if (hidden) expect((await admin.agent.post('/api/admin/promotions').send({ ...base, discountBps: 1000, listingIds: [hidden.id] })).status).toBe(400);
  });
});

describe('Business buyers', () => {
  it('pay the lower of the wholesale tier and the deal price', async () => {
    await ctx.prisma.promotionItem.deleteMany({ where: { listingId: L2.id } });
    await ctx.prisma.priceTier.create({ data: { listingId: L2.id, minQty: 10, pricePaise: 90000 } });
    // No deal: tier ₹900 at 10 units.
    expect((await quoteOf([{ listingId: L2.id, quantity: 10 }], { mode: 'BUSINESS' })).lines[0]).toMatchObject({ unitPaise: 90000, priceSource: 'TIER' });
    // 5% deal (₹950) is worse than the tier → tier.
    await createDeal([L2.id], 500, { name: 'Weak test deal' });
    expect((await quoteOf([{ listingId: L2.id, quantity: 10 }], { mode: 'BUSINESS' })).lines[0]).toMatchObject({ unitPaise: 90000, priceSource: 'TIER' });
    // 20% deal (₹800) beats the tier → deal.
    await createDeal([L2.id], 2000, { name: 'Strong test deal' });
    expect((await quoteOf([{ listingId: L2.id, quantity: 10 }], { mode: 'BUSINESS' })).lines[0]).toMatchObject({ unitPaise: 80000, priceSource: 'DEAL' });
    // Shoppers get the deal too; tiers are for business buyers only.
    expect((await quoteOf([{ listingId: L2.id, quantity: 10 }])).lines[0]).toMatchObject({ unitPaise: 80000, priceSource: 'DEAL' });
  });
});
