// Business buying, part 2: credit and dues, monthly statements, spend by person and department, saved addresses,
// departments, the purchase-order document and "order again" drafts.
import { z } from 'zod';
import { DomainError, gstSplit, stateCode, SERVICE_GST_BPS } from '../../../../packages/shared/src/index.js';
import { businessAddressSchema, departmentSchema, uuid } from '../../../../packages/validation/src/index.js';
import { requireBusiness } from '../http/middleware.js';
import { transaction, toPaise } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { loadListings } from '../services/catalog.js';
import * as finance from '../services/b2b-finance.js';

const m = toPaise;
const monthQuery = (q) => z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-11').optional().parse(q.month || undefined);
const addressView = (a) => ({ id: a.id, label: a.label, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode, gstin: a.gstin, isDefault: a.isDefault });

/**
 * Everything needed to print a purchase order: buyer and supplier with GSTINs, lines with HSN and the GST split,
 * the agreed terms and who requested and approved it. Prices are the frozen, tax-inclusive PO prices.
 */
export async function purchaseOrderDocument(db, po) {
  const [store, people, revision, rfq, org] = await Promise.all([
    db.sellerStore.findUnique({ where: { id: po.storeId }, select: { name: true, legalName: true, gstin: true, pan: true, gstRegistered: true, pickupAddress: true, stateCode: true, contactPhone: true } }),
    db.user.findMany({ where: { id: { in: [po.requestedBy, po.approvedBy].filter(Boolean) } }, select: { id: true, name: true, email: true } }),
    db.quoteRevision.findFirst({ where: { quotationId: po.quotationId, revision: po.revision }, select: { terms: true, deliveryDays: true, validUntil: true } }),
    db.rfq.findFirst({ where: { requests: { some: { quotation: { id: po.quotationId } } } }, select: { number: true, title: true, deliveryPincode: true, neededBy: true } }),
    db.organization.findUnique({ where: { id: po.organizationId }, select: { contactPhone: true } }),
  ]);
  const who = new Map(people.map((p) => [p.id, p]));
  const listings = await loadListings(db, po.items.map((i) => i.listingId));
  const buyerState = po.buyerSnapshot?.address?.state;
  const intra = !!buyerState && stateCode(buyerState) === store?.stateCode;
  const lines = po.items.map((i, n) => {
    const total = i.unitPaise * i.quantity;
    return { n: n + 1, name: i.name, variantLabel: i.variantLabel, sku: i.sku, hsnCode: listings.get(i.listingId)?.hsnCode ?? null, quantity: i.quantity, unitPaise: i.unitPaise, taxRateBps: i.taxRateBps, totalPaise: total, ...gstSplit(total, i.taxRateBps, intra) };
  });
  const shipping = m(po.shippingPaise);
  const shipTax = gstSplit(shipping, SERVICE_GST_BPS, intra);
  const add = (k) => lines.reduce((t, l) => t + l[k], 0) + (shipTax[k] ?? 0);
  const history = await db.purchaseOrderHistory.findMany({ where: { purchaseOrderId: po.id }, orderBy: { createdAt: 'asc' } });
  return {
    id: po.id, number: po.number, status: po.status, date: po.createdAt, paymentTerms: po.paymentTerms, intraState: intra,
    buyer: { ...po.buyerSnapshot, phone: org?.contactPhone ?? null },
    supplier: store && { name: store.legalName, tradeName: store.name, gstin: store.gstin, pan: store.pan, gstRegistered: store.gstRegistered, address: store.pickupAddress, phone: store.contactPhone },
    rfq, terms: revision?.terms ?? '', deliveryDays: revision?.deliveryDays ?? null, quoteValidUntil: revision?.validUntil ?? null,
    requestedBy: who.get(po.requestedBy)?.name ?? null, approvedBy: po.approvedBy ? who.get(po.approvedBy)?.name ?? null : null,
    approvedAt: history.find((h) => h.status === 'APPROVED')?.createdAt ?? null,
    confirmedAt: history.find((h) => h.status === 'CONFIRMED_BY_SELLER')?.createdAt ?? null,
    lines,
    shipping: { totalPaise: shipping, ...shipTax },
    totals: { taxablePaise: add('taxablePaise'), cgstPaise: add('cgstPaise'), sgstPaise: add('sgstPaise'), igstPaise: add('igstPaise'), taxPaise: add('taxPaise'), totalPaise: m(po.totalPaise) },
  };
}

