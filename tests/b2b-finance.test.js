// Step C: business credit and dues, statements, spend, departments, saved addresses, PO document and reminders.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext, address } from './setup/context.js';
import { runB2bReminders, monthWindow, daysLeft } from '../apps/api/src/services/b2b-finance.js';

let ctx;
let owner;
let buyer;
let outsider;
let seller;
let admin;
let listing;
let product;
let orgId;
let storeId;
const DAY = 86_400_000;

/** RFQ → quote → accept (auto-approved) → seller confirms. Returns the PO id. */
async function confirmedPo({ quantity = 10, unitPaise = 50000, terms = 'NET_30', who = buyer } = {}) {
  const rfq = await who.agent.post('/api/business/rfqs').send({ title: `Office supplies ${quantity}`, deliveryPincode: '411002', notes: 'Ruled A5 notebooks', items: [{ catalogProductId: product.id, description: 'Notebook work set', quantity }] });
  expect(rfq.status).toBe(201);
  const detail = await who.agent.get(`/api/business/rfqs/${rfq.body.rfq.id}`);
  const rfqItemId = detail.body.rfq.items[0].id;
  const q = await seller.agent.post(`/api/seller/rfqs/${rfq.body.rfq.id}/quotes`).send({ items: [{ rfqItemId, listingId: listing.id, quantity, unitPaise }], terms: 'Delivery in 4 days', validUntil: new Date(Date.now() + 5 * DAY).toISOString(), deliveryDays: 4, shippingPaise: 0, paymentTerms: terms });
  expect(q.status).toBe(201);
  const accepted = await who.agent.post(`/api/business/quotes/${q.body.quotationId}/accept`).send({});
  expect(accepted.body.purchaseOrder.status).toBe('APPROVED');
  const poId = accepted.body.purchaseOrder.id;
  expect((await seller.agent.post(`/api/seller/purchase-orders/${poId}/confirm`).send({})).status).toBe(200);
  return { poId, rfqId: rfq.body.rfq.id, quotationId: q.body.quotationId };
}

beforeAll(async () => {
  ctx = await createContext();
  owner = await ctx.register('business');
  buyer = await ctx.register();
  outsider = await ctx.register('business', { business: { legalName: 'Other Traders LLP', businessType: 'LLP' } });
  await ctx.approveAll();
  seller = await ctx.register();
  const store = await ctx.prisma.sellerStore.findUnique({ where: { slug: 'the-everyday-collective' } });
  storeId = store.id;
  await ctx.prisma.sellerMember.create({ data: { storeId, userId: seller.user.id, role: 'OWNER' } });
  product = await ctx.prisma.catalogProduct.findUnique({ where: { slug: 'notebook-work-set' } });
  listing = await ctx.listing('notebook-work-set');
  await ctx.prisma.inventoryBalance.updateMany({ where: { listingId: listing.id }, data: { onHand: 5000 } });
  expect((await owner.agent.post('/api/business/members').send({ email: buyer.email, role: 'BUYER' })).status).toBe(201);
  // Everything up to ₹1 lakh is approved automatically, so tests can focus on money.
  expect((await owner.agent.patch('/api/business/settings').send({ approvalThresholdPaise: 10_000_000 })).status).toBe(200);
  orgId = (await ctx.prisma.organizationMember.findFirst({ where: { userId: owner.user.id } })).organizationId;
  await ctx.prisma.organization.update({ where: { id: orgId }, data: { gstRegistered: true, gstin: '27AABCU9603R1ZM' } });
  admin = await ctx.admin();
  // Finance grants NET 30 credit up to ₹20,000.
  expect((await admin.agent.patch(`/api/admin/organizations/${orgId}`).send({ creditApproved: true, allowedTerms: 'NET_30', creditLimitPaise: 2_000_000 })).status).toBe(200);
});
afterAll(async () => { await ctx?.close(); });

