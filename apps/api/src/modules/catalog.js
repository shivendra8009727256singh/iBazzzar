import { z } from 'zod';
import { DomainError, deliveryEstimate } from '../../../../packages/shared/src/index.js';
import { reviewSchema, pincodeSchema, uuid } from '../../../../packages/validation/src/index.js';
import { pageParams } from '../lib/http.js';
import { transaction } from '../lib/db.js';
import { requireAuth } from '../http/middleware.js';
import {
  searchCatalog, productCards, loadListingsWhere, sellableListingWhere, publicListing, buyBox, ratings, facets, loadListings,
} from '../services/catalog.js';
import { createReview } from '../services/orders.js';
import { getSetting } from '../services/settings.js';

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  brand: z.union([z.string().max(80), z.array(z.string().max(80)).max(20)]).optional(),
  seller: z.string().trim().max(80).optional(),
  min: z.coerce.number().min(0).max(10_000_000).optional(),
  max: z.coerce.number().min(0).max(10_000_000).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  deals: z.enum(['true', 'false']).optional(),
  wholesale: z.enum(['true', 'false']).optional(),
  sort: z.enum(['relevance', 'newest', 'price-asc', 'price-desc', 'rating', 'popular', 'discount']).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

const publicStore = (s) => ({ id: s.id, slug: s.slug, name: s.name, description: s.description, createdAt: s.createdAt, primaryCategory: s.primaryCategory?.name ?? null, stateCode: s.stateCode });

