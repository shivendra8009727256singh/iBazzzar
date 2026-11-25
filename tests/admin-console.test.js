// Admin console: tables (sort, filter, page size, CSV), 360 views, actions with reasons, permissions and analytics.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address, otherStateAddress, key } from './setup/context.js';
import { commissionRateFor } from '../apps/api/src/services/settings.js';

let ctx;
let admin;
let listing;
let buyer;
let order;
beforeAll(async () => {
  ctx = await createContext();
  admin = await ctx.admin();
  // A live, in-stock offer from a seller that accepts cash on delivery.
  listing = await ctx.prisma.sellerListing.findFirst({ where: { status: 'APPROVED', codAllowed: true, variant: { product: { status: 'APPROVED' } } }, include: { variant: { include: { product: true } } } });
  await ctx.prisma.sellerStore.update({ where: { id: listing.storeId }, data: { codEnabled: true } });
  await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: listing.id }, data: { onHand: 100 } });
  buyer = await ctx.register('customer', { name: 'Meera Joshi' });
  const res = await buyer.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: listing.id, quantity: listing.moq }], address, paymentMethod: 'COD' });
  expect(res.status).toBe(201);
  order = res.body.order;
  // Demo-mode checkouts are flagged as demo; treat this one as real so analytics count it.
  await ctx.prisma.order.update({ where: { id: order.id }, data: { demo: false } });
});
afterAll(async () => { await ctx?.close(); });

describe('Admin tables', () => {
  it('sorts, filters, pages and exports the same filtered list as CSV', async () => {
    const page = await admin.agent.get('/api/admin/users?limit=25&sort=name&dir=asc');
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 1, limit: 25, sort: 'name', dir: 'asc' });
    const names = page.body.users.map((u) => u.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    expect((await admin.agent.get('/api/admin/users?limit=30')).status).toBe(400);
    expect((await admin.agent.get('/api/admin/users?sort=password')).status).toBe(400);

    const found = await admin.agent.get(`/api/admin/users?q=${encodeURIComponent('Meera Joshi')}`);
    expect(found.body.users.map((u) => u.id)).toContain(buyer.user.id);
    const csv = await admin.agent.get(`/api/admin/users?q=${encodeURIComponent('Meera Joshi')}&format=csv`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Meera Joshi');
    expect(csv.text.trim().split('\n')).toHaveLength(2);
  });

  it('filters orders by method and date and reports the filtered total value', async () => {
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const res = await admin.agent.get(`/api/admin/orders?method=COD&from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.orders.map((o) => o.id)).toContain(order.id);
    expect(res.body.totalValuePaise).toBeGreaterThanOrEqual(order.totalPaise);
    const none = await admin.agent.get('/api/admin/orders?method=COD&from=2020-01-01&to=2020-01-02');
    expect(none.body.total).toBe(0);
  });
});

describe('360 views, search and notes', () => {
  it('global search finds the order and the customer', async () => {
    const res = await admin.agent.get(`/api/admin/search?q=${order.number}`);
    expect(res.body.results.orders[0].id).toBe(order.id);
    const people = await admin.agent.get('/api/admin/search?q=Meera');
    expect(people.body.results.users.map((u) => u.id)).toContain(buyer.user.id);
    expect((await admin.agent.get('/api/admin/search?q=a')).status).toBe(400);
  });

  it('internal notes show on the customer 360 and never to the customer', async () => {
    const add = await admin.agent.post('/api/admin/notes').send({ entityType: 'user', entityId: buyer.user.id, body: 'Called about delivery timing.' });
    expect(add.status).toBe(201);
    const view = await admin.agent.get(`/api/admin/users/${buyer.user.id}`);
    expect(view.body.notes[0].body).toBe('Called about delivery timing.');
    expect(view.body.orders.map((o) => o.id)).toContain(order.id);
    expect((await buyer.agent.get(`/api/admin/notes?entityType=user&entityId=${buyer.user.id}`)).status).toBe(403);
  });

  it('order 360 lists what staff may still do', async () => {
    const res = await admin.agent.get(`/api/admin/orders/${order.id}`);
    expect(res.status).toBe(200);
    expect(res.body.actions).toMatchObject({ cancelUnpaid: false, editAddress: true, refund: false });
    expect(res.body.order.parcels[0].actions).toMatchObject({ pack: true, cancel: true });
  });
});

describe('Order actions', () => {
  it('edits the address before shipping, but never into another state', async () => {
    const moved = await admin.agent.patch(`/api/admin/orders/${order.id}/address`).send({ ...otherStateAddress, reason: 'Customer asked by phone' });
    expect(moved.status).toBe(409);
    const ok = await admin.agent.patch(`/api/admin/orders/${order.id}/address`).send({ ...address, line1: '14 Commerce Street, Flat 3', reason: 'Customer asked by phone' });
    expect(ok.status).toBe(200);
    const saved = await ctx.prisma.order.findUnique({ where: { id: order.id } });
    expect(saved.shippingAddress.line1).toBe('14 Commerce Street, Flat 3');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'order.address-changed', entityId: order.id } })).toBe(1);
  });

  it('every action needs a reason', async () => {
    const parcel = (await admin.agent.get(`/api/admin/orders/${order.id}`)).body.order.parcels[0];
    expect((await admin.agent.post(`/api/admin/orders/${order.id}/parcels/${parcel.id}/pack`).send({})).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/orders/${order.id}/parcels/${parcel.id}/pack`).send({ reason: 'Seller unreachable, packed at hub' })).status).toBe(200);
  });

  it('messages the customer in the app and by email', async () => {
    const res = await admin.agent.post(`/api/admin/orders/${order.id}/message`).send({ subject: 'Delivery update', body: 'Your parcel will reach you by Friday.' });
    expect(res.body).toMatchObject({ ok: true, emailed: true });
    expect(ctx.mails.at(-1).subject).toContain(order.number);
    expect(await ctx.prisma.notification.count({ where: { userId: buyer.user.id, title: 'Delivery update' } })).toBe(1);
  });

  it('refunds only money actually received, capped at the parcel total', async () => {
    const parcel = (await admin.agent.get(`/api/admin/orders/${order.id}`)).body.order.parcels[0];
    const early = await admin.agent.post(`/api/admin/orders/${order.id}/refund`).send({ parcelId: parcel.id, amountPaise: 1000, reason: 'Goodwill for the delay' });
    expect(early.status).toBe(409); // COD not collected yet
    await ctx.prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'COD_COLLECTED' } });
    const tooMuch = await admin.agent.post(`/api/admin/orders/${order.id}/refund`).send({ parcelId: parcel.id, amountPaise: parcel.totalPaise + 100, reason: 'Goodwill for the delay' });
    expect(tooMuch.status).toBe(409);
    const ok = await admin.agent.post(`/api/admin/orders/${order.id}/refund`).send({ parcelId: parcel.id, amountPaise: 5000, reason: 'Goodwill for the delay' });
    expect(ok.status).toBe(201);
    const after = (await admin.agent.get(`/api/admin/orders/${order.id}`)).body.order.parcels[0];
    expect(after.refundablePaise).toBe(parcel.totalPaise - 5000);
  });
});

