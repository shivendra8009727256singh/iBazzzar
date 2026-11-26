// Business procurement: RFQ → quotations (with revisions and negotiation) → purchase order → approval → seller
// confirmation → order. Prices on the order always come from the frozen PO snapshot, never from the browser.
import { DomainError, gstSplit, stateCode, SERVICE_GST_BPS, orgCan, money } from '../../../../packages/shared/src/index.js';
import { toPaise } from '../lib/db.js';
import { audit, notify, notifyStoreOwners, notifyOrgApprovers } from '../lib/audit.js';
import { nextNumber } from '../lib/sequence.js';
import { loadListings, sellableListingWhere } from './catalog.js';
import { createOrder, creditOutstanding } from './orders.js';
import { assertNoOverdue } from './b2b-finance.js';

export async function requireMembership(db, userId, organizationId, permission) {
  const m = organizationId && await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
  if (!m) throw new DomainError('Choose a business account to continue', 403);
  if (permission && !orgCan(m.role, permission)) throw new DomainError('Your role in this business account doesn’t allow this', 403);
  return m;
}

// ───────────── RFQ ─────────────

export async function createRfq(tx, { member, user, input }) {
  if (member.organization.status !== 'APPROVED') {
    throw new DomainError('Your business account is awaiting verification. You can request quotes once it is approved.', 403);
  }
  // Eligible sellers: those named by the buyer, otherwise every approved seller offering one of the requested products.
  let storeIds = input.storeIds ?? [];
  if (!storeIds.length) {
    const productIds = input.items.map((i) => i.catalogProductId).filter(Boolean);
    if (!productIds.length) throw new DomainError('Pick catalogue products or choose the sellers to ask', 400);
    const offers = await tx.sellerListing.findMany({
      where: { ...sellableListingWhere, wholesaleEnabled: true, variant: { catalogProductId: { in: productIds }, product: { status: 'APPROVED' } } },
      select: { storeId: true }, distinct: ['storeId'],
    });
    storeIds = offers.map((o) => o.storeId);
  }
  const stores = await tx.sellerStore.findMany({ where: { id: { in: storeIds }, status: 'APPROVED' }, select: { id: true } });
  if (!stores.length) throw new DomainError('No approved sellers offer these items for wholesale yet', 409);

  const number = await nextNumber(tx, 'rfq', 'RFQ');
  const rfq = await tx.rfq.create({
    data: {
      number, organizationId: member.organizationId, userId: user.id, title: input.title, deliveryPincode: input.deliveryPincode,
      neededBy: input.neededBy ? new Date(input.neededBy) : null, notes: input.notes,
      items: { create: input.items.map((i) => ({ catalogProductId: i.catalogProductId ?? null, variantId: i.variantId ?? null, description: i.description, quantity: i.quantity })) },
      requests: { create: stores.map((s) => ({ storeId: s.id })) },
    },
    include: { items: true, requests: true },
  });
  for (const id of input.attachmentIds ?? []) {
    const asset = await tx.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.uploadedBy !== user.id || asset.ownerType !== 'RFQ') throw new DomainError('Attach files you uploaded for this request', 403);
    await tx.rfqAttachment.create({ data: { rfqId: rfq.id, mediaAssetId: id, name: asset.originalName ?? 'Attachment' } });
  }
  for (const s of stores) {
    await notifyStoreOwners(tx, s.id, { title: 'New quotation request', body: `${member.organization.tradeName || member.organization.legalName} requested a quote: ${input.title}.`, link: '/seller/rfqs' });
  }
  await audit(tx, { actorId: user.id, action: 'rfq.created', entityType: 'rfq', entityId: rfq.id, metadata: { sellers: stores.length } });
  return rfq;
}