export function registerBusinessFinance(app, { prisma }) {
  // ───────────── Credit and dues ─────────────
  app.get('/api/business/credit', requireBusiness('orders.view'), async (req, res) => {
    res.json({ credit: await finance.creditSummary(prisma, req.organizationId) });
  });

  app.get('/api/business/statement', requireBusiness('orders.view'), async (req, res) => {
    res.json({ statement: await finance.statement(prisma, req.organizationId, { month: monthQuery(req.query) }) });
  });

  app.get('/api/business/spend', requireBusiness('orders.view'), async (req, res) => {
    res.json({ spend: await finance.spend(prisma, req.organizationId, { month: monthQuery(req.query) }) });
  });

  // ───────────── Saved addresses (head office, warehouses, branches) ─────────────
  app.get('/api/business/addresses', requireBusiness(), async (req, res) => {
    const rows = await prisma.address.findMany({ where: { organizationId: req.organizationId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    res.json({ addresses: rows.map(addressView) });
  });

  app.post('/api/business/addresses', requireBusiness('settings.manage'), async (req, res) => {
    const input = businessAddressSchema.parse(req.body);
    const row = await transaction(prisma, async (tx) => {
      if (await tx.address.count({ where: { organizationId: req.organizationId } }) >= 25) throw new DomainError('A business account can save up to 25 addresses', 409);
      const first = !(await tx.address.count({ where: { organizationId: req.organizationId } }));
      if (input.isDefault || first) await tx.address.updateMany({ where: { organizationId: req.organizationId }, data: { isDefault: false } });
      const a = await tx.address.create({ data: { ...input, organizationId: req.organizationId, isDefault: input.isDefault || first } });
      await audit(tx, { actorId: req.user.id, action: 'organization.address-added', entityType: 'organization', entityId: req.organizationId, metadata: { label: a.label } });
      return a;
    });
    res.status(201).json({ address: addressView(row) });
  });

  app.patch('/api/business/addresses/:id', requireBusiness('settings.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = businessAddressSchema.partial().parse(req.body);
    const row = await transaction(prisma, async (tx) => {
      const a = await tx.address.findUnique({ where: { id } });
      if (!a || a.organizationId !== req.organizationId) throw new DomainError('Address not found', 404);
      if (input.isDefault) await tx.address.updateMany({ where: { organizationId: req.organizationId }, data: { isDefault: false } });
      const { isDefault, ...rest } = input;
      const updated = await tx.address.update({ where: { id }, data: { ...rest, ...(isDefault ? { isDefault: true } : {}) } });
      await audit(tx, { actorId: req.user.id, action: 'organization.address-updated', entityType: 'organization', entityId: req.organizationId, metadata: { label: updated.label } });
      return updated;
    });
    res.json({ address: addressView(row) });
  });

  app.delete('/api/business/addresses/:id', requireBusiness('settings.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await transaction(prisma, async (tx) => {
      const a = await tx.address.findUnique({ where: { id } });
      if (!a || a.organizationId !== req.organizationId) throw new DomainError('Address not found', 404);
      await tx.address.delete({ where: { id } });
      if (a.isDefault) {
        const next = await tx.address.findFirst({ where: { organizationId: req.organizationId }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      await audit(tx, { actorId: req.user.id, action: 'organization.address-removed', entityType: 'organization', entityId: req.organizationId, metadata: { label: a.label } });
    });
    res.json({ ok: true });
  });

  // ───────────── Departments ─────────────
  app.get('/api/business/departments', requireBusiness(), async (req, res) => {
    const rows = await prisma.orgDepartment.findMany({ where: { organizationId: req.organizationId }, orderBy: { name: 'asc' }, include: { _count: { select: { members: true } } } });
    const { from, to } = finance.monthWindow(null);
    const [mine, spent] = await Promise.all([
      prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: req.organizationId, userId: req.user.id } }, select: { departmentId: true } }),
      prisma.order.groupBy({ by: ['departmentId'], where: { organizationId: req.organizationId, departmentId: { not: null }, status: { not: 'CANCELLED' }, paymentStatus: { not: 'UNPAID' }, createdAt: { gte: from, lt: to } }, _sum: { totalPaise: true } }),
    ]);
    const spentBy = new Map(spent.map((x) => [x.departmentId, m(x._sum.totalPaise ?? 0)]));
    // spentThisMonthPaise lets the checkout warn before an order takes a department over its budget.
    res.json({ departments: rows.map((d) => ({ id: d.id, name: d.name, monthlyBudgetPaise: m(d.monthlyBudgetPaise), members: d._count.members, spentThisMonthPaise: spentBy.get(d.id) ?? 0 })), myDepartmentId: mine?.departmentId ?? null });
  });

  const uniqueName = (e) => { if (e?.code === 'P2002') throw new DomainError('A department with this name already exists', 409, { name: 'Already used' }); throw e; };
  app.post('/api/business/departments', requireBusiness('team.manage'), async (req, res) => {
    const input = departmentSchema.parse(req.body);
    if (await prisma.orgDepartment.count({ where: { organizationId: req.organizationId } }) >= 50) throw new DomainError('A business account can have up to 50 departments', 409);
    const d = await prisma.orgDepartment.create({ data: { ...input, organizationId: req.organizationId } }).catch(uniqueName);
    await audit(prisma, { actorId: req.user.id, action: 'organization.department-added', entityType: 'organization', entityId: req.organizationId, metadata: input });
    res.status(201).json({ department: { id: d.id, name: d.name, monthlyBudgetPaise: m(d.monthlyBudgetPaise), members: 0 } });
  });

  app.patch('/api/business/departments/:id', requireBusiness('team.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = departmentSchema.partial().parse(req.body);
    const d = await prisma.orgDepartment.findUnique({ where: { id } });
    if (!d || d.organizationId !== req.organizationId) throw new DomainError('Department not found', 404);
    const updated = await prisma.orgDepartment.update({ where: { id }, data: input }).catch(uniqueName);
    await audit(prisma, { actorId: req.user.id, action: 'organization.department-updated', entityType: 'organization', entityId: req.organizationId, metadata: { id, ...input } });
    res.json({ department: { id: updated.id, name: updated.name, monthlyBudgetPaise: m(updated.monthlyBudgetPaise) } });
  });

  app.delete('/api/business/departments/:id', requireBusiness('team.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const d = await prisma.orgDepartment.findUnique({ where: { id } });
    if (!d || d.organizationId !== req.organizationId) throw new DomainError('Department not found', 404);
    // Members and past orders keep working; they simply have no department afterwards.
    await prisma.orgDepartment.delete({ where: { id } });
    await audit(prisma, { actorId: req.user.id, action: 'organization.department-removed', entityType: 'organization', entityId: req.organizationId, metadata: { name: d.name } });
    res.json({ ok: true });
  });

  app.patch('/api/business/members/:userId/department', requireBusiness('team.manage'), async (req, res) => {
    const userId = uuid.parse(req.params.userId);
    const { departmentId } = z.object({ departmentId: uuid.nullable() }).parse(req.body);
    if (departmentId) {
      const d = await prisma.orgDepartment.findUnique({ where: { id: departmentId } });
      if (!d || d.organizationId !== req.organizationId) throw new DomainError('Department not found', 404);
    }
    const { count } = await prisma.organizationMember.updateMany({ where: { organizationId: req.organizationId, userId }, data: { departmentId } });
    if (!count) throw new DomainError('Member not found', 404);
    await audit(prisma, { actorId: req.user.id, action: 'organization.member-department', entityType: 'organization', entityId: req.organizationId, metadata: { userId, departmentId } });
    res.json({ ok: true });
  });

  // ───────────── Purchase-order document ─────────────
  app.get('/api/business/purchase-orders/:id', requireBusiness(), async (req, res) => {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: uuid.parse(req.params.id) } });
    if (!po || po.organizationId !== req.organizationId) throw new DomainError('Purchase order not found', 404);
    res.json({ document: await purchaseOrderDocument(prisma, po) });
  });

  // ───────────── "Order again": drafts for a new request ─────────────
  /** A new RFQ pre-filled from an earlier request (same items, quantities and sellers). */
  app.get('/api/business/rfqs/:id/draft', requireBusiness('rfq.create'), async (req, res) => {
    const rfq = await prisma.rfq.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { items: true, requests: { select: { storeId: true } } } });
    if (!rfq || rfq.organizationId !== req.organizationId) throw new DomainError('Request not found', 404);
    const stores = await prisma.sellerStore.findMany({ where: { id: { in: rfq.requests.map((r) => r.storeId) }, status: 'APPROVED' }, select: { id: true, name: true } });
    res.json({ draft: { title: rfq.title, deliveryPincode: rfq.deliveryPincode, notes: rfq.notes, items: rfq.items.map((i) => ({ catalogProductId: i.catalogProductId, variantId: i.variantId, description: i.description, quantity: i.quantity })), sellers: stores, source: rfq.number } });
  });

  /** A new RFQ to the same seller, pre-filled from a purchase order's lines. */
  app.get('/api/business/purchase-orders/:id/draft', requireBusiness('rfq.create'), async (req, res) => {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: uuid.parse(req.params.id) } });
    if (!po || po.organizationId !== req.organizationId) throw new DomainError('Purchase order not found', 404);
    const [listings, store, rfq] = await Promise.all([
      loadListings(prisma, po.items.map((i) => i.listingId)),
      prisma.sellerStore.findUnique({ where: { id: po.storeId }, select: { id: true, name: true, status: true } }),
      prisma.rfq.findFirst({ where: { requests: { some: { quotation: { id: po.quotationId } } } }, select: { title: true, deliveryPincode: true, notes: true } }),
    ]);
    res.json({ draft: {
      title: rfq?.title ?? `Repeat of ${po.number}`, deliveryPincode: rfq?.deliveryPincode ?? '', notes: rfq?.notes ?? '',
      items: po.items.map((i) => ({ catalogProductId: listings.get(i.listingId)?.catalogProductId ?? null, variantId: listings.get(i.listingId)?.variantId ?? null, description: `${i.name}${i.variantLabel && i.variantLabel !== 'Standard' ? ` (${i.variantLabel})` : ''}`, quantity: i.quantity })),
      sellers: store?.status === 'APPROVED' ? [{ id: store.id, name: store.name }] : [], source: po.number,
    } });
  });
}
