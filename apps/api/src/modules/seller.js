import express from 'express';
import { z } from 'zod';
import { DomainError, assertStateCode } from '../../../../packages/shared/src/index.js';
import {
  productCreateSchema, variantCreateSchema, offerCreateSchema, listingUpdateSchema, productContentUpdateSchema, stockAdjustSchema,
  shipmentSchema, trackingUpdateSchema, payoutAccountSchema, quoteSchema, messageSchema, decisionSchema, postalAddressSchema, uuid,
} from '../../../../packages/validation/src/index.js';
import { requireSeller } from '../http/middleware.js';
import { transaction, toPaise } from '../lib/db.js';
import { audit, notify } from '../lib/audit.js';
import { encrypt } from '../lib/security.js';
import { pageParams, ilike } from '../lib/http.js';
import { processImage, MAX_IMAGE_BYTES } from '../services/media.js';
import { loadListingsWhere } from '../services/catalog.js';
import * as products from '../services/products.js';
import * as orders from '../services/orders.js';
import * as inventory from '../services/inventory.js';
import * as b2b from '../services/b2b.js';
import { shipmentFlow } from '../integrations/shipping.js';
import { getSetting } from '../services/settings.js';
import { poView } from './business.js';
import { invoiceData, orderDetailInclude } from './orders.js';

const m = toPaise;

const sellerListingView = (l) => ({
  id: l.id, sku: l.sku, status: l.status, catalogProductId: l.catalogProductId, productSlug: l.productSlug, slug: l.variantSlug,
  name: l.name, brand: l.brand, category: l.category, variantId: l.variantId, variantLabel: l.variantLabel, image: l.image, images: l.images,
  pricePaise: l.pricePaise, mrpPaise: l.mrpPaise, effectivePaise: l.effectivePaise, promotion: l.promotion, moq: l.moq,
  bulkPackUnits: l.bulkPackUnits, wholesaleEnabled: l.wholesaleEnabled, codAllowed: l.codAllowed, returnable: l.returnable,
  tiers: l.tiers, stock: l.stock, onHand: l.onHand, reserved: l.reserved, taxRateBps: l.taxRateBps, hsnCode: l.hsnCode, demo: l.demo,
});

/** A seller's view of their parcel: their own lines only; the delivery address only once the order is confirmed. */
function parcelView(so) {
  const confirmed = !['AWAITING_PAYMENT', 'CANCELLED'].includes(so.order.status) || so.status !== 'PENDING';
  return {
    id: so.id, orderId: so.orderId, orderNumber: so.order.number, status: so.status, orderStatus: so.order.status,
    paymentMethod: so.order.paymentMethod, paymentStatus: so.order.paymentStatus, mode: so.order.mode, createdAt: so.createdAt,
    subtotalPaise: m(so.subtotalPaise), shippingPaise: m(so.shippingPaise), taxPaise: m(so.taxPaise), totalPaise: m(so.totalPaise),
    collectOnDeliveryPaise: so.order.paymentMethod === 'COD' ? m(so.totalPaise) : 0,
    estimatedDeliveryAt: so.estimatedDeliveryAt, invoiceNumber: so.invoice?.number ?? null,
    address: confirmed ? so.order.shippingAddress : null, billingGstin: so.order.billingGstin,
    items: so.items.map((i) => ({ id: i.id, listingId: i.listingId, name: i.name, variantLabel: i.variantLabel, sku: i.sku, image: i.image, quantity: i.quantity, unitPaise: m(i.unitPaise), totalPaise: m(i.totalPaise), taxRateBps: i.taxRateBps })),
    shipments: (so.shipments ?? []).map((s) => ({ id: s.id, provider: s.provider, carrier: s.carrier, trackingRef: s.trackingRef, status: s.status, events: s.events?.map((e) => ({ status: e.status, location: e.location, note: e.note, at: e.occurredAt })) ?? [] })),
  };
}
const parcelInclude = { order: true, items: true, invoice: true, shipments: { include: { events: { orderBy: { occurredAt: 'asc' } } } } };