/** Seller submits a quotation or a revised one. Earlier revisions stay on record. */
export async function submitQuote(tx, { storeId, user, rfqId, input }) {
  await tx.$queryRaw`SELECT id FROM rfqs WHERE id = ${rfqId}::uuid FOR UPDATE`;
  const request = await tx.quotationRequest.findUnique({ where: { rfqId_storeId: { rfqId, storeId } }, include: { rfq: { include: { items: true } }, quotation: true } });
  if (!request) throw new DomainError('Quotation request not found', 404);
  const rfq = request.rfq;
  if (!['OPEN', 'QUOTED'].includes(rfq.status)) throw new DomainError('This request is closed', 409);
  if (request.quotation && ['ACCEPTED', 'WITHDRAWN'].includes(request.quotation.status)) throw new DomainError('This quotation can no longer be revised', 409);
  if (Date.parse(input.validUntil) <= Date.now() + 3600_000) throw new DomainError('Quotes must stay valid for at least an hour', 400);

  const listings = await loadListings(tx, input.items.map((i) => i.listingId));
  const lines = input.items.map((i) => {
    const item = rfq.items.find((r) => r.id === i.rfqItemId);
    if (!item) throw new DomainError('Quote each line of this request', 400);
    const l = listings.get(i.listingId);
    if (!l || l.storeId !== storeId || l.status !== 'APPROVED') throw new DomainError('Quote with your own approved listings', 403);
    return { ...i, taxRateBps: l.taxRateBps };
  });
  const subtotal = lines.reduce((s, l) => s + l.unitPaise * l.quantity, 0);
  const tax = lines.reduce((s, l) => s + gstSplit(l.unitPaise * l.quantity, l.taxRateBps, false).taxPaise, 0) + gstSplit(input.shippingPaise, SERVICE_GST_BPS, false).taxPaise;

  const quotation = request.quotation
    ? await tx.quotation.update({ where: { id: request.quotation.id }, data: { status: 'OPEN', currentRevision: { increment: 1 } } })
    : await tx.quotation.create({ data: { requestId: request.id, storeId, status: 'OPEN', currentRevision: 1 } });
  const revision = await tx.quoteRevision.create({
    data: {
      quotationId: quotation.id, revision: quotation.currentRevision, terms: input.terms, validUntil: new Date(input.validUntil),
      deliveryDays: input.deliveryDays, shippingPaise: input.shippingPaise, paymentTerms: input.paymentTerms,
      subtotalPaise: subtotal, taxPaise: tax, totalPaise: subtotal + input.shippingPaise, createdBy: user.id,
      items: { create: lines.map((l) => ({ rfqItemId: l.rfqItemId, listingId: l.listingId, quantity: l.quantity, unitPaise: l.unitPaise, taxRateBps: l.taxRateBps })) },
    },
  });
  await tx.rfq.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });
  await notify(tx, rfq.userId, { title: quotation.currentRevision > 1 ? 'Revised quotation received' : 'Quotation received', body: `A seller quoted ${money(subtotal + input.shippingPaise)} for ${rfq.title}.`, link: `/business/rfqs/${rfq.id}` });
  await audit(tx, { actorId: user.id, action: 'quote.submitted', entityType: 'quotation', entityId: quotation.id, metadata: { revision: revision.revision } });
  return { quotation, revision };
}

export async function postMessage(tx, { rfqId, storeId, author, side, body }) {
  const request = await tx.quotationRequest.findUnique({ where: { rfqId_storeId: { rfqId, storeId } }, include: { rfq: true } });
  if (!request) throw new DomainError('Conversation not found', 404);
  const message = await tx.rfqMessage.create({ data: { rfqId, storeId, authorId: author.id, authorSide: side, body } });
  if (side === 'BUYER') await notifyStoreOwners(tx, storeId, { title: 'Buyer replied', body: request.rfq.title, link: '/seller/rfqs' });
  else await notify(tx, request.rfq.userId, { title: 'Seller replied', body: request.rfq.title, link: `/business/rfqs/${rfqId}` });
  return message;
}