describe('Catalogue', () => {
  it('creates categories, refuses duplicates and only deletes empty ones', async () => {
    const created = await admin.agent.post('/api/admin/categories').send({ name: 'Garden Tools', description: 'Spades, rakes and more' });
    expect(created.status).toBe(201);
    expect((await admin.agent.post('/api/admin/categories').send({ name: 'garden tools' })).status).toBe(409);
    const busy = listing.variant.product.categoryId;
    expect((await admin.agent.delete(`/api/admin/categories/${busy}`)).status).toBe(409);
    expect((await admin.agent.delete(`/api/admin/categories/${created.body.category.id}`)).status).toBe(200);
  });

  it('admin edits stay live (no re-moderation) and featuring needs a live product', async () => {
    const id = listing.variant.product.id;
    const res = await admin.agent.patch(`/api/admin/products/${id}`).send({ name: `${listing.variant.product.name} (Pack)`, featured: true });
    expect(res.status).toBe(200);
    const p = await ctx.prisma.catalogProduct.findUnique({ where: { id } });
    expect(p).toMatchObject({ status: 'APPROVED', featured: true });
    expect(p.searchText).toContain('(pack)');
    const bulk = await admin.agent.post('/api/admin/products/bulk').send({ ids: [id], action: 'pause' });
    expect(bulk.status).toBe(400); // pausing needs a reason
    const paused = await admin.agent.post('/api/admin/products/bulk').send({ ids: [id], action: 'pause', reason: 'Label recall check' });
    expect(paused.body.done).toBe(1);
    expect(await ctx.prisma.catalogProduct.findUnique({ where: { id } })).toMatchObject({ status: 'PAUSED', featured: false });
    await admin.agent.post('/api/admin/products/bulk').send({ ids: [id], action: 'resume' });
  });

  it('merges a duplicate brand into another and moves its products', async () => {
    const a = (await admin.agent.post('/api/admin/brands').send({ name: 'Acme Kitchen' })).body.brand;
    const b = (await admin.agent.post('/api/admin/brands').send({ name: 'ACME Kitchenware' })).body.brand;
    await ctx.prisma.catalogProduct.update({ where: { id: listing.variant.product.id }, data: { brandId: a.id } });
    expect((await admin.agent.delete(`/api/admin/brands/${a.id}`)).status).toBe(409);
    const merged = await admin.agent.post(`/api/admin/brands/${a.id}/merge`).send({ intoId: b.id });
    expect(merged.body.productsMoved).toBe(1);
    expect((await ctx.prisma.catalogProduct.findUnique({ where: { id: listing.variant.product.id } })).brandId).toBe(b.id);
    expect(await ctx.prisma.brand.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it('corrects stock with a reason and tells the seller', async () => {
    const res = await admin.agent.post(`/api/admin/listings/${listing.id}/stock`).send({ delta: 5, reason: 'Recount at warehouse' });
    expect(res.status).toBe(200);
    expect((await admin.agent.post(`/api/admin/listings/${listing.id}/stock`).send({ delta: -1_000_000, reason: 'Recount at warehouse' })).status).toBe(409); // never below what is held
    expect((await admin.agent.post(`/api/admin/listings/${listing.id}/stock`).send({ delta: 5 })).status).toBe(400); // reason required
  });
});

describe('Coupons', () => {
  const base = () => ({ code: `SAVE${Math.floor(Math.random() * 1e6)}`, description: 'Ten percent off', kind: 'PERCENT', value: 10, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
  it('edits a coupon fully and re-validates it', async () => {
    const c = (await admin.agent.post('/api/admin/coupons').send(base())).body.coupon;
    expect((await admin.agent.patch(`/api/admin/coupons/${c.id}`).send({ value: 95 })).status).toBe(400);
    const ok = await admin.agent.patch(`/api/admin/coupons/${c.id}`).send({ value: 15, description: 'Fifteen percent off' });
    expect(ok.body.coupon).toMatchObject({ value: 15, description: 'Fifteen percent off', state: 'ACTIVE' });
    const listed = await admin.agent.get(`/api/admin/coupons?q=${c.code}`);
    expect(listed.body.coupons[0]).toMatchObject({ code: c.code, orders: 0 });
  });

  it('deletes only unused coupons; used ones are kept and can be paused', async () => {
    const unused = (await admin.agent.post('/api/admin/coupons').send(base())).body.coupon;
    const used = (await admin.agent.post('/api/admin/coupons').send(base())).body.coupon;
    await ctx.prisma.coupon.update({ where: { id: used.id }, data: { used: 1 } });
    expect((await admin.agent.patch(`/api/admin/coupons/${used.id}`).send({ code: 'RENAMED1' })).status).toBe(409);
    const bulk = await admin.agent.post('/api/admin/coupons/bulk').send({ ids: [unused.id, used.id], action: 'delete' });
    expect(bulk.body.done).toBe(1);
    expect(bulk.body.skipped[0].id).toBe(used.id);
    expect((await admin.agent.post('/api/admin/coupons/bulk').send({ ids: [used.id], action: 'pause' })).body.done).toBe(1);
    expect((await ctx.prisma.coupon.findUnique({ where: { id: used.id } })).active).toBe(false);
  });
});

describe('Sellers and finance controls', () => {
  it('a seller commission override wins over the category rule', async () => {
    const before = await commissionRateFor(ctx.prisma, listing.variant.product.categoryId, listing.storeId);
    expect((await admin.agent.patch(`/api/admin/sellers/${listing.storeId}`).send({ commissionBps: 450 })).status).toBe(200);
    expect(await commissionRateFor(ctx.prisma, listing.variant.product.categoryId, listing.storeId)).toBe(450);
    await admin.agent.patch(`/api/admin/sellers/${listing.storeId}`).send({ commissionBps: null });
    expect(await commissionRateFor(ctx.prisma, listing.variant.product.categoryId, listing.storeId)).toBe(before);
  });

  it('a payout hold blocks payouts until released', async () => {
    expect((await admin.agent.patch(`/api/admin/sellers/${listing.storeId}`).send({ payoutHold: true })).status).toBe(400);
    expect((await admin.agent.patch(`/api/admin/sellers/${listing.storeId}`).send({ payoutHold: true, payoutHoldReason: 'KYC document expired' })).status).toBe(200);
    const res = await admin.agent.post('/api/admin/payouts').send({ storeId: listing.storeId, amountPaise: 1000, providerRef: 'HDFC00012345678' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/on hold/);
    await admin.agent.patch(`/api/admin/sellers/${listing.storeId}`).send({ payoutHold: false, payoutHoldReason: null });
  });
});

describe('Permissions', () => {
  it('the Admin can switch capabilities per role; staff.manage is never grantable', async () => {
    const person = await ctx.register();
    await admin.agent.put(`/api/admin/users/${person.user.id}/roles`).send({ roles: ['SUPPORT'] });
    const support = ctx.agent();
    await support.post('/api/auth/login').send({ email: person.email, password: 'Correct horse battery 9' });
    expect((await support.get('/api/admin/analytics')).status).toBe(403);

    const current = (await admin.agent.get('/api/admin/permissions')).body.matrix;
    const invalid = await admin.agent.put('/api/admin/permissions').send({ ...current, SUPPORT: [...current.SUPPORT, 'staff.manage'] });
    expect(invalid.status).toBe(400);
    const saved = await admin.agent.put('/api/admin/permissions').send({ ...current, SUPPORT: [...current.SUPPORT, 'dashboard', 'reports.view'] });
    expect(saved.status).toBe(200);
    expect((await support.get('/api/admin/analytics')).status).toBe(200);
    expect((await support.put('/api/admin/permissions').send(current)).status).toBe(403);
    await admin.agent.put('/api/admin/permissions').send(current);
    expect((await support.get('/api/admin/analytics')).status).toBe(403);
  });
});

describe('Analytics', () => {
  it('compares with the previous period, splits B2C/B2B and never estimates conversion', async () => {
    const res = await admin.agent.get('/api/admin/analytics');
    expect(res.status).toBe(200);
    expect(res.body.summary.orders).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.gmvPaise).toBeGreaterThan(0);
    expect(res.body.previous).toBeTruthy();
    expect(res.body.change).toHaveProperty('orders');
    expect(res.body.series).toHaveLength(30);
    expect(res.body.modes.find((x) => x.mode === 'RETAIL').orders).toBeGreaterThanOrEqual(1);
    expect(res.body.products.top[0].units).toBeGreaterThanOrEqual(2);
    expect(res.body.payments.mix.find((x) => x.method === 'COD')).toBeTruthy();
    expect(res.body.gst.length).toBeGreaterThan(0);
    expect(res.body.conversion.available).toBe(false);

    const b2b = await admin.agent.get('/api/admin/analytics?mode=BUSINESS');
    expect(b2b.body.summary.orders).toBe(0);
    expect((await admin.agent.get('/api/admin/analytics?from=2026-05-01&to=2026-04-01')).status).toBe(400);
  });

  it('downloads the analytics as an Excel workbook or one section as CSV', async () => {
    const xlsx = await admin.agent.get('/api/admin/analytics/export').buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
    const csv = await admin.agent.get('/api/admin/analytics/export?format=csv&section=daily');
    expect(csv.text).toContain('Date');
    expect((await admin.agent.get('/api/admin/analytics/export?format=csv')).status).toBe(400);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'analytics.exported' } })).toBe(2);
  });
});

describe('Dashboard and console chrome', () => {
  it('compares today and the last 30 days, and shows the order pipeline and leaders', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/extra');
    expect(res.status).toBe(200);
    expect(res.body.last30.orders).toBeGreaterThanOrEqual(1);
    expect(res.body.last30.gmvPaise).toBeGreaterThan(0);
    expect(res.body.pipeline).toHaveProperty('inTransit');
    expect(res.body.topProducts[0].units).toBeGreaterThanOrEqual(1);
    expect(res.body.paymentMix.find((p) => p.method === 'COD')).toBeTruthy();
    expect(Array.isArray(res.body.activity)).toBe(true);
  });

  it('status cards count by status with a 14-day trend; the bell lists only what the role can act on', async () => {
    const users = await admin.agent.get('/api/admin/summary/users');
    expect(users.body.ALL.total).toBeGreaterThan(0);
    expect(users.body.ALL.series).toHaveLength(14);
    expect(users.body.types.customer).toBeGreaterThan(0);
    expect((await admin.agent.get('/api/admin/summary/nope')).status).toBe(404);
    const bell = await admin.agent.get('/api/admin/attention');
    expect(bell.status).toBe(200);
    expect(bell.body).toHaveProperty('total');
    const shopper = await ctx.register();
    expect((await shopper.agent.get('/api/admin/attention')).status).toBe(403);
    expect((await shopper.agent.get('/api/admin/dashboard/extra')).status).toBe(403);
  });
});

