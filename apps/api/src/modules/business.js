import express from 'express';
import { z } from 'zod';
import { DomainError } from '../../../../packages/shared/src/index.js';
import { rfqSchema, messageSchema, poCheckoutSchema, uuid } from '../../../../packages/validation/src/index.js';
import { requireBusiness } from '../http/middleware.js';
import { transaction, toPaise } from '../lib/db.js';
import { audit, notify } from '../lib/audit.js';
import { pageParams } from '../lib/http.js';
import * as b2b from '../services/b2b.js';
import { creditSummary } from '../services/b2b-finance.js';
import { processDocument, MAX_DOCUMENT_BYTES } from '../services/media.js';
import { customerOrder, orderDetailInclude } from './orders.js';

const m = toPaise;

const revisionView = (r) => r && ({
  revision: r.revision, terms: r.terms, validUntil: r.validUntil, deliveryDays: r.deliveryDays, paymentTerms: r.paymentTerms,
  shippingPaise: m(r.shippingPaise), subtotalPaise: m(r.subtotalPaise), taxPaise: m(r.taxPaise), totalPaise: m(r.totalPaise), createdAt: r.createdAt,
  items: r.items?.map((i) => ({ rfqItemId: i.rfqItemId, listingId: i.listingId, quantity: i.quantity, unitPaise: m(i.unitPaise), taxRateBps: i.taxRateBps })) ?? [],
});

export const poView = (p) => ({
  id: p.id, number: p.number, status: p.status, paymentTerms: p.paymentTerms, storeId: p.storeId, sellerName: p.store?.name,
  requestedBy: p.requestedBy, approvedBy: p.approvedBy, revision: p.revision, items: p.items, buyer: p.buyerSnapshot,
  subtotalPaise: m(p.subtotalPaise), taxPaise: m(p.taxPaise), shippingPaise: m(p.shippingPaise), totalPaise: m(p.totalPaise),
  createdAt: p.createdAt, history: p.history?.map((h) => ({ status: h.status, note: h.note, at: h.createdAt, actorId: h.actorId })) ?? [],
  order: p.order ? { id: p.order.id, number: p.order.number, status: p.order.status, paymentStatus: p.order.paymentStatus, mine: undefined } : null,
});