async function lockQuotation(tx, quotationId, organizationId) {
  await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId}::uuid FOR UPDATE`;
  const q = await tx.quotation.findUnique({
    where: { id: quotationId },
    include: { request: { include: { rfq: true } }, revisions: { orderBy: { revision: 'desc' }, take: 1, include: { items: true } }, store: true },
  });
  if (!q || q.request.rfq.organizationId !== organizationId) throw new DomainError('Quotation not found', 404);
  return q;
}

/** Accepting a quote freezes it into a purchase order. Small orders within the policy threshold are auto-approved. */
export async function acceptQuote(tx, { member, user, quotationId }) {
  const q = await lockQuotation(tx, quotationId, member.organizationId);
  const existing = await tx.purchaseOrder.findUnique({ where: { quotationId } });
  if (existing) return existing;
  const rev = q.revisions[0];
  if (q.status !== 'OPEN' || !rev || rev.validUntil <= new Date()) throw new DomainError('This quotation has expired or is no longer open', 409);
  const org = member.organization;
  const policy = await tx.businessApprovalPolicy.findUnique({ where: { organizationId: org.id } });
  const total = toPaise(rev.totalPaise);
  const threshold = toPaise(policy?.thresholdPaise ?? 0);
  const auto = threshold > 0 && total <= threshold;

  const listings = await loadListings(tx, rev.items.map((i) => i.listingId));
  const items = rev.items.map((i) => {
    const l = listings.get(i.listingId);
    return { listingId: i.listingId, rfqItemId: i.rfqItemId, name: l?.name ?? 'Item', variantLabel: l?.variantLabel ?? '', sku: l?.sku ?? '', quantity: i.quantity, unitPaise: toPaise(i.unitPaise), taxRateBps: i.taxRateBps };
  });
  const number = await nextNumber(tx, 'po', 'PO');
  const po = await tx.purchaseOrder.create({
    data: {
      number, organizationId: org.id, quotationId: q.id, revision: rev.revision, storeId: q.storeId, requestedBy: user.id,
      approvedBy: auto ? user.id : null, status: auto ? 'APPROVED' : 'PENDING_APPROVAL', paymentTerms: rev.paymentTerms,
      subtotalPaise: rev.subtotalPaise, taxPaise: rev.taxPaise, shippingPaise: rev.shippingPaise, totalPaise: rev.totalPaise,
      items, buyerSnapshot: { legalName: org.legalName, tradeName: org.tradeName, gstin: org.gstin, address: org.registeredAddress },
      history: { create: [{ status: 'PENDING_APPROVAL', actorId: user.id }, ...(auto ? [{ status: 'APPROVED', note: 'Within the organisation’s auto-approval limit' }] : [])] },
      ...(auto ? {} : { approvals: { create: { requestedBy: user.id } } }),
    },
  });
  await tx.quotation.update({ where: { id: q.id }, data: { status: 'ACCEPTED' } });
  await tx.quoteAcceptance.create({ data: { quotationId: q.id, revision: rev.revision, acceptedBy: user.id } });
  // Other sellers' open quotes on this request are closed so they stop negotiating.
  await tx.quotation.updateMany({ where: { request: { rfqId: q.request.rfqId }, id: { not: q.id }, status: 'OPEN' }, data: { status: 'REJECTED' } });
  await tx.rfq.update({ where: { id: q.request.rfqId }, data: { status: 'ACCEPTED' } });
  await audit(tx, { actorId: user.id, action: 'quote.accepted', entityType: 'quotation', entityId: q.id, metadata: { po: number, auto } });
  if (auto) await notifyStoreOwners(tx, q.storeId, { title: 'Purchase order received', body: `${number} awaits your confirmation.`, link: '/seller/purchase-orders' });
  else await notifyOrgApprovers(tx, org.id, { title: 'Purchase order needs approval', body: `${number} for ${money(total)} is waiting for approval.`, link: '/business/purchase-orders' }, { except: user.id });
  return po;
}

export async function rejectQuote(tx, { member, user, quotationId, reason }) {
  const q = await lockQuotation(tx, quotationId, member.organizationId);
  if (q.status !== 'OPEN') throw new DomainError('This quotation is no longer open', 409);
  await tx.quotation.update({ where: { id: q.id }, data: { status: 'REJECTED' } });
  await notifyStoreOwners(tx, q.storeId, { title: 'Quotation declined', body: reason ? `The buyer declined: ${reason}` : 'The buyer declined your quotation. You can send a revision.', link: '/seller/rfqs' });
  await audit(tx, { actorId: user.id, action: 'quote.rejected', entityType: 'quotation', entityId: q.id, metadata: { reason } });
}

async function lockPo(tx, poId) {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${poId}::uuid FOR UPDATE`;
  return tx.purchaseOrder.findUnique({ where: { id: poId }, include: { organization: true } });
}

