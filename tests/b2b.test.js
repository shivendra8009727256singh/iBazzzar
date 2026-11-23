import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address } from './setup/context.js';

let ctx;
let owner;
let buyer;
let approver;
let seller;
let otherSeller;
let listing;
let product;
beforeAll(async () => {
  ctx = await createContext();
  owner = await ctx.register('business');
  buyer = await ctx.register();
  approver = await ctx.register();
  await ctx.approveAll();
  // Demo seller stores have no login; make a real seller own the demo headphones store for this test.
  seller = await ctx.register();
  otherSeller = await ctx.register();
  const store = await ctx.prisma.sellerStore.findUnique({ where: { slug: 'the-everyday-collective' } });
  const other = await ctx.prisma.sellerStore.findUnique({ where: { slug: 'objects-and-spaces' } });
  await ctx.prisma.sellerMember.create({ data: { storeId: store.id, userId: seller.user.id, role: 'OWNER' } });
  await ctx.prisma.sellerMember.create({ data: { storeId: other.id, userId: otherSeller.user.id, role: 'OWNER' } });
  product = await ctx.prisma.catalogProduct.findUnique({ where: { slug: 'notebook-work-set' } });
  listing = await ctx.listing('notebook-work-set');
});
afterAll(async () => { await ctx?.close(); });

describe('Business team', () => {
  it('only the owner manages the team, and nobody can add themselves', async () => {
    expect((await owner.agent.post('/api/business/members').send({ email: buyer.email, role: 'BUYER' })).status).toBe(201);
    expect((await owner.agent.post('/api/business/members').send({ email: approver.email, role: 'APPROVER' })).status).toBe(201);
    expect((await buyer.agent.post('/api/business/members').send({ email: seller.email, role: 'APPROVER' })).status).toBe(403);
    expect((await owner.agent.patch('/api/business/settings').send({ approvalThresholdPaise: 0 })).status).toBe(200);
  });
});

