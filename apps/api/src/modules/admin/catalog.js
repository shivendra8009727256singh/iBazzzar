// Admin: catalogue — moderation, products, listings, categories, tax classes, brands, inventory and reviews.
import { z } from 'zod';
import { DomainError } from '../../../../../packages/shared/src/index.js';
import { uuid } from '../../../../../packages/validation/src/index.js';
import { requireStaff } from '../../http/middleware.js';
import { transaction, toPaise, Prisma } from '../../lib/db.js';
import { audit, notify, notifyStoreOwners } from '../../lib/audit.js';
import { ilike, slugify, toCsv } from '../../lib/http.js';
import { listParams, sendList, bulkInput } from '../../lib/admin-list.js';
import { getSetting } from '../../services/settings.js';
import { loadListingsWhere } from '../../services/catalog.js';
import { buildSearchText } from '../../services/products.js';
import * as inventory from '../../services/inventory.js';
import { notesFor } from './people.js';

const m = toPaise;
const reason = z.string().trim().min(5, 'Please give a short reason (at least 5 characters)').max(300);

async function rebuildSearchText(tx, productId) {
  const p = await tx.catalogProduct.findUnique({ where: { id: productId }, include: { brand: true, category: true, variants: true, attributes: true } });
  if (!p) return;
  await tx.catalogProduct.update({
    where: { id: productId },
    data: { searchText: buildSearchText({ name: p.name, brand: p.brand.name, category: p.category.name, highlights: p.highlights, attributes: Object.fromEntries(p.attributes.map((a) => [a.attributeId, a.value])), variantLabels: p.variants.map((v) => v.label) }) },
  });
}