describe('Departments and saved addresses', () => {
  let deptId;
  let warehouseId;
  it('the owner manages departments with budgets and assigns people; buyers cannot', async () => {
    const res = await owner.agent.post('/api/business/departments').send({ name: 'Facilities', monthlyBudgetPaise: 600_000 });
    expect(res.status).toBe(201);
    deptId = res.body.department.id;
    expect((await owner.agent.post('/api/business/departments').send({ name: 'Facilities' })).status).toBe(409);
    expect((await buyer.agent.post('/api/business/departments').send({ name: 'Sneaky' })).status).toBe(403);
    expect((await owner.agent.patch(`/api/business/members/${buyer.user.id}/department`).send({ departmentId: deptId })).status).toBe(200);
    const list = await buyer.agent.get('/api/business/departments');
    expect(list.body.myDepartmentId).toBe(deptId);
    expect(list.body.departments[0]).toMatchObject({ name: 'Facilities', monthlyBudgetPaise: 600_000, members: 1, spentThisMonthPaise: 0 });
    // Another business can't touch it.
    expect((await outsider.agent.patch(`/api/business/departments/${deptId}`).send({ name: 'Mine now' })).status).toBe(404);
  });

  it('saves head office and branch addresses; a branch can carry its own GSTIN', async () => {
    const hq = await owner.agent.post('/api/business/addresses').send({ ...address, label: 'Head office' });
    expect(hq.status).toBe(201);
    expect(hq.body.address.isDefault).toBe(true);
    const wh = await owner.agent.post('/api/business/addresses').send({ ...address, label: 'Pune warehouse', line1: 'Plot 7, MIDC Bhosari', gstin: '27AAPFU0939F1ZV' });
    expect(wh.status).toBe(201);
    warehouseId = wh.body.address.id;
    expect((await buyer.agent.post('/api/business/addresses').send({ ...address, label: 'Mine' })).status).toBe(403);
    const list = await buyer.agent.get('/api/business/addresses');
    expect(list.body.addresses.map((a) => a.label)).toEqual(['Head office', 'Pune warehouse']);
    expect((await outsider.agent.get('/api/business/addresses')).body.addresses).toHaveLength(0);
  });

  it('a PO checked out to a saved branch address bills that branch’s GSTIN and books the buyer’s department', async () => {
    const { poId } = await confirmedPo({ quantity: 10, unitPaise: 50000 });
    const res = await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ addressId: warehouseId, paymentMethod: 'CREDIT_TERMS' });
    expect(res.status).toBe(201);
    const order = await ctx.prisma.order.findUnique({ where: { id: res.body.order.id } });
    expect(order).toMatchObject({ paymentStatus: 'ON_TERMS', billingGstin: '27AAPFU0939F1ZV', departmentId: deptId });
    expect(order.shippingAddress.line1).toBe('Plot 7, MIDC Bhosari');
    // Someone else's address can't be used.
    const other = await outsider.agent.post('/api/business/addresses').send({ ...address, label: 'Their office' });
    const { poId: po2 } = await confirmedPo({ quantity: 2, unitPaise: 50000 });
    expect((await buyer.agent.post(`/api/business/purchase-orders/${po2}/checkout`).send({ addressId: other.body.address.id, paymentMethod: 'BANK_TRANSFER' })).status).toBe(404);
  });
});

describe('Credit, dues and reminders', () => {
  it('shows the limit, what is owed, what is available and the next due date', async () => {
    const res = await owner.agent.get('/api/business/credit');
    expect(res.status).toBe(200);
    const c = res.body.credit;
    expect(c).toMatchObject({ creditApproved: true, terms: 'NET_30', limitPaise: 2_000_000, outstandingPaise: 500_000, availablePaise: 1_500_000, usedPercent: 25, overduePaise: 0 });
    expect(c.open).toHaveLength(1);
    expect(c.open[0].daysLeft).toBeGreaterThanOrEqual(29);
    expect(c.nextDue.number).toBe(c.open[0].number);
    expect((await owner.agent.get('/api/business/overview')).body.credit.outstandingPaise).toBe(500_000);
  });

  it('reminds 3 days before the due date, once', async () => {
    const order = await ctx.prisma.order.findFirst({ where: { organizationId: orgId, paymentStatus: 'ON_TERMS' } });
    await ctx.prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: new Date(Date.now() + 2 * DAY) } });
    const first = await runB2bReminders(ctx.prisma);
    expect(first.creditReminders).toBe(1);
    expect((await runB2bReminders(ctx.prisma)).creditReminders).toBe(0);
    const note = await ctx.prisma.notification.findFirst({ where: { userId: buyer.user.id, title: { startsWith: 'Payment due in' } } });
    expect(note.link).toBe('/business/credit');
    // The owner hears about it too, and the buyer gets an email.
    expect(await ctx.prisma.notification.count({ where: { userId: owner.user.id, title: { startsWith: 'Payment due in' } } })).toBe(1);
    expect(await ctx.prisma.emailOutbox.count({ where: { kind: 'b2b.credit.due-soon' } })).toBe(1);
    expect((await owner.agent.get('/api/business/credit')).body.credit).toMatchObject({ dueSoonCount: 1, dueSoonPaise: 500_000 });
  });

  it('overdue credit is flagged, reminded and blocks new credit purchases', async () => {
    const order = await ctx.prisma.order.findFirst({ where: { organizationId: orgId, paymentStatus: 'ON_TERMS' } });
    await ctx.prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: new Date(Date.now() - 2 * DAY) } });
    expect((await runB2bReminders(ctx.prisma)).creditReminders).toBe(1);
    const c = (await owner.agent.get('/api/business/credit')).body.credit;
    expect(c).toMatchObject({ overdueCount: 1, overduePaise: 500_000 });
    expect(c.open[0].state).toBe('OVERDUE');
    const { poId } = await confirmedPo({ quantity: 4, unitPaise: 50000 });
    const blocked = await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'CREDIT_TERMS' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/overdue/);
    // Paying another way still works.
    expect((await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'BANK_TRANSFER' })).status).toBe(201);
  });

  it('when finance records the payment the due date is kept, the payment date set and it shows as paid late', async () => {
    const order = await ctx.prisma.order.findFirst({ where: { organizationId: orgId, paymentStatus: 'ON_TERMS' } });
    expect((await admin.agent.post(`/api/admin/orders/${order.id}/terms-payment`).send({ reference: 'HDFC00098765432' })).status).toBe(200);
    const paid = await ctx.prisma.order.findUnique({ where: { id: order.id } });
    expect(paid.paymentStatus).toBe('PAID');
    expect(paid.paymentDueAt).not.toBeNull();
    expect(paid.paidAt).not.toBeNull();
    const c = (await owner.agent.get('/api/business/credit')).body.credit;
    expect(c).toMatchObject({ outstandingPaise: 0, overdueCount: 0, availablePaise: 2_000_000 });
    expect(c.recentlyPaid[0]).toMatchObject({ number: order.number, late: true, reference: 'HDFC00098765432' });
    // The admin's view of the business shows the same position.
    const view = await admin.agent.get(`/api/admin/organizations/${orgId}`);
    expect(view.body.stats).toMatchObject({ outstandingPaise: 0, overduePaise: 0 });
  });
});