describe('RFQ → quotation → purchase order → order', () => {
  let rfqId;
  let quotationId;
  let poId;

  it('a buyer requests quotes from every approved seller of the product', async () => {
    const res = await buyer.agent.post('/api/business/rfqs').send({
      title: 'Notebooks for the new office', deliveryPincode: '411002', notes: 'Ruled, A5. Need GST invoice.',
      items: [{ catalogProductId: product.id, description: 'Notebook work set', quantity: 200 }],
    });
    expect(res.status).toBe(201);
    rfqId = res.body.rfq.id;
    const sellerView = await seller.agent.get('/api/seller/rfqs');
    expect(sellerView.body.requests).toHaveLength(1);
    expect((await otherSeller.agent.get('/api/seller/rfqs')).body.requests).toHaveLength(0);
  });

  it('the seller quotes, negotiates and revises; the buyer sees every revision', async () => {
    const rfq = await buyer.agent.get(`/api/business/rfqs/${rfqId}`);
    const rfqItemId = rfq.body.rfq.items[0].id;
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const q1 = await seller.agent.post(`/api/seller/rfqs/${rfqId}/quotes`).send({ items: [{ rfqItemId, listingId: listing.id, quantity: 200, unitPaise: 60000 }], terms: 'Delivery in 5 days', validUntil, deliveryDays: 5, shippingPaise: 50000, paymentTerms: 'NET_30' });
    expect(q1.status).toBe(201);
    quotationId = q1.body.quotationId;
    // Another seller can't quote with listings that aren't theirs.
    const otherListing = await ctx.listing('arc-desk-lamp');
    expect((await otherSeller.agent.post(`/api/seller/rfqs/${rfqId}/quotes`).send({ items: [{ rfqItemId, listingId: otherListing.id, quantity: 200, unitPaise: 100 }], terms: 'Cheap', validUntil, deliveryDays: 5 })).status).toBe(404);
    const store = (await ctx.prisma.sellerMember.findFirst({ where: { userId: seller.user.id } })).storeId;
    expect((await buyer.agent.post(`/api/business/rfqs/${rfqId}/messages/${store}`).send({ body: 'Can you do ₹580 per set?' })).status).toBe(201);
    const q2 = await seller.agent.post(`/api/seller/rfqs/${rfqId}/quotes`).send({ items: [{ rfqItemId, listingId: listing.id, quantity: 200, unitPaise: 58000 }], terms: 'Delivery in 5 days', validUntil, deliveryDays: 5, shippingPaise: 50000, paymentTerms: 'NET_30' });
    expect(q2.body.revision).toBe(2);
    const view = await buyer.agent.get(`/api/business/rfqs/${rfqId}`);
    const quote = view.body.quotations.find((q) => q.quotationId === quotationId);
    expect(quote.revisions).toHaveLength(2);
    expect(quote.current.totalPaise).toBe(200 * 58000 + 50000);
    expect(quote.messages).toHaveLength(1);
  });

  it('accepting freezes the quote into a PO that needs approval', async () => {
    const res = await buyer.agent.post(`/api/business/quotes/${quotationId}/accept`).send({});
    expect(res.status).toBe(200);
    expect(res.body.purchaseOrder.status).toBe('PENDING_APPROVAL');
    expect(res.body.purchaseOrder.number).toMatch(/^PO-/);
    poId = res.body.purchaseOrder.id;
    // A later price change in the catalogue doesn't touch the PO.
    await ctx.prisma.sellerListing.update({ where: { id: listing.id }, data: { pricePaise: 99900, mrpPaise: 99900 } });
  });

  it('enforces approval permissions and separation of duties', async () => {
    expect((await buyer.agent.post(`/api/business/purchase-orders/${poId}/approve`).send({})).status).toBe(403);
    expect((await seller.agent.post(`/api/seller/purchase-orders/${poId}/confirm`).send({})).status).toBe(409);
    expect((await approver.agent.post(`/api/business/purchase-orders/${poId}/reject`).send({})).status).toBe(400);
    const ok = await approver.agent.post(`/api/business/purchase-orders/${poId}/approve`).send({});
    expect(ok.body.purchaseOrder.status).toBe('APPROVED');
  });

  it('the seller confirms, then credit terms are refused until finance approves them', async () => {
    expect((await otherSeller.agent.post(`/api/seller/purchase-orders/${poId}/confirm`).send({})).status).toBe(404);
    expect((await seller.agent.post(`/api/seller/purchase-orders/${poId}/confirm`).send({})).body.purchaseOrder.status).toBe('CONFIRMED_BY_SELLER');
    const denied = await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'CREDIT_TERMS' });
    expect(denied.status).toBe(403);
  });

  it('places the order at the negotiated price by bank transfer, once', async () => {
    const short = await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'BANK_TRANSFER' });
    expect(short.status).toBe(409); // only 80 in stock for a 200-unit PO
    expect(short.body.error).toMatch(/left/);
    await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: listing.id }, data: { onHand: 500 } });
    const res = await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'BANK_TRANSFER' });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ mode: 'BUSINESS', status: 'AWAITING_PAYMENT', paymentStatus: 'BANK_TRANSFER_PENDING', totalPaise: 200 * 58000 + 50000 });
    expect(res.body.order.parcels[0].items[0].unitPaise).toBe(58000);
    const again = await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'BANK_TRANSFER' });
    expect(again.body.order.id).toBe(res.body.order.id);
    expect((await approver.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'BANK_TRANSFER' })).status).toBe(403);

    // Finance matches the UTR and confirms payment.
    const admin = await ctx.admin();
    expect((await admin.agent.post(`/api/admin/orders/${res.body.order.id}/bank-transfer`).send({ utr: 'HDFC00012345678' })).status).toBe(200);
    const order = await ctx.prisma.order.findUnique({ where: { id: res.body.order.id } });
    expect(order).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
  });

  it('teammates see the order exists but not the requester’s address', async () => {
    const list = await approver.agent.get('/api/business/orders');
    expect(list.body.orders[0].address).toBeNull();
    const mine = await buyer.agent.get('/api/business/orders');
    expect(mine.body.orders[0].address.pincode).toBe(address.pincode);
  });

  it('unapproved business accounts cannot request quotes', async () => {
    const fresh = await ctx.register('business', { business: { legalName: 'Pending Traders LLP', businessType: 'LLP' } });
    const res = await fresh.agent.post('/api/business/rfqs').send({ title: 'Should not work', deliveryPincode: '411002', notes: 'Pending account', items: [{ catalogProductId: product.id, description: 'Notebook', quantity: 50 }] });
    expect(res.status).toBe(403);
  });
});