export function registerSeller(app, { prisma, storage, shipping, config }) {
  const seller = requireSeller();
  const owner = requireSeller({ owner: true });

  // ───────────── Dashboard ─────────────
  app.get('/api/seller/overview', requireSeller({ approved: false }), async (req, res) => {
    const storeId = req.storeId;
    const store = await prisma.sellerStore.findUnique({ where: { id: storeId }, include: { primaryCategory: true, payoutAccount: true } });
    if (store.status !== 'APPROVED') return res.json({ store: storeView(store, req.sellerRole), pending: true });
    const since = new Date(Date.now() - 30 * 86_400_000);
    const platform = await getSetting(prisma, 'platform');
    const [toPack, toShip, returns, rfqs, posToConfirm, lowStock, sales, daily, top, ratingRow, balance] = await Promise.all([
      prisma.sellerOrder.count({ where: { storeId, status: 'PENDING', order: { status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } } } }),
      prisma.sellerOrder.count({ where: { storeId, status: 'PACKED' } }),
      prisma.returnRequest.count({ where: { status: { in: ['REQUESTED', 'APPROVED'] }, sellerOrder: { storeId } } }),
      prisma.quotationRequest.count({ where: { storeId, rfq: { status: { in: ['OPEN', 'QUOTED'] } }, quotation: null } }),
      prisma.purchaseOrder.count({ where: { storeId, status: 'APPROVED' } }),
      prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM seller_listings l JOIN inventory_balances b ON b."listingId" = l.id WHERE l."storeId" = ${storeId}::uuid AND l.status = 'APPROVED' AND b."onHand" - b.reserved <= ${platform.lowStockThreshold}`,
      prisma.sellerOrder.aggregate({ where: { storeId, createdAt: { gte: since }, status: { not: 'CANCELLED' }, order: { status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } } }, _sum: { totalPaise: true }, _count: { _all: true } }),
      prisma.$queryRaw`SELECT to_char(date_trunc('day', so."createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders, COALESCE(SUM(so."totalPaise"), 0)::bigint AS revenue
        FROM seller_orders so JOIN orders o ON o.id = so."orderId"
        WHERE so."storeId" = ${storeId}::uuid AND so."createdAt" >= ${since} AND so.status <> 'CANCELLED' AND o.status NOT IN ('AWAITING_PAYMENT', 'CANCELLED')
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw`SELECT oi.name, SUM(oi.quantity)::int AS units, SUM(oi."totalPaise")::bigint AS revenue FROM order_items oi
        JOIN seller_orders so ON so.id = oi."sellerOrderId" JOIN orders o ON o.id = oi."orderId"
        WHERE so."storeId" = ${storeId}::uuid AND oi."orderId" IS NOT NULL AND o.status NOT IN ('AWAITING_PAYMENT', 'CANCELLED') AND so."createdAt" >= ${since}
        GROUP BY oi.name ORDER BY units DESC LIMIT 5`,
      prisma.$queryRaw`SELECT AVG(r.rating)::float AS average, COUNT(*)::int AS count FROM reviews r JOIN order_items oi ON oi.id = r."orderItemId" JOIN seller_orders so ON so.id = oi."sellerOrderId" WHERE so."storeId" = ${storeId}::uuid`,
      prisma.settlementEntry.aggregate({ where: { storeId }, _sum: { amountPaise: true } }),
    ]);
    const days = [...Array(30)].map((_, i) => {
      const day = new Date(Date.now() + 5.5 * 3600_000 - (29 - i) * 86_400_000).toISOString().slice(0, 10);
      const row = daily.find((d) => d.day === day);
      return { date: day, orders: row?.orders ?? 0, revenuePaise: Number(row?.revenue ?? 0) };
    });
    res.json({
      store: storeView(store, req.sellerRole),
      queues: { toPack, toShip, returns, rfqs, posToConfirm, lowStock: lowStock[0].n },
      metrics: { revenue30dPaise: m(sales._sum.totalPaise ?? 0), orders30d: sales._count._all, rating: ratingRow[0].count ? { average: Math.round(ratingRow[0].average * 10) / 10, count: ratingRow[0].count } : null, payablePaise: req.sellerRole === 'OWNER' ? m(balance._sum.amountPaise ?? 0) : null },
      series: days,
      topProducts: top.map((t) => ({ name: t.name, units: t.units, revenuePaise: Number(t.revenue) })),
    });
  });

  function storeView(s, role) {
    return {
      id: s.id, slug: s.slug, name: s.name, description: s.description, status: s.status, legalName: s.legalName, businessType: s.businessType,
      gstRegistered: s.gstRegistered, gstin: s.gstin, pan: s.pan, contactPhone: s.contactPhone, pickupAddress: s.pickupAddress,
      primaryCategory: s.primaryCategory?.name ?? null, codEnabled: s.codEnabled, handlingDays: s.handlingDays, role,
      payoutAccount: s.payoutAccount && role === 'OWNER' ? { accountHolder: s.payoutAccount.accountHolder, accountLast4: s.payoutAccount.accountLast4, ifsc: s.payoutAccount.ifsc, bankName: s.payoutAccount.bankName, verified: s.payoutAccount.verified } : null,
    };
  }

  app.patch('/api/seller/store', owner, async (req, res) => {
    const input = z.object({
      description: z.string().trim().min(20).max(1000), contactPhone: z.string().regex(/^[6-9]\d{9}$/), codEnabled: z.boolean(),
      handlingDays: z.number().int().min(0).max(10), pickupAddress: postalAddressSchema,
    }).partial().parse(req.body);
    const store = await transaction(prisma, async (tx) => {
      const data = { ...input };
      if (input.pickupAddress) {
        data.stateCode = assertStateCode(input.pickupAddress.state);
        await tx.warehouse.updateMany({ where: { storeId: req.storeId, isDefault: true }, data: { address: input.pickupAddress, pincode: input.pickupAddress.pincode } });
      }
      const s = await tx.sellerStore.update({ where: { id: req.storeId }, data, include: { primaryCategory: true, payoutAccount: true } });
      await audit(tx, { actorId: req.user.id, action: 'store.updated', entityType: 'store', entityId: req.storeId, metadata: { fields: Object.keys(input) } });
      return s;
    });
    res.json({ store: storeView(store, req.sellerRole) });
  });

  app.put('/api/seller/payout-account', owner, async (req, res) => {
    const input = payoutAccountSchema.parse(req.body);
    const data = { accountHolder: input.accountHolder, accountNumberEnc: encrypt(input.accountNumber, config.encryptionKey), accountLast4: input.accountNumber.slice(-4), ifsc: input.ifsc, bankName: input.bankName ?? null, verified: false };
    await prisma.sellerPayoutAccount.upsert({ where: { storeId: req.storeId }, create: { storeId: req.storeId, ...data }, update: data });
    await audit(prisma, { actorId: req.user.id, action: 'store.payout-account-updated', entityType: 'store', entityId: req.storeId, metadata: { last4: data.accountLast4 } });
    res.json({ payoutAccount: { accountHolder: data.accountHolder, accountLast4: data.accountLast4, ifsc: data.ifsc, bankName: data.bankName, verified: false } });
  });

  // ───────────── Media ─────────────
  app.post('/api/seller/media', seller, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_IMAGE_BYTES }), async (req, res) => {
    if (await prisma.mediaAsset.count({ where: { storeId: req.storeId } }) >= 1000) throw new DomainError('Your media library is full (1,000 images). Remove unused photos first.', 409);
    const image = await processImage(req.body);
    const stored = await storage.put(image.data, image.mime);
    const asset = await prisma.mediaAsset.create({ data: { ownerType: 'SELLER', storeId: req.storeId, uploadedBy: req.user.id, storageKey: stored.key, url: stored.url, mime: image.mime, width: image.width, height: image.height, bytes: image.data.length } });
    await audit(prisma, { actorId: req.user.id, action: 'media.uploaded', entityType: 'media', entityId: asset.id });
    res.status(201).json({ media: { id: asset.id, url: asset.url, width: asset.width, height: asset.height } });
  });
  app.get('/api/seller/media', seller, async (req, res) => {
    const media = await prisma.mediaAsset.findMany({ where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ media: media.map((a) => ({ id: a.id, url: a.url, width: a.width, height: a.height, createdAt: a.createdAt })) });
  });

  // ───────────── Products ─────────────
  app.get('/api/seller/products', seller, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const where = {
      storeId: req.storeId,
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(q ? { OR: [{ sku: ilike(q) }, { variant: { product: { name: ilike(q) } } }] } : {}),
    };
    const listings = await loadListingsWhere(prisma, where);
    listings.sort((a, b) => a.name.localeCompare(b.name) || a.variantLabel.localeCompare(b.variantLabel));
    const moderation = await prisma.sellerListing.findMany({ where: { id: { in: listings.map((l) => l.id) } }, select: { id: true, moderationNote: true, variant: { select: { product: { select: { status: true, createdByStoreId: true } } } } } });
    const notes = new Map(moderation.map((x) => [x.id, x]));
    res.json({
      listings: listings.map((l) => ({ ...sellerListingView(l), moderationNote: notes.get(l.id)?.moderationNote ?? null, productStatus: notes.get(l.id)?.variant.product.status, ownsProduct: notes.get(l.id)?.variant.product.createdByStoreId === req.storeId })),
      lowStockThreshold: (await getSetting(prisma, 'platform')).lowStockThreshold,
    });
  });

  app.post('/api/seller/products', seller, async (req, res) => {
    const input = productCreateSchema.parse(req.body);
    const out = await transaction(prisma, (tx) => products.createProduct(tx, { storeId: req.storeId, actorId: req.user.id, input }));
    res.status(201).json({ productId: out.product.id, listingId: out.listing.id, status: 'PENDING' });
  });
  app.post('/api/seller/variants', seller, async (req, res) => {
    const input = variantCreateSchema.parse(req.body);
    const out = await transaction(prisma, (tx) => products.createVariant(tx, { storeId: req.storeId, actorId: req.user.id, input }));
    res.status(201).json({ variantId: out.variant.id, listingId: out.listing.id, status: 'PENDING' });
  });
  app.post('/api/seller/offers', seller, async (req, res) => {
    const input = offerCreateSchema.parse(req.body);
    const listing = await transaction(prisma, (tx) => products.createOffer(tx, { storeId: req.storeId, actorId: req.user.id, input }));
    res.status(201).json({ listingId: listing.id, status: listing.status });
  });
  app.patch('/api/seller/listings/:id', seller, async (req, res) => {
    const input = listingUpdateSchema.parse(req.body);
    await transaction(prisma, (tx) => products.updateListing(tx, { storeId: req.storeId, actorId: req.user.id, listingId: uuid.parse(req.params.id), input }));
    const [listing] = await loadListingsWhere(prisma, { id: req.params.id });
    res.json({ listing: sellerListingView(listing) });
  });
  app.patch('/api/seller/products/:id', seller, async (req, res) => {
    const input = productContentUpdateSchema.parse(req.body);
    await transaction(prisma, (tx) => products.updateContent(tx, { storeId: req.storeId, actorId: req.user.id, productId: uuid.parse(req.params.id), input }));
    res.json({ ok: true, status: 'PENDING' });
  });
  app.post('/api/seller/listings/:id/stock', seller, async (req, res) => {
    const input = stockAdjustSchema.parse(req.body);
    const id = uuid.parse(req.params.id);
    const out = await transaction(prisma, async (tx) => {
      const l = await tx.sellerListing.findUnique({ where: { id }, select: { storeId: true } });
      if (!l || l.storeId !== req.storeId) throw new DomainError('Listing not found', 404);
      return inventory.adjust(tx, id, input.delta, input.reason, req.user.id, input.note);
    });
    res.json({ stock: { onHand: out.onHand, reserved: out.reserved, available: out.onHand - out.reserved } });
  });
  app.get('/api/seller/listings/:id/movements', seller, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const l = await prisma.sellerListing.findUnique({ where: { id }, select: { storeId: true } });
    if (!l || l.storeId !== req.storeId) throw new DomainError('Listing not found', 404);
    res.json({ movements: await prisma.stockMovement.findMany({ where: { listingId: id }, orderBy: { createdAt: 'desc' }, take: 100 }) });
  });
  // Catalogue lookup so a seller can offer an existing product instead of creating a duplicate page.
  app.get('/api/seller/catalog-search', seller, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ variants: [] });
    const variants = await prisma.productVariant.findMany({
      where: { product: { status: 'APPROVED', OR: [{ name: ilike(q) }, { brand: { name: ilike(q) } }] } },
      include: { product: { include: { brand: true, media: { take: 1, orderBy: { sortOrder: 'asc' } } } }, listings: { where: { storeId: req.storeId }, select: { id: true } } },
      take: 20,
    });
    res.json({ variants: variants.map((v) => ({ id: v.id, label: v.label, productName: v.product.name, brand: v.product.brand.name, image: v.product.media[0]?.url ?? null, alreadyListed: v.listings.length > 0 })) });
  });

  // ───────────── Orders and fulfilment ─────────────
  app.get('/api/seller/orders', seller, async (req, res) => {
    const paging = pageParams(req.query, { size: 20 });
    const status = req.query.status ? String(req.query.status) : null;
    const where = { storeId: req.storeId, order: { status: { notIn: ['AWAITING_PAYMENT'] } }, ...(status ? { status } : {}) };
    const [rows, total] = await Promise.all([
      prisma.sellerOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: parcelInclude }),
      prisma.sellerOrder.count({ where }),
    ]);
    res.json({ orders: rows.map(parcelView), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });
  app.get('/api/seller/orders/:id', seller, async (req, res) => {
    const so = await prisma.sellerOrder.findUnique({ where: { id: uuid.parse(req.params.id) }, include: parcelInclude });
    if (!so || so.storeId !== req.storeId || so.order.status === 'AWAITING_PAYMENT') throw new DomainError('Order not found', 404);
    res.json({ order: parcelView(so) });
  });

  const fulfil = (fn) => async (req, res) => {
    const id = uuid.parse(req.params.id);
    await transaction(prisma, (tx) => fn(tx, id, req));
    const so = await prisma.sellerOrder.findUnique({ where: { id }, include: parcelInclude });
    res.json({ order: parcelView(so) });
  };
  app.post('/api/seller/orders/:id/pack', seller, fulfil((tx, id, req) => orders.markPacked(tx, id, { storeId: req.storeId, actorId: req.user.id })));
  app.post('/api/seller/orders/:id/ship', seller, fulfil(async (tx, id, req) => {
    const input = shipmentSchema.parse(req.body);
    const booking = await shipping.createShipment(input);
    return orders.ship(tx, id, { storeId: req.storeId, actorId: req.user.id, booking });
  }));
  app.post('/api/seller/orders/:id/cancel', seller, fulfil((tx, id, req) => {
    const { reason } = z.object({ reason: z.string().trim().min(5, 'Please tell the customer why (at least 5 characters)').max(300) }).parse(req.body);
    return orders.sellerCancel(tx, id, { storeId: req.storeId, actorId: req.user.id, reason });
  }));
  app.post('/api/seller/shipments/:id/events', seller, async (req, res) => {
    const input = trackingUpdateSchema.parse(req.body);
    const shipment = await transaction(prisma, (tx) => orders.addTrackingEvent(tx, uuid.parse(req.params.id), { storeId: req.storeId, actorId: req.user.id, ...input, source: 'SELLER', flow: shipmentFlow }));
    res.json({ shipment });
  });
  app.get('/api/seller/orders/:id/invoice', seller, async (req, res) => {
    const so = await prisma.sellerOrder.findUnique({ where: { id: uuid.parse(req.params.id) }, select: { storeId: true, orderId: true } });
    if (!so || so.storeId !== req.storeId) throw new DomainError('Order not found', 404);
    const order = await prisma.order.findUnique({ where: { id: so.orderId }, include: orderDetailInclude });
    res.json({ invoice: await invoiceData(prisma, order, req.params.id) });
  });

  // ───────────── Returns ─────────────
  app.get('/api/seller/returns', seller, async (req, res) => {
    const rows = await prisma.returnRequest.findMany({
      where: { sellerOrder: { storeId: req.storeId }, ...(req.query.status ? { status: String(req.query.status) } : {}) },
      orderBy: { createdAt: 'desc' }, take: 100,
      include: { order: { select: { number: true, paymentMethod: true } }, items: { include: { orderItem: { select: { name: true, image: true, variantLabel: true } } } } },
    });
    res.json({ returns: rows.map((r) => ({ id: r.id, orderId: r.orderId, orderNumber: r.order.number, parcelId: r.sellerOrderId, status: r.status, reason: r.reason, note: r.note, refundPaise: m(r.refundPaise), createdAt: r.createdAt, items: r.items.map((i) => ({ name: i.orderItem.name, variantLabel: i.orderItem.variantLabel, image: i.orderItem.image, quantity: i.quantity })) })) });
  });
  app.post('/api/seller/returns/:id/decision', seller, async (req, res) => {
    const input = decisionSchema.parse(req.body);
    if (input.decision === 'REJECTED' && !input.note) throw new DomainError('Please tell the customer why the return was declined', 400, { note: 'Please give a reason' });
    await transaction(prisma, (tx) => orders.decideReturn(tx, uuid.parse(req.params.id), { storeId: req.storeId, actorId: req.user.id, ...input }));
    res.json({ ok: true });
  });
  app.post('/api/seller/returns/:id/receive', seller, async (req, res) => {
    const { restock } = z.object({ restock: z.boolean().default(true) }).parse(req.body ?? {});
    await transaction(prisma, (tx) => orders.receiveReturn(tx, uuid.parse(req.params.id), { storeId: req.storeId, actorId: req.user.id, restockItems: restock }));
    res.json({ ok: true });
  });

  // ───────────── B2B ─────────────
  app.get('/api/seller/rfqs', seller, async (req, res) => {
    const rows = await prisma.quotationRequest.findMany({
      where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: {
        rfq: { include: { items: true, organization: { select: { legalName: true, tradeName: true, gstin: true } }, messages: { where: { storeId: req.storeId }, orderBy: { createdAt: 'asc' } }, attachments: true } },
        quotation: { include: { revisions: { orderBy: { revision: 'desc' }, include: { items: true } } } },
      },
    });
    const assets = new Map((await prisma.mediaAsset.findMany({ where: { id: { in: rows.flatMap((r) => r.rfq.attachments.map((a) => a.mediaAssetId)) } } })).map((a) => [a.id, a]));
    res.json({
      requests: rows.map((r) => ({
        rfqId: r.rfqId, number: r.rfq.number, title: r.rfq.title, status: r.rfq.status, notes: r.rfq.notes, deliveryPincode: r.rfq.deliveryPincode, neededBy: r.rfq.neededBy, createdAt: r.createdAt,
        buyer: r.rfq.organization.tradeName || r.rfq.organization.legalName, buyerGstin: r.rfq.organization.gstin,
        items: r.rfq.items, attachments: r.rfq.attachments.map((a) => ({ name: a.name, url: assets.get(a.mediaAssetId)?.url })),
        quotation: r.quotation ? { id: r.quotation.id, status: r.quotation.status, revisions: r.quotation.revisions.map((v) => ({ revision: v.revision, totalPaise: m(v.totalPaise), validUntil: v.validUntil, paymentTerms: v.paymentTerms, deliveryDays: v.deliveryDays, terms: v.terms, createdAt: v.createdAt, items: v.items.map((i) => ({ rfqItemId: i.rfqItemId, listingId: i.listingId, quantity: i.quantity, unitPaise: m(i.unitPaise) })) })) } : null,
        messages: r.rfq.messages.map((msg) => ({ id: msg.id, side: msg.authorSide, body: msg.body, at: msg.createdAt })),
      })),
    });
  });
  app.post('/api/seller/rfqs/:id/quotes', seller, async (req, res) => {
    const input = quoteSchema.parse(req.body);
    const out = await transaction(prisma, (tx) => b2b.submitQuote(tx, { storeId: req.storeId, user: req.user, rfqId: uuid.parse(req.params.id), input }));
    res.status(201).json({ quotationId: out.quotation.id, revision: out.revision.revision });
  });
  app.post('/api/seller/rfqs/:id/messages', seller, async (req, res) => {
    const { body } = messageSchema.parse(req.body);
    const msg = await transaction(prisma, (tx) => b2b.postMessage(tx, { rfqId: uuid.parse(req.params.id), storeId: req.storeId, author: req.user, side: 'SELLER', body }));
    res.status(201).json({ message: { id: msg.id, side: msg.authorSide, body: msg.body, at: msg.createdAt } });
  });
  app.get('/api/seller/purchase-orders', seller, async (req, res) => {
    const rows = await prisma.purchaseOrder.findMany({ where: { storeId: req.storeId, status: { not: 'PENDING_APPROVAL' } }, orderBy: { createdAt: 'desc' }, take: 100, include: { history: { orderBy: { createdAt: 'asc' } }, order: true } });
    res.json({ purchaseOrders: rows.map((p) => ({ ...poView(p), order: p.order ? { number: p.order.number, status: p.order.status } : null })) });
  });
  app.post('/api/seller/purchase-orders/:id/confirm', seller, async (req, res) => {
    const po = await transaction(prisma, (tx) => b2b.sellerConfirmPo(tx, { storeId: req.storeId, user: req.user, poId: uuid.parse(req.params.id) }));
    res.json({ purchaseOrder: poView(po) });
  });

  // ───────────── Money ─────────────
  app.get('/api/seller/settlements', owner, async (req, res) => {
    const paging = pageParams(req.query, { size: 50, max: 200 });
    const [entries, total, sums, payouts, settings] = await Promise.all([
      prisma.settlementEntry.findMany({ where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take }),
      prisma.settlementEntry.count({ where: { storeId: req.storeId } }),
      prisma.settlementEntry.groupBy({ by: ['kind'], where: { storeId: req.storeId }, _sum: { amountPaise: true } }),
      prisma.payoutRecord.findMany({ where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      getSetting(prisma, 'commission'),
    ]);
    const real = (k) => m(sums.find((s) => s.kind === k)?._sum.amountPaise ?? 0);
    res.json({
      summary: {
        salesPaise: real('SALE'), shippingPaise: real('SHIPPING_FEE'), commissionPaise: -(real('COMMISSION') + real('COMMISSION_REVERSAL')),
        refundsPaise: -real('REFUND_ADJUSTMENT'), paidOutPaise: -real('PAYOUT'),
        payablePaise: sums.reduce((t, s) => t + m(s._sum.amountPaise ?? 0), 0),
        commissionRateBps: settings.rateBps,
      },
      entries: entries.map((e) => ({ id: e.id, kind: e.kind, amountPaise: m(e.amountPaise), status: e.status, note: e.note, demo: e.demo, orderId: e.orderId, createdAt: e.createdAt })),
      payouts: payouts.map((p) => ({ id: p.id, amountPaise: m(p.amountPaise), providerRef: p.providerRef, createdAt: p.createdAt })),
      total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)),
    });
  });

  app.get('/api/seller/reviews', seller, async (req, res) => {
    const rows = await prisma.$queryRaw`SELECT r.id, r.rating, r.title, r.body, r.images, r."helpfulCount", r."authorName", r."createdAt", cp.name AS product
      FROM reviews r JOIN order_items oi ON oi.id = r."orderItemId" JOIN seller_orders so ON so.id = oi."sellerOrderId" JOIN catalog_products cp ON cp.id = r."catalogProductId"
      WHERE so."storeId" = ${req.storeId}::uuid ORDER BY r."createdAt" DESC LIMIT 100`;
    res.json({ reviews: rows });
  });

  // ───────────── Team ─────────────
  app.get('/api/seller/staff', owner, async (req, res) => {
    const rows = await prisma.sellerMember.findMany({ where: { storeId: req.storeId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } });
    res.json({ staff: rows.map((r) => ({ id: r.user.id, name: r.user.name, email: r.user.email, role: r.role, since: r.createdAt })) });
  });
  app.post('/api/seller/staff', owner, async (req, res) => {
    const { email } = z.object({ email: z.email().toLowerCase() }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) throw new DomainError('Ask your colleague to create an IBazzzar account first, then add them here', 404);
    if (await prisma.sellerMember.findUnique({ where: { storeId_userId: { storeId: req.storeId, userId: u.id } } })) throw new DomainError('This person is already on your team', 409);
    await transaction(prisma, async (tx) => {
      await tx.sellerMember.create({ data: { storeId: req.storeId, userId: u.id, role: 'STAFF', addedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'seller.staff-added', entityType: 'store', entityId: req.storeId, metadata: { userId: u.id } });
      await notify(tx, u.id, { title: `You joined ${req.store.name}`, body: 'You can now manage products, orders and quotations.', link: '/seller' });
    });
    res.status(201).json({ member: { id: u.id, name: u.name, email: u.email, role: 'STAFF' } });
  });
  app.delete('/api/seller/staff/:userId', owner, async (req, res) => {
    const userId = uuid.parse(req.params.userId);
    const { count } = await prisma.sellerMember.deleteMany({ where: { storeId: req.storeId, userId, role: 'STAFF' } });
    if (!count) throw new DomainError('Staff member not found', 404);
    await audit(prisma, { actorId: req.user.id, action: 'seller.staff-removed', entityType: 'store', entityId: req.storeId, metadata: { userId } });
    res.json({ ok: true });
  });
}