export function registerCatalog(app, { prisma }) {
  app.get('/api/categories', async (_req, res) => {
    const rows = await prisma.category.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { taxClass: { select: { gstRateBps: true } } } });
    const counts = await prisma.catalogProduct.groupBy({ by: ['categoryId'], where: { status: 'APPROVED' }, _count: { _all: true } });
    const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      categories: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, imageUrl: c.imageUrl, parentId: c.parentId, products: countOf.get(c.id) ?? 0, gstRateBps: c.taxClass?.gstRateBps ?? null })),
    });
  });

  app.get('/api/brands', async (_req, res) => {
    const brands = await prisma.brand.findMany({ where: { products: { some: { status: 'APPROVED' } } }, orderBy: { name: 'asc' }, include: { _count: { select: { products: { where: { status: 'APPROVED' } } } } } });
    // Main category and lowest live price per brand, for the brand directory cards.
    const extra = brands.length ? await prisma.$queryRaw`
      SELECT cp."brandId" AS id, (array_agg(c.name ORDER BY c.name))[1] AS category, MIN(l."pricePaise")::bigint AS "fromPaise",
             (array_agg(m.url ORDER BY cp.featured DESC, cp."createdAt"))[1] AS image
      FROM catalog_products cp JOIN categories c ON c.id = cp."categoryId" JOIN product_variants v ON v."catalogProductId" = cp.id
      JOIN seller_listings l ON l."variantId" = v.id AND l.status = 'APPROVED'
      LEFT JOIN LATERAL (SELECT url FROM product_media pm WHERE pm."catalogProductId" = cp.id ORDER BY "sortOrder" LIMIT 1) m ON true
      WHERE cp.status = 'APPROVED' GROUP BY cp."brandId"` : [];
    const info = new Map(extra.map((x) => [x.id, x]));
    res.json({ brands: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, logoUrl: b.logoUrl, verified: b.verified, products: b._count.products, category: info.get(b.id)?.category ?? null, fromPaise: info.get(b.id)?.fromPaise == null ? null : Number(info.get(b.id).fromPaise), image: info.get(b.id)?.image ?? null })) });
  });

  app.get('/api/products', async (req, res) => {
    const f = listQuery.parse(req.query);
    const paging = pageParams(req.query, { size: f.limit ?? 24, max: 60 });
    const filters = {
      q: f.q, category: f.category, seller: f.seller, sort: f.sort,
      brands: f.brand ? [f.brand].flat() : undefined,
      minPrice: f.min != null ? Math.round(f.min * 100) : null,
      maxPrice: f.max != null ? Math.round(f.max * 100) : null,
      minRating: f.minRating, inStock: f.inStock === 'true', deals: f.deals === 'true', wholesale: f.wholesale === 'true',
    };
    const { ids, total } = await searchCatalog(prisma, filters, paging);
    const products = await productCards(prisma, ids);
    res.json({ products, total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)), facets: await facets(prisma, { category: f.category }) });
  });

  app.get('/api/products/:slug', async (req, res) => {
    const slug = String(req.params.slug).slice(0, 120);
    const variant = await prisma.productVariant.findUnique({ where: { slug }, select: { id: true, catalogProductId: true } });
    const product = await prisma.catalogProduct.findFirst({
      where: { status: 'APPROVED', ...(variant ? { id: variant.catalogProductId } : /^[0-9a-f-]{36}$/.test(slug) ? { id: slug } : { slug }) },
      include: {
        brand: true, category: { include: { parent: true } }, media: { orderBy: { sortOrder: 'asc' } },
        attributes: { include: { attribute: true } }, variants: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) throw new DomainError('Product not found', 404);
    const offers = await loadListingsWhere(prisma, { ...sellableListingWhere, variant: { catalogProductId: product.id } });
    if (!offers.length) throw new DomainError('This product isn’t available right now', 404);

    const variants = product.variants
      .map((v) => {
        const own = offers.filter((o) => o.variantId === v.id);
        if (!own.length) return null;
        const best = buyBox(own);
        return { id: v.id, slug: v.slug, label: v.label, attributes: v.attributes, listingId: best.id, pricePaise: best.effectivePaise, mrpPaise: best.mrpPaise, stock: own.reduce((s, o) => s + o.stock, 0) };
      })
      .filter(Boolean);
    const selected = variants.find((v) => v.id === variant?.id) ?? variants.find((v) => v.stock > 0) ?? variants[0];
    const variantOffers = offers.filter((o) => o.variantId === selected.id).sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.effectivePaise - b.effectivePaise);
    const best = variantOffers[0];

    const [rating, reviews, relatedIds, breakdown] = await Promise.all([
      ratings(prisma, [product.id]),
      prisma.review.findMany({ where: { catalogProductId: product.id, status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.catalogProduct.findMany({ where: { categoryId: product.categoryId, status: 'APPROVED', id: { not: product.id } }, select: { id: true }, take: 8, orderBy: { createdAt: 'desc' } }),
      prisma.review.groupBy({ by: ['rating'], where: { catalogProductId: product.id, status: 'PUBLISHED' }, _count: { _all: true } }),
    ]);
    const stores = await prisma.sellerStore.findMany({ where: { id: { in: variantOffers.map((o) => o.storeId) } }, include: { primaryCategory: true } });
    res.json({
      product: {
        id: product.id, slug: product.slug, name: product.name, brand: { name: product.brand.name, slug: product.brand.slug },
        category: { name: product.category.name, slug: product.category.slug, parent: product.category.parent ? { name: product.category.parent.name, slug: product.category.parent.slug } : null },
        description: product.description, highlights: product.highlights, hsnCode: product.hsnCode,
        images: product.media.map((m) => ({ url: m.url, alt: m.alt })),
        specifications: product.attributes.map((a) => ({ name: a.attribute.name, value: a.value })),
        rating: rating.get(product.id) ?? null, demo: product.demo,
        // How many reviews gave each star rating, 5 down to 1.
        ratingBreakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: breakdown.find((b) => b.rating === stars)?._count._all ?? 0 })),
      },
      variants,
      selectedVariantId: selected.id,
      offer: publicListing(best),
      offers: variantOffers.map(publicListing),
      sellers: stores.map(publicStore),
      reviews: reviews.map(({ userId: _u, orderItemId: _o, ...r }) => r),
      related: await productCards(prisma, relatedIds.map((r) => r.id)),
    });
  });

  app.get('/api/search/suggest', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ products: [], brands: [], sellers: [], categories: [] });
    const { ids } = await searchCatalog(prisma, { q, sort: 'relevance' }, { take: 6, skip: 0 });
    const [products, brands, sellers, categories] = await Promise.all([
      productCards(prisma, ids),
      prisma.brand.findMany({ where: { name: { contains: q, mode: 'insensitive' }, products: { some: { status: 'APPROVED' } } }, take: 4, select: { name: true, slug: true } }),
      prisma.sellerStore.findMany({ where: { status: 'APPROVED', name: { contains: q, mode: 'insensitive' } }, take: 3, select: { name: true, slug: true } }),
      prisma.category.findMany({ where: { active: true, name: { contains: q, mode: 'insensitive' } }, take: 4, select: { name: true, slug: true } }),
    ]);
    res.json({ products: products.map((p) => ({ slug: p.slug, name: p.name, brand: p.brand, image: p.image, pricePaise: p.pricePaise })), brands, sellers, categories });
  });

  app.get('/api/sellers', async (_req, res) => {
    const stores = await prisma.sellerStore.findMany({ where: { status: 'APPROVED' }, include: { primaryCategory: true, _count: { select: { listings: { where: { status: 'APPROVED' } } } } }, orderBy: { createdAt: 'asc' } });
    res.json({ sellers: stores.map((s) => ({ ...publicStore(s), products: s._count.listings })) });
  });

  app.get('/api/sellers/:slug', async (req, res) => {
    const store = await prisma.sellerStore.findFirst({ where: { slug: String(req.params.slug), status: 'APPROVED' }, include: { primaryCategory: true } });
    if (!store) throw new DomainError('Store not found', 404);
    const paging = pageParams(req.query, { size: 24 });
    const { ids, total } = await searchCatalog(prisma, { seller: store.slug, sort: 'popular' }, paging);
    const ratingRows = await prisma.$queryRaw`
      SELECT AVG(r.rating)::float AS average, COUNT(*)::int AS count FROM reviews r
      JOIN order_items oi ON oi.id = r."orderItemId" JOIN seller_orders so ON so.id = oi."sellerOrderId"
      WHERE so."storeId" = ${store.id}::uuid AND r.status = 'PUBLISHED'`;
    res.json({ seller: { ...publicStore(store), rating: ratingRows[0].count ? { average: Math.round(ratingRows[0].average * 10) / 10, count: ratingRows[0].count } : null }, products: await productCards(prisma, ids), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });

  /** Live and upcoming flash deals. Countdowns end at the promotion's real end time. */
  app.get('/api/deals', async (_req, res) => {
    const now = new Date();
    const promotions = await prisma.promotion.findMany({
      where: { active: true, endsAt: { gt: now }, startsAt: { lte: new Date(now.getTime() + 7 * 86_400_000) } },
      orderBy: { endsAt: 'asc' }, take: 10,
      include: { items: { select: { listingId: true } } }, relationLoadStrategy: 'join',
    });
    const listingIds = promotions.flatMap((p) => p.items.map((i) => i.listingId));
    const [listings, hero] = await Promise.all([loadListings(prisma, listingIds, now), getSetting(prisma, 'dealsHero')]);
    res.json({
      now,
      hero,
      deals: promotions.map((p) => ({
        id: p.id, name: p.name, description: p.description, discountBps: p.discountBps, startsAt: p.startsAt, endsAt: p.endsAt,
        live: p.startsAt <= now,
        // One card per product: a product on deal with several variants or sellers shows its best price once.
        products: [...p.items.map((i) => listings.get(i.listingId)).filter((l) => l?.sellable)
          .reduce((best, l) => { const cur = best.get(l.catalogProductId); if (!cur || l.effectivePaise < cur.effectivePaise) best.set(l.catalogProductId, l); return best; }, new Map())
          .values()].map(publicListing).slice(0, 12),
      })).filter((d) => d.products.length),
    });
  });

  app.get('/api/offers', async (_req, res) => {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({ where: { public: true, active: true, startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: 'asc' } });
    res.json({
      offers: coupons.filter((c) => c.usageLimit == null || c.used < c.usageLimit).map((c) => ({
        code: c.code, description: c.description, kind: c.kind, value: c.value, maxDiscountPaise: c.maxDiscountPaise == null ? null : Number(c.maxDiscountPaise),
        minOrderPaise: Number(c.minOrderPaise), mode: c.mode, startsAt: c.startsAt, endsAt: c.endsAt,
      })),
    });
  });

  app.get('/api/reviews/recent', async (_req, res) => {
    const reviews = await prisma.review.findMany({ where: { status: 'PUBLISHED', rating: { gte: 4 } }, orderBy: { createdAt: 'desc' }, take: 6, include: { product: { select: { name: true, slug: true } } } });
    res.json({ reviews: reviews.map((r) => ({ id: r.id, authorName: r.authorName, rating: r.rating, title: r.title, body: r.body, createdAt: r.createdAt, verified: true, productName: r.product.name, productSlug: r.product.slug })) });
  });

  app.get('/api/delivery/estimate', async (req, res) => {
    const { listingId, pincode } = z.object({ listingId: uuid, pincode: pincodeSchema }).parse(req.query);
    const [listing] = await loadListingsWhere(prisma, { id: listingId, ...sellableListingWhere });
    if (!listing) throw new DomainError('This item isn’t available', 404);
    const settings = await getSetting(prisma, 'shipping');
    const estimate = deliveryEstimate(listing.store.pickupAddress?.pincode, pincode, listing.store.handlingDays, settings);
    res.json({ estimate: { ...estimate, codAvailable: !!(estimate.codAvailable && listing.codAllowed && listing.store.codEnabled) }, freeShippingThresholdPaise: settings.freeShippingThresholdPaise });
  });

  app.post('/api/products/:id/reviews', requireAuth, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = reviewSchema.parse(req.body);
    const review = await transaction(prisma, (tx) => createReview(tx, req.user, id, input));
    res.status(201).json({ review });
  });

  /** One call for the homepage: curated rails computed from real orders, reviews and admin choices. */
  app.get('/api/home', async (_req, res) => {
    const take = { take: 8, skip: 0 };
    const [featuredRows, popular, newest, rated, deals, sections, stores] = await Promise.all([
      prisma.catalogProduct.findMany({ where: { featured: true, status: 'APPROVED' }, select: { id: true }, take: 8, orderBy: { updatedAt: 'desc' } }),
      searchCatalog(prisma, { sort: 'popular', inStock: true }, take),
      searchCatalog(prisma, { sort: 'newest', inStock: true }, take),
      searchCatalog(prisma, { sort: 'rating', minRating: 4 }, take),
      searchCatalog(prisma, { sort: 'discount', deals: true }, take),
      prisma.homeSection.findMany({ where: { published: true } }),
      prisma.sellerStore.findMany({ where: { status: 'APPROVED' }, include: { primaryCategory: true }, take: 6, orderBy: { createdAt: 'asc' } }),
    ]);
    const [featured, bestSellers, newArrivals, topRated, dealCards] = await Promise.all([
      productCards(prisma, featuredRows.map((r) => r.id)), productCards(prisma, popular.ids), productCards(prisma, newest.ids),
      productCards(prisma, rated.ids), productCards(prisma, deals.ids),
    ]);
    res.json({
      rails: { trending: featured.length ? featured : bestSellers, bestSellers, newArrivals, topRated, deals: dealCards },
      sections: Object.fromEntries(sections.map((s) => [s.id, { heading: s.heading, body: s.body, data: s.data }])),
      sellers: stores.map(publicStore),
    });
  });
}