describe('Deals page banner', () => {
  it('admin edits the banner, bad colours are refused, and /api/deals serves it', async () => {
    const before = (await ctx.agent().get('/api/deals')).body.hero;
    expect(before.eyebrow).toBeTruthy();
    expect((await admin.agent.put('/api/admin/deals-hero').send({ bgFrom: 'red' })).status).toBe(400);
    const res = await admin.agent.put('/api/admin/deals-hero').send({ title: 'Mega Monsoon Sale', bgFrom: '#3b0a45', showTimer: false });
    expect(res.status).toBe(200);
    const hero = (await ctx.agent().get('/api/deals')).body.hero;
    expect(hero).toMatchObject({ title: 'Mega Monsoon Sale', bgFrom: '#3b0a45', showTimer: false, eyebrow: before.eyebrow });
    const shopper = await ctx.register();
    expect((await shopper.agent.put('/api/admin/deals-hero').send({ title: 'Nope' })).status).toBe(403);
  });
});

describe('Homepage deal block', () => {
  it('admin picks the featured deal and look; unknown deals are refused; /api/home serves it', async () => {
    const promo = await ctx.prisma.promotion.create({ data: { name: 'Home block test deal', description: 'For the homepage block test', discountBps: 1500, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000) } });
    expect((await admin.agent.put('/api/admin/home-deal').send({ promotionId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await admin.agent.put('/api/admin/home-deal').send({ bgVia: 'blue' })).status).toBe(400);
    const res = await admin.agent.put('/api/admin/home-deal').send({ promotionId: promo.id, label: 'Weekend special', bgFrom: '#0b1a33', showTimer: false });
    expect(res.status).toBe(200);
    const home = (await ctx.agent().get('/api/home')).body;
    expect(home.homeDeal).toMatchObject({ promotionId: promo.id, label: 'Weekend special', bgFrom: '#0b1a33', showTimer: false, ctaLabel: 'All deals', enabled: true });
    const cms = (await admin.agent.get('/api/admin/cms')).body;
    expect(cms.promotions.some((p) => p.id === promo.id)).toBe(true);
    const shopper = await ctx.register();
    expect((await shopper.agent.put('/api/admin/home-deal').send({ enabled: false })).status).toBe(403);
  });
});

describe('Dashboard today', () => {
  it('counts COD and simulated online payments as sales today; unpaid orders show as awaiting payment', async () => {
    const before = (await admin.agent.get('/api/admin/dashboard/extra')).body.today;
    const shopper = await ctx.register('customer');
    const items = [{ listingId: listing.id, quantity: listing.moq }];
    const cod = await shopper.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items, address, paymentMethod: 'COD' });
    expect(cod.status).toBe(201);
    const online = await shopper.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items, address, paymentMethod: 'ONLINE' });
    expect(online.status).toBe(201);

    const unpaid = (await admin.agent.get('/api/admin/dashboard/extra')).body.today;
    expect(unpaid.orders).toBe(before.orders + 1);
    expect(unpaid.awaitingPayment).toBe(before.awaitingPayment + 1);
    expect(unpaid).not.toHaveProperty('demoOrders');

    expect((await shopper.agent.post(`/api/orders/${online.body.order.id}/demo-payment`).send({})).status).toBe(200);
    const paid = (await admin.agent.get('/api/admin/dashboard/extra')).body.today;
    expect(paid.orders).toBe(before.orders + 2);
    expect(paid.gmvPaise).toBe(before.gmvPaise + cod.body.order.totalPaise + online.body.order.totalPaise);
    expect(paid.awaitingPayment).toBe(before.awaitingPayment);
    const dash = (await admin.agent.get('/api/admin/dashboard')).body.metrics;
    expect(dash).not.toHaveProperty('demoGmvPaise');
    expect(dash.paidGmvPaise).toBeGreaterThanOrEqual(online.body.order.totalPaise);
  });
});
