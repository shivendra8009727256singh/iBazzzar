import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address, otherStateAddress, key } from './setup/context.js';

let ctx;
let sellerA;
let sellerB;
let listingA;
beforeAll(async () => {
  ctx = await createContext({ demo: false });
  sellerA = await ctx.register('seller', { storeName: 'Alpha Goods', seller: { gstRegistered: true, gstin: '27AAACE1234F1Z6', pan: 'AAACE1234F' } });
  sellerB = await ctx.register('seller', { storeName: 'Beta Supplies' });
  await ctx.approveAll();
  const upload = async (agent) => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#2b6' } }).png().toBuffer();
    const res = await agent.raw.post('/api/seller/media').set('Origin', ctx.config.origin).set('Content-Type', 'image/png').send(png);
    expect(res.status).toBe(201);
    return res.body.media.url;
  };
  const productBody = (image, sku) => ({ name: 'Brass table lamp', brand: 'Lumen', category: 'Home & Living', description: 'A solid brass table lamp with a linen shade and warm light.', images: [image], sku, pricePaise: 118000, mrpPaise: 150000, stock: 10, moq: 2, tiers: [{ minQty: 5, pricePaise: 100000 }] });
  const created = await sellerA.agent.post('/api/seller/products').send(productBody(await upload(sellerA.agent), 'LAMP-1'));
  expect(created.status).toBe(201);
  listingA = created.body.listingId;
  // Seller B uploads its own photo and cannot reuse seller A's.
  const imageB = await upload(sellerB.agent);
  const stolen = await sellerB.agent.post('/api/seller/products').send(productBody((await ctx.prisma.mediaAsset.findFirst({ where: { url: { not: imageB } } })).url, 'X-1'));
  expect(stolen.status).toBe(403);
});
afterAll(async () => { await ctx?.close(); });

describe('Moderation', () => {
  it('keeps new products off the storefront until approved', async () => {
    expect((await ctx.agent().get('/api/products')).body.total).toBe(0);
    const admin = await ctx.admin();
    const queue = await admin.agent.get('/api/admin/moderation');
    expect(queue.body.products).toHaveLength(1);
    const res = await admin.agent.post(`/api/admin/moderation/product/${queue.body.products[0].id}`).send({ decision: 'APPROVED' });
    expect(res.status).toBe(200);
    expect((await ctx.agent().get('/api/products')).body.total).toBe(1);
  });
});