export function registerAdminCatalog(app, { prisma }) {
  const catalogue = requireStaff('catalogue.manage');

  // ───────────── Moderation ─────────────
  app.get('/api/admin/moderation', catalogue, async (_req, res) => {
    const [productsPending, offersPending] = await Promise.all([
      prisma.catalogProduct.findMany({
        where: { status: { in: ['PENDING', 'CHANGES_REQUESTED'] } }, orderBy: { updatedAt: 'asc' }, take: 100,
        include: { brand: true, category: true, media: { orderBy: { sortOrder: 'asc' } }, attributes: { include: { attribute: true } }, variants: { include: { listings: { include: { store: { select: { name: true } }, tiers: true } } } } },
      }),
      loadListingsWhere(prisma, { status: 'PENDING', variant: { product: { status: 'APPROVED' } } }),
    ]);
    res.json({
      products: productsPending.map((p) => ({
        id: p.id, name: p.name, brand: p.brand.name, category: p.category.name, status: p.status, description: p.description, highlights: p.highlights, hsnCode: p.hsnCode, updatedAt: p.updatedAt,
        images: p.media.map((x) => x.url), specifications: p.attributes.map((a) => ({ name: a.attribute.name, value: a.value })),
        listings: p.variants.flatMap((v) => v.listings.map((l) => ({ id: l.id, variantLabel: v.label, seller: l.store.name, sku: l.sku, pricePaise: m(l.pricePaise), mrpPaise: m(l.mrpPaise), moq: l.moq, status: l.status }))),
      })),
      offers: offersPending.map((l) => ({ id: l.id, name: l.name, variantLabel: l.variantLabel, seller: l.sellerName, sku: l.sku, pricePaise: l.pricePaise, mrpPaise: l.mrpPaise, image: l.image, stock: l.stock })),
    });
  });

  async function moderate(tx, req, kind, id, decision, note) {
    if (kind === 'product') {
      const p = await tx.catalogProduct.findUnique({ where: { id }, include: { variants: { include: { listings: true } } } });
      if (!p) throw new DomainError('Product not found', 404);
      await tx.catalogProduct.update({ where: { id }, data: { status: decision } });
      const pendingListings = p.variants.flatMap((v) => v.listings).filter((l) => ['PENDING', 'CHANGES_REQUESTED'].includes(l.status));
      await tx.sellerListing.updateMany({ where: { id: { in: pendingListings.map((l) => l.id) } }, data: { status: decision, moderationNote: note ?? null } });
      for (const storeId of new Set(pendingListings.map((l) => l.storeId))) {
        await notifyStoreOwners(tx, storeId, { title: decision === 'APPROVED' ? 'Product approved' : decision === 'REJECTED' ? 'Product rejected' : 'Changes requested', body: `${p.name}${note ? `: ${note}` : ' is now live.'}`, link: '/seller/products' });
      }
    } else {
      const l = await tx.sellerListing.findUnique({ where: { id }, include: { variant: { include: { product: true } } } });
      if (!l) throw new DomainError('Listing not found', 404);
      await tx.sellerListing.update({ where: { id }, data: { status: decision, moderationNote: note ?? null } });
      await notifyStoreOwners(tx, l.storeId, { title: decision === 'APPROVED' ? 'Offer approved' : 'Offer needs attention', body: `${l.variant.product.name} (${l.variant.label})${note ? `: ${note}` : ' is now live.'}`, link: '/seller/products' });
    }
    await audit(tx, { actorId: req.user.id, action: `moderation.${kind}.${decision.toLowerCase()}`, entityType: kind, entityId: id, metadata: { note } });
  }

  app.post('/api/admin/moderation/:kind/:id', catalogue, async (req, res) => {
    const kind = z.enum(['product', 'listing']).parse(req.params.kind);
    const id = uuid.parse(req.params.id);
    const { decision, note } = z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']), note: z.string().trim().max(500).optional() }).parse(req.body);
    if (decision !== 'APPROVED' && !note) throw new DomainError('Tell the seller what to change', 400, { note: 'Please add a note for the seller' });
    await transaction(prisma, (tx) => moderate(tx, req, kind, id, decision, note));
    res.json({ ok: true });
  });

  app.post('/api/admin/moderation/bulk', catalogue, async (req, res) => {
    const input = bulkInput(req.body, ['approve', 'reject', 'changes']);
    const kind = z.enum(['product', 'listing']).parse(req.body.kind);
    const decision = { approve: 'APPROVED', reject: 'REJECTED', changes: 'CHANGES_REQUESTED' }[input.action];
    if (decision !== 'APPROVED' && (input.reason ?? '').length < 5) throw new DomainError('Tell the sellers what to change (at least 5 characters)', 400, { reason: 'Required' });
    const results = { done: 0, skipped: [] };
    for (const id of input.ids) {
      try { await transaction(prisma, (tx) => moderate(tx, req, kind, id, decision, input.reason)); results.done++; } catch (e) { results.skipped.push({ id, reason: e.message }); }
    }
    res.json(results);
  });

  // ───────────── Products ─────────────
  const productSorts = { updated: (d) => ({ updatedAt: d }), created: (d) => ({ createdAt: d }), name: (d) => ({ name: d }) };
  app.get('/api/admin/products', catalogue, async (req, res) => {
    const p = listParams(req.query, productSorts);
    const where = {
      ...(p.q ? { OR: [{ name: ilike(p.q) }, { brand: { name: ilike(p.q) } }, { variants: { some: { listings: { some: { sku: ilike(p.q) } } } } }] } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.category ? { category: { slug: String(req.query.category) } } : {}),
      ...(req.query.brand ? { brand: { slug: String(req.query.brand) } } : {}),
      ...(req.query.seller ? { variants: { some: { listings: { some: { storeId: String(req.query.seller) } } } } } : {}),
      ...(req.query.featured === 'yes' ? { featured: true } : {}),
      ...(req.query.demo === 'yes' ? { demo: true } : req.query.demo === 'no' ? { demo: false } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.catalogProduct.findMany({
        where, orderBy: p.orderBy, skip: p.skip, take: p.take,
        include: { brand: true, category: true, taxClass: true, media: { take: 1, orderBy: { sortOrder: 'asc' } }, variants: { include: { listings: { select: { id: true, storeId: true, pricePaise: true, status: true } } } }, _count: { select: { reviews: true } } },
      }),
      prisma.catalogProduct.count({ where }),
    ]);
    const products = rows.map((x) => {
      const listings = x.variants.flatMap((v) => v.listings);
      const prices = listings.map((l) => m(l.pricePaise));
      return {
        id: x.id, slug: x.slug, name: x.name, brand: x.brand.name, category: x.category.name, status: x.status, featured: x.featured, demo: x.demo, hsnCode: x.hsnCode,
        gstRateBps: x.taxClass?.gstRateBps ?? null, image: x.media[0]?.url ?? null, variants: x.variants.length, sellers: new Set(listings.map((l) => l.storeId)).size,
        offers: listings.length, minPricePaise: prices.length ? Math.min(...prices) : null, reviews: x._count.reviews, updatedAt: x.updatedAt, createdAt: x.createdAt,
      };
    });
    sendList(res, p, {
      key: 'products', rows: products, total, filename: 'products',
      toCsvRow: (x) => ({ name: x.name, brand: x.brand, category: x.category, status: x.status, featured: x.featured ? 'yes' : 'no', hsn: x.hsnCode ?? '', variants: x.variants, sellers: x.sellers, from_price_inr: x.minPricePaise == null ? '' : (x.minPricePaise / 100).toFixed(2), reviews: x.reviews, demo: x.demo ? 'yes' : 'no', updated: x.updatedAt }),
    });
  });

  /** Everything about one product: content, variants, every seller's offer with stock, sales and reviews. */
  app.get('/api/admin/products/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const p = await prisma.catalogProduct.findUnique({
      where: { id },
      include: { brand: true, category: true, taxClass: true, media: { orderBy: { sortOrder: 'asc' } }, attributes: { include: { attribute: true } }, variants: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!p) throw new DomainError('Product not found', 404);
    const [listings, sales, reviewStats] = await Promise.all([
      loadListingsWhere(prisma, { variant: { catalogProductId: id } }),
      prisma.orderItem.aggregate({ where: { catalogProductId: id, order: { status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } } }, _sum: { quantity: true, totalPaise: true } }),
      prisma.review.aggregate({ where: { catalogProductId: id, status: 'PUBLISHED' }, _avg: { rating: true }, _count: { _all: true } }),
    ]);
    const statuses = new Map((await prisma.sellerListing.findMany({ where: { id: { in: listings.map((l) => l.id) } }, select: { id: true, moderationNote: true } })).map((x) => [x.id, x]));
    res.json({
      product: {
        id: p.id, slug: p.slug, name: p.name, description: p.description, highlights: p.highlights, hsnCode: p.hsnCode, status: p.status, featured: p.featured, demo: p.demo,
        brand: { id: p.brand.id, name: p.brand.name }, category: { id: p.category.id, name: p.category.name }, taxClassId: p.taxClassId,
        gstRateBps: p.taxClass?.gstRateBps ?? null, images: p.media.map((x) => ({ id: x.id, url: x.url, alt: x.alt })),
        specifications: p.attributes.map((a) => ({ name: a.attribute.name, value: a.value })), createdAt: p.createdAt, updatedAt: p.updatedAt,
      },
      variants: p.variants.map((v) => ({ id: v.id, label: v.label, slug: v.slug, weightGrams: v.weightGrams })),
      listings: listings.map((l) => ({ id: l.id, variantId: l.variantId, variantLabel: l.variantLabel, seller: l.sellerName, storeId: l.storeId, sku: l.sku, status: l.status, pricePaise: l.pricePaise, mrpPaise: l.mrpPaise, moq: l.moq, tiers: l.tiers, onHand: l.onHand, reserved: l.reserved, stock: l.stock, codAllowed: l.codAllowed, returnable: l.returnable, moderationNote: statuses.get(l.id)?.moderationNote ?? null })),
      sales: { units: sales._sum.quantity ?? 0, revenuePaise: m(sales._sum.totalPaise ?? 0) },
      reviews: { count: reviewStats._count._all, average: reviewStats._avg.rating ? Math.round(reviewStats._avg.rating * 10) / 10 : null },
      notes: await notesFor(prisma, 'product', id),
    });
  });

  /** Admin content edits don't send the product back to review (unlike seller edits). */
  app.patch('/api/admin/products/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({
      name: z.string().trim().min(3).max(150), description: z.string().trim().min(20).max(5000), highlights: z.array(z.string().trim().min(3).max(140)).max(8),
      categoryId: uuid, brandId: uuid, hsnCode: z.string().regex(/^\d{4,8}$/, 'HSN codes are 4 to 8 digits').nullable(), taxClassId: uuid.nullable(),
      featured: z.boolean(), status: z.enum(['APPROVED', 'PAUSED', 'REJECTED']), imageOrder: z.array(uuid).max(8),
    }).partial().parse(req.body);
    await transaction(prisma, async (tx) => {
      const p = await tx.catalogProduct.findUnique({ where: { id }, include: { media: true } });
      if (!p) throw new DomainError('Product not found', 404);
      if (input.featured && (input.status ?? p.status) !== 'APPROVED') throw new DomainError('Only live products can be featured', 409);
      if (input.categoryId && !await tx.category.findFirst({ where: { id: input.categoryId, active: true } })) throw new DomainError('Choose an active category', 400);
      if (input.brandId && !await tx.brand.findUnique({ where: { id: input.brandId } })) throw new DomainError('Brand not found', 400);
      const { imageOrder, ...data } = input;
      if (data.status && data.status !== 'APPROVED') data.featured = false;
      await tx.catalogProduct.update({ where: { id }, data });
      if (imageOrder) {
        // Keep only listed images, in the given order; removed ones go away from the product.
        const keep = new Set(imageOrder);
        if (!imageOrder.length) throw new DomainError('A product needs at least one photo', 400);
        if (imageOrder.some((mid) => !p.media.some((x) => x.id === mid))) throw new DomainError('Unknown image', 400);
        await tx.productMedia.deleteMany({ where: { catalogProductId: id, id: { notIn: [...keep] } } });
        for (const [i, mid] of imageOrder.entries()) await tx.productMedia.update({ where: { id: mid }, data: { sortOrder: i } });
      }
      await rebuildSearchText(tx, id);
      await audit(tx, { actorId: req.user.id, action: 'product.admin-edited', entityType: 'catalog_product', entityId: id, metadata: { fields: Object.keys(input) } });
    });
    res.json({ ok: true });
  });

  /** Merges a duplicate product page into another: variants, offers, reviews, wishlists and order history move over. */
  app.post('/api/admin/products/:id/merge', catalogue, async (req, res) => {
    const sourceId = uuid.parse(req.params.id);
    const { intoId } = z.object({ intoId: uuid }).parse(req.body);
    if (sourceId === intoId) throw new DomainError('Choose a different product to merge into', 400);
    const moved = await transaction(prisma, async (tx) => {
      const [source, target] = await Promise.all([tx.catalogProduct.findUnique({ where: { id: sourceId }, include: { variants: true, media: true } }), tx.catalogProduct.findUnique({ where: { id: intoId }, include: { media: true } })]);
      if (!source || !target) throw new DomainError('Product not found', 404);
      await tx.productVariant.updateMany({ where: { catalogProductId: sourceId }, data: { catalogProductId: intoId } });
      const targetUrls = new Set(target.media.map((x) => x.url));
      let order = target.media.length;
      for (const img of source.media) if (!targetUrls.has(img.url) && order < 8) await tx.productMedia.create({ data: { catalogProductId: intoId, url: img.url, alt: img.alt, sortOrder: order++, mediaAssetId: img.mediaAssetId } });
      // Reviews and wishlists are unique per person and product; duplicates on the target win.
      const sourceReviews = await tx.review.findMany({ where: { catalogProductId: sourceId } });
      for (const r of sourceReviews) {
        const dup = await tx.review.findUnique({ where: { catalogProductId_userId: { catalogProductId: intoId, userId: r.userId } } });
        if (dup) await tx.review.delete({ where: { id: r.id } }); else await tx.review.update({ where: { id: r.id }, data: { catalogProductId: intoId } });
      }
      const wishes = await tx.wishlistItem.findMany({ where: { catalogProductId: sourceId } });
      await tx.wishlistItem.createMany({ data: wishes.map((w) => ({ userId: w.userId, catalogProductId: intoId })), skipDuplicates: true });
      await tx.orderItem.updateMany({ where: { catalogProductId: sourceId }, data: { catalogProductId: intoId } });
      await tx.catalogProduct.delete({ where: { id: sourceId } });
      await rebuildSearchText(tx, intoId);
      await audit(tx, { actorId: req.user.id, action: 'product.merged', entityType: 'catalog_product', entityId: intoId, metadata: { from: sourceId, fromName: source.name, variants: source.variants.length } });
      return source.variants.length;
    });
    res.json({ ok: true, variantsMoved: moved });
  });

  app.post('/api/admin/products/bulk', catalogue, async (req, res) => {
    const input = bulkInput(req.body, ['approve', 'reject', 'pause', 'resume', 'feature', 'unfeature']);
    if (['reject', 'pause'].includes(input.action) && (input.reason ?? '').length < 5) throw new DomainError('Please give a reason (at least 5 characters)', 400, { reason: 'Required' });
    const results = { done: 0, skipped: [] };
    for (const id of input.ids) {
      try {
        await transaction(prisma, async (tx) => {
          const p = await tx.catalogProduct.findUnique({ where: { id } });
          if (!p) throw new DomainError('Not found', 404);
          if (input.action === 'approve') return moderate(tx, req, 'product', id, 'APPROVED');
          if (input.action === 'reject') return moderate(tx, req, 'product', id, 'REJECTED', input.reason);
          if (input.action === 'feature' && p.status !== 'APPROVED') throw new DomainError('Only live products can be featured', 409);
          const data = { pause: { status: 'PAUSED', featured: false }, resume: { status: 'APPROVED' }, feature: { featured: true }, unfeature: { featured: false } }[input.action];
          await tx.catalogProduct.update({ where: { id }, data });
          await audit(tx, { actorId: req.user.id, action: `product.${input.action}`, entityType: 'catalog_product', entityId: id, metadata: { reason: input.reason } });
        });
        results.done++;
      } catch (e) { results.skipped.push({ id, reason: e.message }); }
    }
    res.json(results);
  });

  // ───────────── Seller listings (offers) ─────────────
  app.patch('/api/admin/listings/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({
      pricePaise: z.number().int().min(100).max(100_000_000).optional(), mrpPaise: z.number().int().min(100).max(100_000_000).optional(),
      status: z.enum(['APPROVED', 'PAUSED', 'REJECTED']).optional(), reason,
    }).parse(req.body);
    await transaction(prisma, async (tx) => {
      const l = await tx.sellerListing.findUnique({ where: { id }, include: { variant: { include: { product: true } } } });
      if (!l) throw new DomainError('Listing not found', 404);
      const price = input.pricePaise ?? m(l.pricePaise);
      const mrp = input.mrpPaise ?? m(l.mrpPaise);
      if (mrp < price) throw new DomainError('MRP can’t be lower than the price', 400, { mrpPaise: 'MRP can’t be lower than the price' });
      const { reason: why, ...data } = input;
      await tx.sellerListing.update({ where: { id }, data });
      if (data.pricePaise !== undefined) await tx.priceTier.deleteMany({ where: { listingId: id, pricePaise: { gt: price } } });
      await notifyStoreOwners(tx, l.storeId, { title: 'IBazzzar updated your listing', body: `${l.variant.product.name} (${l.variant.label}): ${why}`, link: '/seller/products' });
      await audit(tx, { actorId: req.user.id, action: 'listing.admin-edited', entityType: 'listing', entityId: id, metadata: input });
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/listings/:id/stock', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ delta: z.number().int().min(-1_000_000).max(1_000_000).refine((d) => d !== 0, 'Enter a change other than zero'), reason }).parse(req.body);
    const out = await transaction(prisma, async (tx) => {
      const l = await tx.sellerListing.findUnique({ where: { id } });
      if (!l) throw new DomainError('Listing not found', 404);
      const r = await inventory.adjust(tx, id, input.delta, 'CORRECTION', req.user.id, `Admin: ${input.reason}`);
      await notifyStoreOwners(tx, l.storeId, { title: 'Stock corrected by IBazzzar', body: `SKU ${l.sku}: ${input.delta > 0 ? '+' : ''}${input.delta} (${input.reason})`, link: '/seller/products' });
      await audit(tx, { actorId: req.user.id, action: 'listing.stock-corrected', entityType: 'listing', entityId: id, metadata: input });
      return r;
    });
    res.json({ stock: { onHand: out.onHand, reserved: out.reserved, available: out.onHand - out.reserved } });
  });

  // ───────────── Categories ─────────────
  const categoryInput = z.object({
    name: z.string().trim().min(2).max(60), description: z.string().trim().max(300).nullable(), imageUrl: z.string().max(300).nullable(),
    parentId: uuid.nullable(), taxClassId: uuid.nullable(), commissionBps: z.number().int().min(0).max(5000).nullable(),
    active: z.boolean(), sortOrder: z.number().int().min(0).max(1000),
  }).partial();

  app.get('/api/admin/categories', catalogue, async (_req, res) => {
    const [categories, taxClasses, counts, rules, stores] = await Promise.all([
      prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { taxClass: true, _count: { select: { children: true } } } }),
      prisma.taxClass.findMany({ orderBy: { gstRateBps: 'asc' }, include: { _count: { select: { categories: true, products: true } } } }),
      prisma.catalogProduct.groupBy({ by: ['categoryId', 'status'], _count: { _all: true } }),
      prisma.commissionRule.findMany(),
      prisma.sellerStore.groupBy({ by: ['primaryCategoryId'], _count: { _all: true } }),
    ]);
    res.json({
      categories: categories.map((c) => ({
        ...c, children: c._count.children, _count: undefined,
        products: counts.filter((x) => x.categoryId === c.id).reduce((s, x) => s + x._count._all, 0),
        liveProducts: counts.find((x) => x.categoryId === c.id && x.status === 'APPROVED')?._count._all ?? 0,
        stores: stores.find((x) => x.primaryCategoryId === c.id)?._count._all ?? 0,
        commissionBps: rules.find((r) => r.categoryId === c.id)?.rateBps ?? null,
      })),
      taxClasses: taxClasses.map((t) => ({ id: t.id, code: t.code, name: t.name, gstRateBps: t.gstRateBps, cessRateBps: t.cessRateBps, categories: t._count.categories, products: t._count.products })),
      defaultCommissionBps: (await getSetting(prisma, 'commission')).rateBps,
    });
  });

  app.post('/api/admin/categories', catalogue, async (req, res) => {
    const input = categoryInput.required({ name: true }).parse(req.body);
    const { commissionBps, ...data } = input;
    if (commissionBps != null && !req.can('finance.manage')) throw new DomainError('Only finance can set commission', 403);
    const category = await transaction(prisma, async (tx) => {
      if (await tx.category.findFirst({ where: { OR: [{ name: { equals: input.name, mode: 'insensitive' } }, { slug: slugify(input.name) }] } })) throw new DomainError('A category with this name already exists', 409, { name: 'Already exists' });
      const c = await tx.category.create({ data: { ...data, slug: slugify(input.name), sortOrder: input.sortOrder ?? await tx.category.count() } });
      if (commissionBps != null) await tx.commissionRule.create({ data: { categoryId: c.id, rateBps: commissionBps, updatedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'category.created', entityType: 'category', entityId: c.id, metadata: input });
      return c;
    });
    res.status(201).json({ category });
  });

  app.patch('/api/admin/categories/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = categoryInput.parse(req.body);
    const { commissionBps, ...data } = input;
    if (data.parentId === id) throw new DomainError('A category can’t be its own parent', 400);
    if (commissionBps !== undefined && !req.can('finance.manage')) throw new DomainError('Only finance can change commission', 403);
    const category = await transaction(prisma, async (tx) => {
      if (!await tx.category.findUnique({ where: { id } })) throw new DomainError('Category not found', 404);
      if (data.name && await tx.category.findFirst({ where: { id: { not: id }, name: { equals: data.name, mode: 'insensitive' } } })) throw new DomainError('A category with this name already exists', 409, { name: 'Already exists' });
      if (data.parentId && (await tx.category.findUnique({ where: { id: data.parentId } }))?.parentId) throw new DomainError('Only two levels are supported: pick a top-level parent', 400);
      const c = await tx.category.update({ where: { id }, data: { ...data, ...(data.name ? { slug: slugify(data.name) } : {}) } });
      if (commissionBps === null) await tx.commissionRule.deleteMany({ where: { categoryId: id } });
      else if (commissionBps !== undefined) await tx.commissionRule.upsert({ where: { categoryId: id }, create: { categoryId: id, rateBps: commissionBps, updatedBy: req.user.id }, update: { rateBps: commissionBps, updatedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'category.updated', entityType: 'category', entityId: id, metadata: input });
      return c;
    });
    res.json({ category });
  });

  app.delete('/api/admin/categories/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    await transaction(prisma, async (tx) => {
      const c = await tx.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true, stores: true } } } });
      if (!c) throw new DomainError('Category not found', 404);
      if (c._count.products || c._count.children || c._count.stores) throw new DomainError(`This category still has ${c._count.products} products, ${c._count.children} sub-categories and ${c._count.stores} stores. Move them or hide the category instead.`, 409);
      await tx.commissionRule.deleteMany({ where: { categoryId: id } });
      await tx.category.delete({ where: { id } });
      await audit(tx, { actorId: req.user.id, action: 'category.deleted', entityType: 'category', entityId: id, metadata: { name: c.name } });
    });
    res.json({ ok: true });
  });

  app.put('/api/admin/categories/order', catalogue, async (req, res) => {
    const { ids } = z.object({ ids: z.array(uuid).min(1).max(500) }).parse(req.body);
    await transaction(prisma, async (tx) => {
      for (const [i, id] of ids.entries()) await tx.category.update({ where: { id }, data: { sortOrder: i } });
      await audit(tx, { actorId: req.user.id, action: 'category.reordered', entityType: 'category', entityId: 'all' });
    });
    res.json({ ok: true });
  });

  // ───────────── Tax classes ─────────────
  const taxInput = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, 'Use 2–20 capital letters, digits or _'), name: z.string().trim().min(3).max(80), gstRateBps: z.number().int().min(0).max(4000), cessRateBps: z.number().int().min(0).max(10000).default(0) });
  app.post('/api/admin/tax-classes', requireStaff('settings.manage'), async (req, res) => {
    const input = taxInput.parse(req.body);
    if (await prisma.taxClass.findUnique({ where: { code: input.code } })) throw new DomainError('This code already exists', 409, { code: 'Already exists' });
    const taxClass = await prisma.taxClass.create({ data: input });
    await audit(prisma, { actorId: req.user.id, action: 'tax-class.created', entityType: 'tax_class', entityId: taxClass.id, metadata: input });
    res.status(201).json({ taxClass });
  });
  app.patch('/api/admin/tax-classes/:id', requireStaff('settings.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = taxInput.omit({ code: true }).partial().parse(req.body);
    // Existing orders keep their stored tax; a new rate applies to orders placed from now on.
    const taxClass = await prisma.taxClass.update({ where: { id }, data: input });
    await audit(prisma, { actorId: req.user.id, action: 'tax-class.updated', entityType: 'tax_class', entityId: id, metadata: input });
    res.json({ taxClass });
  });

  // ───────────── Brands ─────────────
  const brandSorts = { name: (d) => ({ name: d === 'desc' ? 'desc' : 'asc' }), products: (d) => ({ products: { _count: d } }), created: (d) => ({ createdAt: d }) };
  app.get('/api/admin/brands', catalogue, async (req, res) => {
    const p = listParams({ dir: 'asc', ...req.query }, brandSorts);
    const where = { ...(p.q ? { name: ilike(p.q) } : {}), ...(req.query.verified === 'yes' ? { verified: true } : req.query.verified === 'no' ? { verified: false } : {}) };
    const [rows, total] = await Promise.all([
      prisma.brand.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { _count: { select: { products: true } } } }),
      prisma.brand.count({ where }),
    ]);
    const brands = rows.map((b) => ({ id: b.id, name: b.name, slug: b.slug, verified: b.verified, logoUrl: b.logoUrl, products: b._count.products, createdAt: b.createdAt }));
    sendList(res, p, { key: 'brands', rows: brands, total, filename: 'brands', toCsvRow: (b) => ({ name: b.name, verified: b.verified ? 'yes' : 'no', products: b.products }) });
  });
  const brandInput = z.object({ name: z.string().trim().min(2).max(80), verified: z.boolean(), logoUrl: z.string().max(300).nullable() }).partial();
  app.post('/api/admin/brands', catalogue, async (req, res) => {
    const input = brandInput.required({ name: true }).parse(req.body);
    if (await prisma.brand.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) throw new DomainError('This brand already exists', 409, { name: 'Already exists' });
    const brand = await prisma.brand.create({ data: { ...input, slug: slugify(input.name) } });
    await audit(prisma, { actorId: req.user.id, action: 'brand.created', entityType: 'brand', entityId: brand.id });
    res.status(201).json({ brand });
  });
  app.patch('/api/admin/brands/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = brandInput.parse(req.body);
    if (input.name && await prisma.brand.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: 'insensitive' } } })) throw new DomainError('Another brand already has this name. Merge them instead.', 409, { name: 'Already exists' });
    const brand = await prisma.brand.update({ where: { id }, data: { ...input, ...(input.name ? { slug: slugify(input.name) } : {}) } });
    await audit(prisma, { actorId: req.user.id, action: 'brand.updated', entityType: 'brand', entityId: id, metadata: input });
    res.json({ brand });
  });
  app.post('/api/admin/brands/:id/merge', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { intoId } = z.object({ intoId: uuid }).parse(req.body);
    if (id === intoId) throw new DomainError('Choose a different brand', 400);
    const count = await transaction(prisma, async (tx) => {
      const [a, b] = await Promise.all([tx.brand.findUnique({ where: { id } }), tx.brand.findUnique({ where: { id: intoId } })]);
      if (!a || !b) throw new DomainError('Brand not found', 404);
      const products = await tx.catalogProduct.findMany({ where: { brandId: id }, select: { id: true } });
      await tx.catalogProduct.updateMany({ where: { brandId: id }, data: { brandId: intoId } });
      for (const p of products) await rebuildSearchText(tx, p.id);
      await tx.brand.delete({ where: { id } });
      await audit(tx, { actorId: req.user.id, action: 'brand.merged', entityType: 'brand', entityId: intoId, metadata: { from: a.name, products: products.length } });
      return products.length;
    });
    res.json({ ok: true, productsMoved: count });
  });
  app.delete('/api/admin/brands/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const b = await prisma.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!b) throw new DomainError('Brand not found', 404);
    if (b._count.products) throw new DomainError(`${b._count.products} products use this brand. Merge it into another brand instead.`, 409);
    await prisma.brand.delete({ where: { id } });
    await audit(prisma, { actorId: req.user.id, action: 'brand.deleted', entityType: 'brand', entityId: id, metadata: { name: b.name } });
    res.json({ ok: true });
  });

  // ───────────── Inventory ─────────────
  app.get('/api/admin/inventory', catalogue, async (req, res) => {
    const { lowStockThreshold } = await getSetting(prisma, 'platform');
    const q = String(req.query.q || '').trim().slice(0, 100);
    const view = ['low', 'out', 'all'].includes(req.query.view) ? req.query.view : 'low';
    const filter = view === 'low' ? Prisma.sql`AND b."onHand" - b.reserved <= ${lowStockThreshold}` : view === 'out' ? Prisma.sql`AND b."onHand" - b.reserved <= 0` : Prisma.empty;
    const search = q ? Prisma.sql`AND (cp.name ILIKE ${'%' + q + '%'} OR l.sku ILIKE ${'%' + q + '%'} OR s.name ILIKE ${'%' + q + '%'})` : Prisma.empty;
    const rows = await prisma.$queryRaw`
      SELECT l.id, l.sku, cp.id AS "productId", cp.name, v.label AS variant, s.name AS seller, l.status, b."onHand"::int AS "onHand", b.reserved::int AS reserved, (b."onHand" - b.reserved)::int AS available,
             COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi."orderId" WHERE oi."listingId" = l.id AND o."createdAt" > now() - interval '30 days' AND o.status NOT IN ('AWAITING_PAYMENT','CANCELLED')), 0)::int AS "sold30d"
      FROM seller_listings l JOIN inventory_balances b ON b."listingId" = l.id JOIN product_variants v ON v.id = l."variantId"
      JOIN catalog_products cp ON cp.id = v."catalogProductId" JOIN seller_stores s ON s.id = l."storeId"
      WHERE l.status IN ('APPROVED','PAUSED') ${filter} ${search}
      ORDER BY available ASC, cp.name LIMIT 500`;
    const items = rows.map((r) => ({ ...r, daysOfCover: r.sold30d ? Math.round((r.available / (r.sold30d / 30)) * 10) / 10 : null }));
    if (req.query.format === 'csv') {
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ibazzzar-inventory.csv"' }).send('﻿' + toCsv(items.map((r) => ({ sku: r.sku, product: r.name, variant: r.variant, seller: r.seller, on_hand: r.onHand, held: r.reserved, available: r.available, sold_30d: r.sold30d, days_of_cover: r.daysOfCover ?? '' }))));
      return;
    }
    res.json({ lowStockThreshold, items });
  });

  // ───────────── Reviews ─────────────
  const reviewSorts = { newest: (d) => ({ createdAt: d }), rating: (d) => ({ rating: d }) };
  app.get('/api/admin/reviews', catalogue, async (req, res) => {
    const p = listParams(req.query, reviewSorts);
    const where = {
      ...(p.q ? { OR: [{ title: ilike(p.q) }, { body: ilike(p.q) }, { product: { name: ilike(p.q) } }] } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.rating ? { rating: Number(req.query.rating) } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.review.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { product: { select: { id: true, name: true, slug: true } }, user: { select: { email: true } } } }),
      prisma.review.count({ where }),
    ]);
    const reviews = rows.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, status: r.status, authorName: r.authorName, email: r.user.email, product: r.product, createdAt: r.createdAt }));
    sendList(res, p, { key: 'reviews', rows: reviews, total, filename: 'reviews', toCsvRow: (r) => ({ product: r.product.name, rating: r.rating, title: r.title, review: r.body, status: r.status, author: r.authorName, date: r.createdAt }) });
  });
  app.patch('/api/admin/reviews/:id', catalogue, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ status: z.enum(['PUBLISHED', 'HIDDEN']), reason }).parse(req.body);
    const r = await prisma.review.update({ where: { id }, data: { status: input.status } });
    if (input.status === 'HIDDEN') await notify(prisma, r.userId, { title: 'Your review was hidden', body: input.reason, link: '/account/orders' });
    await audit(prisma, { actorId: req.user.id, action: `review.${input.status.toLowerCase()}`, entityType: 'review', entityId: id, metadata: { reason: input.reason } });
    res.json({ ok: true });
  });
}
