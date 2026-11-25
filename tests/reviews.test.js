// Reviews: verified buyers only; photos (own uploads, max 5); paged list with summary, filters and photo strip;
// a new review shows immediately; helpful votes; product photos limited to 4.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address, key } from './setup/context.js';

let ctx;
let listing;
let productId;
let png;

const photo = async (agent, buffer = png) => agent.raw.post('/api/reviews/media').set('Origin', ctx.config.origin).set('Content-Type', 'image/png').send(buffer);
async function deliveredBuyer() {
  const buyer = await ctx.register();
  const res = await buyer.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: listing.id, quantity: 1 }], address, paymentMethod: 'COD' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await ctx.prisma.sellerOrder.updateMany({ where: { orderId: res.body.order.id }, data: { status: 'DELIVERED' } });
  return buyer;
}
const review = (agent, body) => agent.post(`/api/products/${productId}/reviews`).send({ rating: 5, title: 'Lovely quality', body: 'Sturdy, well made and exactly as described.', ...body });

beforeAll(async () => {
  ctx = await createContext();
  listing = await ctx.listing('arc-desk-lamp');
  productId = (await ctx.prisma.productVariant.findUnique({ where: { id: listing.variantId } })).catalogProductId;
  await ctx.prisma.sellerStore.update({ where: { id: listing.storeId }, data: { codEnabled: true } });
  await ctx.prisma.sellerListing.update({ where: { id: listing.id }, data: { codAllowed: true, moq: 1 } });
  await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: listing.id }, data: { onHand: 500, reserved: 0 } });
  const sharp = (await import('sharp')).default;
  png = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#c96' } }).png().toBuffer();
});
afterAll(async () => { await ctx?.close(); });

describe('Review photos', () => {
  it('only customers with a delivered order can upload, and only their own photos can be attached', async () => {
    const stranger = await ctx.register();
    expect((await photo(stranger.agent)).status).toBe(403);

    const a = await deliveredBuyer();
    const b = await deliveredBuyer();
    const upA = await photo(a.agent);
    expect(upA.status, JSON.stringify(upA.body)).toBe(201);
    // b cannot attach a's photo
    expect((await review(b.agent, { images: [upA.body.media.url] })).status).toBe(400);
    // more than 5 photos is refused
    expect((await review(a.agent, { images: Array(6).fill(upA.body.media.url) })).status).toBe(400);
    const upA2 = await photo(a.agent);
    const ok = await review(a.agent, { images: [upA.body.media.url, upA2.body.media.url] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.review.images).toHaveLength(2);
  });
});

describe('Review list', () => {
  it('a new review appears at once, with summary, filters, photo strip and paging', async () => {
    const before = (await ctx.agent().get(`/api/products/${productId}/reviews?size=2`)).body;
    const c = await deliveredBuyer();
    expect((await review(c.agent, { rating: 2, title: 'Not for me', body: 'The light is dimmer than I expected for my desk.' })).status).toBe(201);

    const after = (await ctx.agent().get(`/api/products/${productId}/reviews?size=2&sort=newest`)).body;
    expect(after.summary.count).toBe(before.summary.count + 1);
    expect(after.reviews[0].title).toBe('Not for me'); // no cache delay
    expect(after.total).toBe(after.summary.count);
    expect(after.pages).toBe(Math.ceil(after.total / 2));
    expect(after.summary.breakdown.reduce((s, b) => s + b.count, 0)).toBe(after.summary.count);
    expect(after.summary.withPhotos).toBeGreaterThanOrEqual(1);
    expect(after.photos.length).toBeGreaterThanOrEqual(2);

    const twoStar = (await ctx.agent().get(`/api/products/${productId}/reviews?rating=2`)).body;
    expect(twoStar.reviews.every((r) => r.rating === 2)).toBe(true);
    const withPhotos = (await ctx.agent().get(`/api/products/${productId}/reviews?photos=true`)).body;
    expect(withPhotos.reviews.every((r) => r.images.length > 0)).toBe(true);
    const page2 = (await ctx.agent().get(`/api/products/${productId}/reviews?size=2&page=2&sort=newest`)).body;
    expect(page2.reviews.map((r) => r.id)).not.toContain(after.reviews[0].id);
  });

  it('hidden reviews are not listed or counted', async () => {
    const d = await deliveredBuyer();
    const r = await review(d.agent, { title: 'Hidden one', body: 'This review will be hidden by moderation.' });
    const count = (await ctx.agent().get(`/api/products/${productId}/reviews`)).body.summary.count;
    await ctx.prisma.review.update({ where: { id: r.body.review.id }, data: { status: 'HIDDEN' } });
    const now = (await ctx.agent().get(`/api/products/${productId}/reviews?size=30`)).body;
    expect(now.summary.count).toBe(count - 1);
    expect(now.reviews.some((x) => x.id === r.body.review.id)).toBe(false);
  });
});

describe('Helpful votes', () => {
  it('a shopper can mark a review helpful once and undo it; reviewers cannot vote for themselves', async () => {
    const author = await deliveredBuyer();
    const r = (await review(author.agent, { title: 'Bright and steady', body: 'Good light for reading and work at night.' })).body.review;
    expect((await author.agent.post(`/api/reviews/${r.id}/helpful`).send({})).status).toBe(409);
    const fan = await ctx.register();
    const on = await fan.agent.post(`/api/reviews/${r.id}/helpful`).send({});
    expect(on.body).toEqual({ helpful: true, helpfulCount: 1 });
    const listed = (await fan.agent.get(`/api/products/${productId}/reviews?size=30`)).body.reviews.find((x) => x.id === r.id);
    expect(listed).toMatchObject({ helpfulCount: 1, votedHelpful: true });
    const top = (await ctx.agent().get(`/api/products/${productId}/reviews?sort=helpful&size=1`)).body.reviews[0];
    expect(top.helpfulCount).toBeGreaterThanOrEqual(1);
    const off = await fan.agent.post(`/api/reviews/${r.id}/helpful`).send({});
    expect(off.body).toEqual({ helpful: false, helpfulCount: 0 });
  });
});

describe('Product photos', () => {
  it('a product can have at most 4 photos', async () => {
    const { agent } = await ctx.register('seller');
    const store = await ctx.prisma.sellerStore.findFirst({ where: { members: { some: { user: { email: { startsWith: 'seller-' } } } } }, orderBy: { createdAt: 'desc' } });
    await ctx.prisma.sellerStore.update({ where: { id: store.id }, data: { status: 'APPROVED' } });
    const urls = [];
    for (let i = 0; i < 5; i++) {
      const up = await agent.raw.post('/api/seller/media').set('Origin', ctx.config.origin).set('Content-Type', 'image/png').send(png);
      expect(up.status, JSON.stringify(up.body)).toBe(201);
      urls.push(up.body.media.url);
    }
    const body = { name: 'Brass desk bell', brand: 'Lumen', category: 'Home & Living', description: 'A brass desk bell with a clear, bright ring for shops and front desks.', sku: `BELL-${Date.now()}`, pricePaise: 49900, mrpPaise: 69900, stock: 10 };
    const five = await agent.post('/api/seller/products').send({ ...body, images: urls });
    expect(five.status).toBe(400);
    expect(JSON.stringify(five.body)).toMatch(/up to 4 photos/);
    const four = await agent.post('/api/seller/products').send({ ...body, images: urls.slice(0, 4) });
    expect(four.status, JSON.stringify(four.body)).toBe(201);
  });
});