describe('Seller fulfilment', () => {
  let buyer;
  let order;
  it('a paid order appears only to its own seller, with the address', async () => {
    buyer = await ctx.register();
    const res = await buyer.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: listingA, quantity: 2 }], address, paymentMethod: 'ONLINE' });
    expect(res.status).toBe(201);
    order = res.body.order;
    // Unpaid orders are not visible for fulfilment.
    expect((await sellerA.agent.get('/api/seller/orders')).body.orders).toHaveLength(0);
    await buyer.agent.post(`/api/orders/${order.id}/demo-payment`).send({});
    const mine = await sellerA.agent.get('/api/seller/orders');
    expect(mine.body.orders).toHaveLength(1);
    expect(mine.body.orders[0].address.pincode).toBe(address.pincode);
    expect((await sellerB.agent.get('/api/seller/orders')).body.orders).toHaveLength(0);
    const parcelId = mine.body.orders[0].id;
    expect((await sellerB.agent.get(`/api/seller/orders/${parcelId}`)).status).toBe(404);
    expect((await sellerB.agent.post(`/api/seller/orders/${parcelId}/pack`).send({})).status).toBe(404);
  });

  it('pack → ship issues a GST invoice → delivery records seller earnings', async () => {
    const parcelId = order.parcels[0].id;
    expect((await sellerA.agent.post(`/api/seller/orders/${parcelId}/ship`).send({ mode: 'SANDBOX' })).status).toBe(409);
    expect((await sellerA.agent.post(`/api/seller/orders/${parcelId}/pack`).send({})).body.order.status).toBe('PACKED');
    const shipped = await sellerA.agent.post(`/api/seller/orders/${parcelId}/ship`).send({ mode: 'SANDBOX' });
    expect(shipped.status).toBe(200);
    const shipment = shipped.body.order.shipments[0];
    expect(shipment.trackingRef).toMatch(/^SBX/);
    expect(shipped.body.order.invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/00001$/);

    const invoice = await buyer.agent.get(`/api/orders/${order.id}/invoices/${parcelId}`);
    expect(invoice.status).toBe(200);
    expect(invoice.body.invoice.seller.gstin).toBe('27AAACE1234F1Z6');
    expect(invoice.body.invoice.totals.cgstPaise).toBeGreaterThan(0); // Maharashtra → Maharashtra
    expect(invoice.body.invoice.totals.igstPaise).toBe(0);

    for (const status of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const r = await sellerA.agent.post(`/api/seller/shipments/${shipment.id}/events`).send({ status, location: 'Pune hub' });
      expect(r.status).toBe(200);
    }
    const detail = await buyer.agent.get(`/api/orders/${order.id}`);
    expect(detail.body.order.status).toBe('DELIVERED');
    const ledger = await ctx.prisma.settlementEntry.findMany({ where: { orderId: order.id } });
    expect(ledger.map((e) => e.kind).sort()).toEqual(['COMMISSION', 'SALE']);
    expect(ledger.every((e) => e.demo)).toBe(true); // demo-simulated money is never real GMV
  });

  it('rejects an invalid shipment status jump', async () => {
    const shipment = await ctx.prisma.shipment.findFirst();
    expect((await sellerA.agent.post(`/api/seller/shipments/${shipment.id}/events`).send({ status: 'PICKED_UP' })).status).toBe(409);
  });

  it('lets only buyers who received the product review it, once', async () => {
    const productId = (await ctx.prisma.catalogProduct.findFirst()).id;
    const stranger = await ctx.register();
    expect((await stranger.agent.post(`/api/products/${productId}/reviews`).send({ rating: 5, title: 'Lovely', body: 'Really lovely lamp, warm light.' })).status).toBe(403);
    expect((await buyer.agent.post(`/api/products/${productId}/reviews`).send({ rating: 5, title: 'Lovely', body: 'Really lovely lamp, warm light.' })).status).toBe(201);
    expect((await buyer.agent.post(`/api/products/${productId}/reviews`).send({ rating: 4, title: 'Again', body: 'Trying to review twice here.' })).status).toBe(409);
  });

  it('returns: request → seller approves → receives → refund recorded, stock restored, earnings reversed', async () => {
    const parcelId = order.parcels[0].id;
    const before = await ctx.stock(listingA);
    const req = await buyer.agent.post(`/api/orders/${order.id}/returns`).send({ parcelId, reason: 'The shade arrived with a tear on one side.' });
    expect(req.status).toBe(201);
    expect(req.body.return.refundPaise).toBe(order.parcels[0].items[0].totalPaise);
    expect((await buyer.agent.post(`/api/orders/${order.id}/returns`).send({ parcelId, reason: 'Trying to return the same items twice.' })).status).toBe(409);
    expect((await sellerB.agent.post(`/api/seller/returns/${req.body.return.id}/decision`).send({ decision: 'APPROVED' })).status).toBe(404);
    expect((await sellerA.agent.post(`/api/seller/returns/${req.body.return.id}/decision`).send({ decision: 'APPROVED' })).status).toBe(200);
    expect((await sellerA.agent.post(`/api/seller/returns/${req.body.return.id}/receive`).send({ restock: true })).status).toBe(200);
    expect(await ctx.stock(listingA)).toEqual({ onHand: before.onHand + 2, reserved: before.reserved });
    const refund = await ctx.prisma.refund.findFirst({ where: { orderId: order.id } });
    expect(refund.status).toBe('DEMO_SIMULATED');
    const kinds = (await ctx.prisma.settlementEntry.findMany({ where: { orderId: order.id } })).map((e) => e.kind).sort();
    expect(kinds).toEqual(['COMMISSION', 'COMMISSION_REVERSAL', 'REFUND_ADJUSTMENT', 'SALE']);
  });

  it('seller cancellation of a COD parcel restocks and needs no refund', async () => {
    const shopper = await ctx.register();
    const res = await shopper.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: listingA, quantity: 1 }], address: otherStateAddress, paymentMethod: 'COD' });
    expect(res.status).toBe(201);
    const before = await ctx.stock(listingA);
    const cancel = await sellerA.agent.post(`/api/seller/orders/${res.body.order.parcels[0].id}/cancel`).send({ reason: 'Damaged in our warehouse' });
    expect(cancel.body.order.status).toBe('CANCELLED');
    expect(await ctx.stock(listingA)).toEqual({ onHand: before.onHand + 1, reserved: before.reserved });
    expect(await ctx.prisma.refund.count({ where: { orderId: res.body.order.id } })).toBe(0);
  });

  it('stock adjustments cannot drop below reserved units', async () => {
    const shopper = await ctx.register();
    await shopper.agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: listingA, quantity: 2 }], address, paymentMethod: 'ONLINE' });
    const { onHand, reserved } = await ctx.stock(listingA);
    const tooMuch = await sellerA.agent.post(`/api/seller/listings/${listingA}/stock`).send({ delta: -(onHand - reserved + 1), reason: 'CORRECTION' });
    expect(tooMuch.status).toBe(409);
    const ok = await sellerA.agent.post(`/api/seller/listings/${listingA}/stock`).send({ delta: 5, reason: 'RECEIVED' });
    expect(ok.body.stock.onHand).toBe(onHand + 5);
  });

  it('sellers cannot edit another seller’s listing or see their settlements', async () => {
    expect((await sellerB.agent.patch(`/api/seller/listings/${listingA}`).send({ pricePaise: 100 })).status).toBe(404);
    const settlementsB = await sellerB.agent.get('/api/seller/settlements');
    expect(settlementsB.body.entries).toHaveLength(0);
  });
});