describe('Statement and spend', () => {
  it('the monthly statement balances: closing = opening + credit bought − credit paid', async () => {
    const res = await buyer.agent.get('/api/business/statement');
    expect(res.status).toBe(200);
    const s = res.body.statement;
    expect(s.summary.openingBalancePaise).toBe(0);
    expect(s.summary.creditPurchasesPaise).toBe(500_000);
    expect(s.summary.creditPaymentsPaise).toBe(500_000);
    expect(s.summary.closingBalancePaise).toBe(s.summary.openingBalancePaise + s.summary.creditPurchasesPaise - s.summary.creditPaymentsPaise);
    expect(s.orders.length).toBeGreaterThanOrEqual(2);
    expect(s.payments.find((p) => p.method === 'CREDIT_TERMS')).toMatchObject({ amountPaise: 500_000, late: true });
    expect(s.business.gstin).toBeTruthy();
    expect((await buyer.agent.get('/api/business/statement?month=2099-01')).status).toBe(400);
    expect((await buyer.agent.get('/api/business/statement?month=nope')).status).toBe(400);
  });

  it('a new credit order moves the closing balance and the statement still balances', async () => {
    const { poId } = await confirmedPo({ quantity: 6, unitPaise: 50000 });
    expect((await buyer.agent.post(`/api/business/purchase-orders/${poId}/checkout`).send({ address, paymentMethod: 'CREDIT_TERMS' })).status).toBe(201);
    const s = (await owner.agent.get('/api/business/statement')).body.statement.summary;
    expect(s.creditPurchasesPaise).toBe(800_000);
    expect(s.closingBalancePaise).toBe(300_000);
    expect(s.closingBalancePaise).toBe(s.openingBalancePaise + s.creditPurchasesPaise - s.creditPaymentsPaise);
  });

  it('spend is split by person and by department, against the budget', async () => {
    const res = await owner.agent.get('/api/business/spend');
    expect(res.status).toBe(200);
    const sp = res.body.spend;
    const me = sp.people.find((p) => p.id === buyer.user.id);
    expect(me.department).toBe('Facilities');
    expect(me.spendPaise).toBe(sp.totalPaise);
    const dept = sp.departments.find((d) => d.name === 'Facilities');
    expect(dept).toMatchObject({ budgetPaise: 600_000, overBudget: true });
    expect(dept.spendPaise).toBe(sp.totalPaise);
    expect(sp.trend.at(-1).spendPaise).toBe(sp.totalPaise);
  });
});