/** Approvers decide on pending purchase orders. An approver can't approve their own request; the owner can. */
export async function decidePurchaseOrder(tx, { member, user, poId, decision, note }) {
  if (!orgCan(member.role, 'po.approve')) throw new DomainError('Procurement approval permission required', 403);
  const po = await lockPo(tx, poId);
  if (!po || po.organizationId !== member.organizationId) throw new DomainError('Purchase order not found', 404);
  if (po.status !== 'PENDING_APPROVAL') throw new DomainError('This purchase order isn’t waiting for approval', 409);
  if (decision === 'APPROVED' && po.requestedBy === user.id && member.role !== 'OWNER') throw new DomainError('Another approver must approve your own request', 403);
  if (decision === 'REJECTED' && !note) throw new DomainError('Please give a reason for rejecting', 400);
  const updated = await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: decision, ...(decision === 'APPROVED' ? { approvedBy: user.id } : {}) } });
  await tx.purchaseOrderHistory.create({ data: { purchaseOrderId: po.id, status: decision, actorId: user.id, note: note ?? null } });
  await tx.businessApprovalRequest.updateMany({ where: { purchaseOrderId: po.id, decidedBy: null }, data: { decidedBy: user.id, decision, note: note ?? null, decidedAt: new Date() } });
  if (decision === 'APPROVED') await notifyStoreOwners(tx, po.storeId, { title: 'Purchase order received', body: `${po.number} awaits your confirmation.`, link: '/seller/purchase-orders' });
  await notify(tx, po.requestedBy, { title: `Purchase order ${decision.toLowerCase()}`, body: `${po.number} was ${decision.toLowerCase()}${note ? `: ${note}` : '.'}`, link: '/business/purchase-orders' });
  await audit(tx, { actorId: user.id, action: `purchase-order.${decision.toLowerCase()}`, entityType: 'purchase_order', entityId: po.id, metadata: { note } });
  return updated;
}

export async function sellerConfirmPo(tx, { storeId, user, poId }) {
  const po = await lockPo(tx, poId);
  if (!po || po.storeId !== storeId) throw new DomainError('Purchase order not found', 404);
  if (po.status !== 'APPROVED') throw new DomainError('Only approved purchase orders can be confirmed', 409);
  const updated = await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'CONFIRMED_BY_SELLER' } });
  await tx.purchaseOrderHistory.create({ data: { purchaseOrderId: po.id, status: 'CONFIRMED_BY_SELLER', actorId: user.id } });
  await notify(tx, po.requestedBy, { title: 'Seller confirmed your purchase order', body: `${po.number} is confirmed. You can now place the order.`, link: '/business/purchase-orders' });
  await audit(tx, { actorId: user.id, action: 'purchase-order.seller-confirmed', entityType: 'purchase_order', entityId: po.id });
  return updated;
}

const TERM_DAYS = { PREPAID: 0, NET_15: 15, NET_30: 30, NET_45: 45 };