export function registerBusiness(app, { prisma, storage, config, payments }) {
  const member = (req) => b2b.requireMembership(prisma, req.user.id, req.organizationId);
  const storesOf = async (ids) => new Map((await prisma.sellerStore.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })).map((s) => [s.id, s]));

  app.get('/api/business/overview', requireBusiness(), async (req, res) => {
    const orgId = req.organizationId;
    const [organization, policy, members, rfqs, pos, orders, pendingApprovals] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId } }),
      prisma.businessApprovalPolicy.findUnique({ where: { organizationId: orgId } }),
      prisma.organizationMember.findMany({ where: { organizationId: orgId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.rfq.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 5, include: { _count: { select: { items: true, requests: true } }, requests: { include: { quotation: { select: { status: true } } } } } }),
      prisma.purchaseOrder.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.order.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 5, include: { items: true } }),
      prisma.purchaseOrder.count({ where: { organizationId: orgId, status: 'PENDING_APPROVAL' } }),
    ]);
    const stores = await storesOf(pos.map((p) => p.storeId));
    const [activeRfqs, quotesWaiting, spend] = await Promise.all([
      prisma.rfq.count({ where: { organizationId: orgId, status: { in: ['OPEN', 'QUOTED'] } } }),
      prisma.quotation.count({ where: { status: 'OPEN', request: { rfq: { organizationId: orgId } } } }),
      prisma.order.aggregate({ where: { organizationId: orgId, status: { not: 'CANCELLED' }, paymentStatus: { in: ['PAID', 'ON_TERMS'] } }, _sum: { totalPaise: true } }),
    ]);
    const credit = await creditSummary(prisma, orgId);
    res.json({
      credit: { creditApproved: credit.creditApproved, terms: credit.terms, limitPaise: credit.limitPaise, outstandingPaise: credit.outstandingPaise, availablePaise: credit.availablePaise, usedPercent: credit.usedPercent, overduePaise: credit.overduePaise, overdueCount: credit.overdueCount, dueSoonPaise: credit.dueSoonPaise, dueSoonCount: credit.dueSoonCount, nextDue: credit.nextDue },
      organization: { ...organization, creditLimitPaise: m(organization.creditLimitPaise), approvalThresholdPaise: m(policy?.thresholdPaise ?? 0) },
      role: req.orgRole,
      metrics: { activeRfqs, quotesWaiting, pendingApprovals, spendPaise: m(spend._sum.totalPaise ?? 0) },
      members: members.map((x) => ({ id: x.user.id, name: x.user.name, email: x.user.email, role: x.role, since: x.createdAt, departmentId: x.departmentId })),
      rfqs: rfqs.map((r) => ({ id: r.id, number: r.number, title: r.title, status: r.status, createdAt: r.createdAt, items: r._count.items, sellers: r._count.requests, quotes: r.requests.filter((q) => q.quotation && q.quotation.status !== 'REQUESTED').length })),
      purchaseOrders: pos.map((p) => poView({ ...p, store: stores.get(p.storeId) })),
      orders: orders.map(customerOrder),
    });
  });

  // ───────────── RFQs ─────────────
  app.post('/api/business/rfqs', requireBusiness('rfq.create', { approved: true }), async (req, res) => {
    const input = rfqSchema.parse(req.body);
    const mem = await member(req);
    const rfq = await transaction(prisma, (tx) => b2b.createRfq(tx, { member: mem, user: req.user, input }));
    res.status(201).json({ rfq: { id: rfq.id, number: rfq.number, sellers: rfq.requests.length } });
  });

  app.post('/api/business/attachments', requireBusiness('rfq.create', { approved: true }), express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], limit: MAX_DOCUMENT_BYTES }), async (req, res) => {
    const name = z.string().trim().min(1).max(120).catch('Attachment').parse(req.get('x-file-name'));
    const file = await processDocument(req.body);
    const stored = await storage.put(file.data, file.mime);
    const asset = await prisma.mediaAsset.create({ data: { ownerType: 'RFQ', uploadedBy: req.user.id, storageKey: stored.key, url: stored.url, mime: file.mime, width: file.width, height: file.height, bytes: file.data.length, originalName: name } });
    res.status(201).json({ attachment: { id: asset.id, name, url: asset.url, mime: asset.mime } });
  });

  app.get('/api/business/rfqs', requireBusiness(), async (req, res) => {
    const paging = pageParams(req.query, { size: 20 });
    const where = { organizationId: req.organizationId, ...(req.query.status ? { status: String(req.query.status) } : {}) };
    const [rows, total] = await Promise.all([
      prisma.rfq.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: { _count: { select: { items: true, requests: true } }, requests: { include: { quotation: { select: { status: true } } } } } }),
      prisma.rfq.count({ where }),
    ]);
    res.json({ rfqs: rows.map((r) => ({ id: r.id, number: r.number, title: r.title, status: r.status, createdAt: r.createdAt, neededBy: r.neededBy, items: r._count.items, sellers: r._count.requests, quotes: r.requests.filter((q) => q.quotation).length })), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });

  app.get('/api/business/rfqs/:id', requireBusiness(), async (req, res) => {
    const rfq = await prisma.rfq.findUnique({
      where: { id: uuid.parse(req.params.id) },
      include: {
        items: true, attachments: true, user: { select: { name: true } },
        requests: { include: { quotation: { include: { revisions: { orderBy: { revision: 'desc' }, include: { items: true } }, acceptance: true } } } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!rfq || rfq.organizationId !== req.organizationId) throw new DomainError('Request not found', 404);
    const stores = await storesOf(rfq.requests.map((r) => r.storeId));
    const attachments = await prisma.mediaAsset.findMany({ where: { id: { in: rfq.attachments.map((a) => a.mediaAssetId) } } });
    const po = await prisma.purchaseOrder.findFirst({ where: { quotationId: { in: rfq.requests.map((r) => r.quotation?.id).filter(Boolean) } } });
    res.json({
      rfq: { id: rfq.id, number: rfq.number, title: rfq.title, status: rfq.status, notes: rfq.notes, deliveryPincode: rfq.deliveryPincode, neededBy: rfq.neededBy, createdAt: rfq.createdAt, requestedBy: rfq.user.name, items: rfq.items },
      attachments: attachments.map((a) => ({ id: a.id, name: a.originalName, url: a.url, mime: a.mime })),
      quotations: rfq.requests.map((r) => ({
        storeId: r.storeId, seller: stores.get(r.storeId),
        quotationId: r.quotation?.id ?? null, status: r.quotation?.status ?? 'REQUESTED',
        current: revisionView(r.quotation?.revisions[0]), revisions: r.quotation?.revisions.map(revisionView) ?? [],
        messages: rfq.messages.filter((msg) => msg.storeId === r.storeId).map((msg) => ({ id: msg.id, side: msg.authorSide, body: msg.body, at: msg.createdAt })),
      })),
      purchaseOrderId: po?.id ?? null,
    });
  });

  app.post('/api/business/rfqs/:id/messages/:storeId', requireBusiness('rfq.create'), async (req, res) => {
    const rfqId = uuid.parse(req.params.id);
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { organizationId: true } });
    if (!rfq || rfq.organizationId !== req.organizationId) throw new DomainError('Request not found', 404);
    const { body } = messageSchema.parse(req.body);
    const message = await transaction(prisma, (tx) => b2b.postMessage(tx, { rfqId, storeId: uuid.parse(req.params.storeId), author: req.user, side: 'BUYER', body }));
    res.status(201).json({ message: { id: message.id, side: message.authorSide, body: message.body, at: message.createdAt } });
  });

  app.post('/api/business/rfqs/:id/cancel', requireBusiness('rfq.create'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await transaction(prisma, async (tx) => {
      const rfq = await tx.rfq.findUnique({ where: { id } });
      if (!rfq || rfq.organizationId !== req.organizationId) throw new DomainError('Request not found', 404);
      if (!['OPEN', 'QUOTED'].includes(rfq.status)) throw new DomainError('This request can no longer be cancelled', 409);
      await tx.rfq.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.quotation.updateMany({ where: { request: { rfqId: id }, status: 'OPEN' }, data: { status: 'WITHDRAWN' } });
      await audit(tx, { actorId: req.user.id, action: 'rfq.cancelled', entityType: 'rfq', entityId: id });
    });
    res.json({ ok: true });
  });

  app.post('/api/business/quotes/:id/accept', requireBusiness('quote.decide', { approved: true }), async (req, res) => {
    const mem = await member(req);
    const po = await transaction(prisma, (tx) => b2b.acceptQuote(tx, { member: mem, user: req.user, quotationId: uuid.parse(req.params.id) }));
    res.json({ purchaseOrder: poView(po) });
  });
  app.post('/api/business/quotes/:id/reject', requireBusiness('quote.decide'), async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body ?? {});
    const mem = await member(req);
    await transaction(prisma, (tx) => b2b.rejectQuote(tx, { member: mem, user: req.user, quotationId: uuid.parse(req.params.id), reason }));
    res.json({ ok: true });
  });

  // ───────────── Purchase orders ─────────────
  app.get('/api/business/purchase-orders', requireBusiness(), async (req, res) => {
    const paging = pageParams(req.query, { size: 20 });
    const where = { organizationId: req.organizationId, ...(req.query.status ? { status: String(req.query.status) } : {}) };
    const [rows, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: { history: { orderBy: { createdAt: 'asc' } }, order: true } }),
      prisma.purchaseOrder.count({ where }),
    ]);
    const stores = await storesOf(rows.map((p) => p.storeId));
    const people = new Map((await prisma.user.findMany({ where: { id: { in: rows.flatMap((p) => [p.requestedBy, p.approvedBy].filter(Boolean)) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    res.json({
      purchaseOrders: rows.map((p) => ({
        ...poView({ ...p, store: stores.get(p.storeId) }),
        requestedByName: people.get(p.requestedBy), approvedByName: p.approvedBy ? people.get(p.approvedBy) : null,
        // Teammates see that an order exists; only its owner sees the order link (address and payment are personal).
        order: p.order ? { id: p.order.userId === req.user.id ? p.order.id : null, number: p.order.number, status: p.order.status, paymentStatus: p.order.paymentStatus } : null,
        canApprove: p.status === 'PENDING_APPROVAL' && ['OWNER', 'APPROVER'].includes(req.orgRole) && (p.requestedBy !== req.user.id || req.orgRole === 'OWNER'),
        canCheckout: p.status === 'CONFIRMED_BY_SELLER' && (p.requestedBy === req.user.id || req.orgRole === 'OWNER'),
      })),
      total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)),
    });
  });

  for (const decision of ['approve', 'reject']) {
    app.post(`/api/business/purchase-orders/:id/${decision}`, requireBusiness('po.approve'), async (req, res) => {
      const { reason } = z.object({ reason: z.string().trim().min(3).max(500).optional() }).parse(req.body ?? {});
      const mem = await member(req);
      const po = await transaction(prisma, (tx) => b2b.decidePurchaseOrder(tx, { member: mem, user: req.user, poId: uuid.parse(req.params.id), decision: decision === 'approve' ? 'APPROVED' : 'REJECTED', note: reason }));
      res.json({ purchaseOrder: poView(po) });
    });
  }

  app.post('/api/business/purchase-orders/:id/checkout', requireBusiness('po.checkout', { approved: true }), async (req, res) => {
    const input = poCheckoutSchema.parse(req.body);
    if (input.paymentMethod === 'ONLINE' && !payments.configured && !config.demoPayments) throw new DomainError('Online payment isn’t available right now. Choose bank transfer.', 503);
    const mem = await member(req);
    // A saved business address can be used instead of typing one; a branch address may carry its own GSTIN.
    let address = input.address;
    let billingGstin = null;
    if (input.addressId) {
      const saved = await prisma.address.findUnique({ where: { id: input.addressId } });
      if (!saved || saved.organizationId !== req.organizationId) throw new DomainError('Choose one of your business addresses', 404);
      address = { name: saved.name, phone: saved.phone, line1: saved.line1, ...(saved.line2 ? { line2: saved.line2 } : {}), city: saved.city, state: saved.state, pincode: saved.pincode };
      billingGstin = saved.gstin ?? null;
    }
    // The order is booked to the buyer's department unless they pick another one.
    let departmentId = input.departmentId === undefined ? mem.departmentId ?? null : input.departmentId;
    if (departmentId) {
      const dept = await prisma.orgDepartment.findUnique({ where: { id: departmentId } });
      if (!dept || dept.organizationId !== req.organizationId) throw new DomainError('Department not found', 404);
    }
    const order = await transaction(prisma, (tx) => b2b.checkoutPurchaseOrder(tx, { member: mem, user: req.user, poId: uuid.parse(req.params.id), address, billingGstin, departmentId, paymentMethod: input.paymentMethod, demo: !payments.configured && config.demoPayments && input.paymentMethod === 'ONLINE' }));
    res.status(201).json({ order: customerOrder(await prisma.order.findUnique({ where: { id: order.id }, include: orderDetailInclude })) });
  });

  // ───────────── Team and settings ─────────────
  app.post('/api/business/members', requireBusiness('team.manage'), async (req, res) => {
    const body = z.object({ email: z.email().toLowerCase(), role: z.enum(['BUYER', 'APPROVER']) }).parse(req.body);
    const added = await transaction(prisma, async (tx) => {
      const u = await tx.user.findUnique({ where: { email: body.email } });
      // Invitations only attach existing accounts, so no identities are created on someone's behalf.
      if (!u) throw new DomainError('Ask your colleague to create an IBazzzar account first, then add them here', 404);
      if (await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: req.organizationId, userId: u.id } } })) throw new DomainError('This person is already on your team', 409);
      await tx.organizationMember.create({ data: { organizationId: req.organizationId, userId: u.id, role: body.role, addedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'organization.member-added', entityType: 'organization', entityId: req.organizationId, metadata: { userId: u.id, role: body.role } });
      await notify(tx, u.id, { title: 'You joined a business account', body: `You were added as ${body.role.toLowerCase()}.`, link: '/business' });
      return u;
    });
    res.status(201).json({ member: { id: added.id, name: added.name, email: added.email, role: body.role } });
  });
  app.patch('/api/business/members/:userId', requireBusiness('team.manage'), async (req, res) => {
    const { role } = z.object({ role: z.enum(['BUYER', 'APPROVER']) }).parse(req.body);
    const userId = uuid.parse(req.params.userId);
    if (userId === req.user.id) throw new DomainError('You can’t change your own role', 409);
    const row = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: req.organizationId, userId } } });
    if (!row || row.role === 'OWNER') throw new DomainError('Member not found', 404);
    await prisma.organizationMember.update({ where: { organizationId_userId: { organizationId: req.organizationId, userId } }, data: { role } });
    await audit(prisma, { actorId: req.user.id, action: 'organization.member-role', entityType: 'organization', entityId: req.organizationId, metadata: { userId, role } });
    res.json({ ok: true });
  });
  app.delete('/api/business/members/:userId', requireBusiness('team.manage'), async (req, res) => {
    const userId = uuid.parse(req.params.userId);
    if (userId === req.user.id) throw new DomainError('The owner can’t be removed', 409);
    const { count } = await prisma.organizationMember.deleteMany({ where: { organizationId: req.organizationId, userId, role: { not: 'OWNER' } } });
    if (!count) throw new DomainError('Member not found', 404);
    await audit(prisma, { actorId: req.user.id, action: 'organization.member-removed', entityType: 'organization', entityId: req.organizationId, metadata: { userId } });
    res.json({ ok: true });
  });
  app.patch('/api/business/settings', requireBusiness('settings.manage'), async (req, res) => {
    const { approvalThresholdPaise } = z.object({ approvalThresholdPaise: z.number().int().min(0).max(1_000_000_000) }).parse(req.body);
    await prisma.businessApprovalPolicy.upsert({ where: { organizationId: req.organizationId }, create: { organizationId: req.organizationId, thresholdPaise: approvalThresholdPaise, updatedBy: req.user.id }, update: { thresholdPaise: approvalThresholdPaise, updatedBy: req.user.id } });
    await audit(prisma, { actorId: req.user.id, action: 'organization.threshold-updated', entityType: 'organization', entityId: req.organizationId, metadata: { approvalThresholdPaise } });
    res.json({ ok: true, approvalThresholdPaise });
  });

  app.get('/api/business/orders', requireBusiness('orders.view'), async (req, res) => {
    const paging = pageParams(req.query, { size: 20 });
    const where = { organizationId: req.organizationId };
    const [rows, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: { items: true, user: { select: { id: true, name: true } } } }),
      prisma.order.count({ where }),
    ]);
    // Organisation history: amounts and status for everyone, but addresses only on your own orders.
    res.json({ orders: rows.map((o) => ({ ...customerOrder(o), address: o.userId === req.user.id ? o.shippingAddress : null, placedBy: o.user.name, mine: o.userId === req.user.id })), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });
}