describe('Purchase-order document and ordering again', () => {
  it('the PO document has both GSTINs, HSN codes and a GST split that adds up', async () => {
    const po = await ctx.prisma.purchaseOrder.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' } });
    const res = await buyer.agent.get(`/api/business/purchase-orders/${po.id}`);
    expect(res.status).toBe(200);
    const d = res.body.document;
    expect(d.number).toBe(po.number);
    expect(d.buyer.gstin).toBeTruthy();
    expect(d.supplier.name).toBeTruthy();
    expect(d.lines[0]).toMatchObject({ quantity: 10, unitPaise: 50000, totalPaise: 500_000 });
    expect(d.lines[0].taxablePaise + d.lines[0].taxPaise).toBe(500_000);
    expect(d.totals.taxablePaise + d.totals.taxPaise).toBe(d.totals.totalPaise);
    expect(d.requestedBy).toBeTruthy();
    // The seller sees the same document; other businesses and sellers don't.
    expect((await seller.agent.get(`/api/seller/purchase-orders/${po.id}`)).body.document.number).toBe(po.number);
    expect((await outsider.agent.get(`/api/business/purchase-orders/${po.id}`)).status).toBe(404);
  });

  it('a past request or PO becomes a pre-filled draft for the same sellers', async () => {
    const rfq = await ctx.prisma.rfq.findFirst({ where: { organizationId: orgId } });
    const draft = (await buyer.agent.get(`/api/business/rfqs/${rfq.id}/draft`)).body.draft;
    expect(draft).toMatchObject({ title: rfq.title, source: rfq.number });
    expect(draft.items[0]).toMatchObject({ catalogProductId: product.id, quantity: 10 });
    expect(draft.sellers.map((s) => s.id)).toContain(storeId);
    const po = await ctx.prisma.purchaseOrder.findFirst({ where: { organizationId: orgId } });
    const poDraft = (await buyer.agent.get(`/api/business/purchase-orders/${po.id}/draft`)).body.draft;
    expect(poDraft.sellers).toEqual([{ id: storeId, name: expect.any(String) }]);
    // Sending it as a new request goes only to that seller.
    const again = await buyer.agent.post('/api/business/rfqs').send({ title: poDraft.title, deliveryPincode: poDraft.deliveryPincode, notes: poDraft.notes, items: poDraft.items.map(({ catalogProductId, description, quantity }) => ({ catalogProductId, description, quantity })), storeIds: poDraft.sellers.map((s) => s.id) });
    expect(again.status).toBe(201);
    expect(again.body.rfq.sellers).toBe(1);
  });
});

describe('Quotation expiry', () => {
  it('reminds 24 hours before a quote expires, then marks it expired', async () => {
    const rfq = await buyer.agent.post('/api/business/rfqs').send({ title: 'Expiring quote test', deliveryPincode: '411002', notes: 'Quick quote please', items: [{ catalogProductId: product.id, description: 'Notebook work set', quantity: 5 }] });
    const detail = await buyer.agent.get(`/api/business/rfqs/${rfq.body.rfq.id}`);
    const q = await seller.agent.post(`/api/seller/rfqs/${rfq.body.rfq.id}/quotes`).send({ items: [{ rfqItemId: detail.body.rfq.items[0].id, listingId: listing.id, quantity: 5, unitPaise: 50000 }], terms: 'Standard', validUntil: new Date(Date.now() + 5 * DAY).toISOString(), deliveryDays: 3, shippingPaise: 0, paymentTerms: 'PREPAID' });
    const rev = await ctx.prisma.quoteRevision.findFirst({ where: { quotationId: q.body.quotationId } });
    await ctx.prisma.quoteRevision.update({ where: { id: rev.id }, data: { validUntil: new Date(Date.now() + 6 * 3_600_000) } });
    expect((await runB2bReminders(ctx.prisma)).quoteReminders).toBe(1);
    expect((await runB2bReminders(ctx.prisma)).quoteReminders).toBe(0);
    await ctx.prisma.quoteRevision.update({ where: { id: rev.id }, data: { validUntil: new Date(Date.now() - 60_000) } });
    expect((await runB2bReminders(ctx.prisma)).quotesExpired).toBe(1);
    expect((await ctx.prisma.quotation.findUnique({ where: { id: q.body.quotationId } })).status).toBe('EXPIRED');
    expect((await buyer.agent.post(`/api/business/quotes/${q.body.quotationId}/accept`).send({})).status).toBe(409);
  });
});

describe('Month and due-date helpers (IST)', () => {
  it('uses Indian calendar months and days', () => {
    const w = monthWindow('2026-11', new Date('2026-11-26T10:00:00Z'));
    expect(w.from.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(w.to.toISOString()).toBe('2026-11-30T18:30:00.000Z');
    // 23:00 IST on the 26th, due 00:30 IST on the 27th: due tomorrow.
    expect(daysLeft(new Date('2026-11-26T19:00:00Z'), new Date('2026-11-26T17:30:00Z'))).toBe(1);
    expect(daysLeft(new Date('2026-11-25T10:00:00Z'), new Date('2026-11-26T10:00:00Z'))).toBe(-1);
  });
});