/** Turns a seller-confirmed PO into an order at the negotiated prices. Idempotent per PO. */
export async function checkoutPurchaseOrder(tx, { member, user, poId, address, billingGstin = null, departmentId = null, paymentMethod, demo }) {
  if (!orgCan(member.role, 'po.checkout')) throw new DomainError('Your role can’t place orders', 403);
  const po = await lockPo(tx, poId);
  if (!po || po.organizationId !== member.organizationId) throw new DomainError('Purchase order not found', 404);
  if (po.requestedBy !== user.id && member.role !== 'OWNER') throw new DomainError('Only the requester or the account owner can place this order', 403);
  const existing = await tx.order.findUnique({ where: { purchaseOrderId: po.id } });
  if (existing) {
    if (existing.userId !== user.id) throw new DomainError('A teammate has already placed this order', 409);
    return existing;
  }
  if (po.status !== 'CONFIRMED_BY_SELLER') throw new DomainError('The purchase order must be approved and confirmed by the seller first', 409);
  if (paymentMethod === 'CREDIT_TERMS') {
    if (po.paymentTerms === 'PREPAID') throw new DomainError('This quotation was agreed as prepaid', 409);
    if (!po.organization.creditApproved || TERM_DAYS[po.organization.allowedTerms] < TERM_DAYS[po.paymentTerms]) {
      throw new DomainError('Your business account isn’t approved for these payment terms. Pay online or by bank transfer.', 403);
    }
    await assertNoOverdue(tx, po.organizationId);
    // Credit is capped: unpaid credit-terms orders plus this one must stay within the limit finance set.
    const limit = toPaise(po.organization.creditLimitPaise);
    const outstanding = await creditOutstanding(tx, po.organizationId);
    if (outstanding + toPaise(po.totalPaise) > limit) {
      throw new DomainError(`This order would exceed your credit limit of ${money(limit)} (${money(outstanding)} already outstanding). Pay online or by bank transfer.`, 409);
    }
  }

  const items = po.items;
  const listings = await loadListings(tx, items.map((i) => i.listingId));
  const pos = stateCode(address.state);
  const store = await tx.sellerStore.findUnique({ where: { id: po.storeId } });
  if (store.status !== 'APPROVED') throw new DomainError('This seller isn’t currently active', 409);
  const intra = pos === store.stateCode;
  const lines = items.map((i) => {
    const l = listings.get(i.listingId);
    if (!l || l.storeId !== po.storeId || l.status !== 'APPROVED') throw new DomainError(`${i.name} is no longer available from this seller`, 409);
    if (!Number.isSafeInteger(i.unitPaise * i.quantity)) throw new DomainError('Purchase order pricing is inconsistent. Contact support.', 409);
    const total = i.unitPaise * i.quantity;
    return {
      listingId: i.listingId, quantity: i.quantity, unitPaise: i.unitPaise, lineTotalPaise: total, discountPaise: 0, totalPaise: total,
      mrpPaise: l.mrpPaise, name: l.name, variantLabel: l.variantLabel, sku: l.sku, image: l.image, hsnCode: l.hsnCode,
      catalogProductId: l.catalogProductId, storeId: l.storeId, taxRateBps: i.taxRateBps, ...gstSplit(total, i.taxRateBps, intra),
    };
  });
  const goods = lines.reduce((s, l) => s + l.totalPaise, 0);
  const shipping = toPaise(po.shippingPaise);
  if (goods + shipping !== toPaise(po.totalPaise)) throw new DomainError('Purchase order pricing is inconsistent. Contact support.', 409);
  const shippingTax = gstSplit(shipping, SERVICE_GST_BPS, intra);
  const tax = lines.reduce((s, l) => s + l.taxPaise, 0) + shippingTax.taxPaise;
  const q = {
    mode: 'BUSINESS', lines, coupon: null, subtotalPaise: goods, discountPaise: 0, shippingPaise: shipping, codFeePaise: 0,
    taxPaise: tax, totalPaise: goods + shipping, serviceable: true, payment: { cod: { available: false } },
    creditDays: TERM_DAYS[po.paymentTerms],
    groups: [{ storeId: po.storeId, shippingPaise: shipping, taxPaise: tax, totalPaise: goods + shipping, estimate: null }],
  };
  const order = await createOrder(tx, {
    user, organizationId: po.organizationId, purchaseOrderId: po.id, q, address,
    billingGstin: billingGstin ?? po.organization.gstin, departmentId, paymentMethod, demo,
  });
  await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'ORDERED' } });
  await tx.purchaseOrderHistory.create({ data: { purchaseOrderId: po.id, status: 'ORDERED', actorId: user.id, note: `Order ${order.number}` } });
  await audit(tx, { actorId: user.id, action: 'purchase-order.ordered', entityType: 'purchase_order', entityId: po.id, metadata: { order: order.number } });
  return order;
}
