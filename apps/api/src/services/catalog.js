// Catalogue reads. Search, filtering, sorting and pagination run in PostgreSQL; nothing loads whole tables.
import { Prisma } from '../lib/db.js';
import { toPaise } from '../lib/db.js';

export const DEFAULT_GST_BPS = 1800;

const listingInclude = {
  tiers: { orderBy: { minQty: 'asc' } },
  inventory: true,
  store: { select: { id: true, name: true, slug: true, status: true, stateCode: true, pickupAddress: true, codEnabled: true, handlingDays: true, gstRegistered: true } },
  variant: {
    include: {
      product: {
        include: {
          brand: true,
          category: { include: { taxClass: true } },
          taxClass: true,
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  },
};

/** Live flash-deal discount (basis points) per listing. */
export async function activePromotions(db, listingIds, at = new Date()) {
  if (!listingIds.length) return new Map();
  const rows = await db.promotionItem.findMany({
    where: { listingId: { in: listingIds }, promotion: { active: true, startsAt: { lte: at }, endsAt: { gt: at } } },
    include: { promotion: { select: { id: true, name: true, discountBps: true, endsAt: true } } }, relationLoadStrategy: 'join',
  });
  const best = new Map();
  for (const r of rows) {
    const current = best.get(r.listingId);
    if (!current || r.promotion.discountBps > current.discountBps) best.set(r.listingId, r.promotion);
  }
  return best;
}

export function taxRateOf(product) {
  return product.taxClass?.gstRateBps ?? product.category?.taxClass?.gstRateBps ?? DEFAULT_GST_BPS;
}

/** Flattens a listing row (with listingInclude) into the shape pricing and the API use. */
export function shapeListing(row, promotion) {
  const product = row.variant.product;
  const onHand = row.inventory.reduce((s, b) => s + b.onHand, 0);
  const reserved = row.inventory.reduce((s, b) => s + b.reserved, 0);
  const pricePaise = toPaise(row.pricePaise);
  const dealPaise = promotion ? pricePaise - Math.floor((pricePaise * promotion.discountBps) / 10000) : null;
  return {
    id: row.id,
    listingId: row.id,
    sku: row.sku,
    status: row.status,
    storeId: row.storeId,
    store: row.store,
    sellerName: row.store.name,
    sellable: row.status === 'APPROVED' && row.store.status === 'APPROVED' && product.status === 'APPROVED',
    variantId: row.variantId,
    variantLabel: row.variant.label,
    variantSlug: row.variant.slug,
    weightGrams: row.variant.weightGrams,
    catalogProductId: product.id,
    productSlug: product.slug,
    name: product.name,
    brand: product.brand.name,
    category: product.category.name,
    categoryId: product.categoryId,
    hsnCode: product.hsnCode,
    // A seller not registered under GST cannot charge GST; their price carries no tax component.
    taxRateBps: row.store.gstRegistered ? taxRateOf(product) : 0,
    image: product.media[0]?.url ?? '/products/placeholder.svg',
    images: product.media.map((m) => m.url),
    pricePaise,
    mrpPaise: toPaise(row.mrpPaise),
    dealPaise,
    effectivePaise: dealPaise ?? pricePaise,
    promotion: promotion ? { id: promotion.id, name: promotion.name, discountBps: promotion.discountBps, endsAt: promotion.endsAt } : null,
    moq: row.moq,
    bulkPackUnits: row.bulkPackUnits,
    wholesaleEnabled: row.wholesaleEnabled,
    codAllowed: row.codAllowed,
    returnable: row.returnable,
    tiers: row.tiers.map((t) => ({ minQty: t.minQty, pricePaise: toPaise(t.pricePaise) })),
    stock: Math.max(0, onHand - reserved),
    onHand,
    reserved,
    demo: row.demo,
  };
}

/** Loads listings by id with everything pricing needs. */
// Nested relations load in one SQL query (relationLoadStrategy 'join'), and promotions load in parallel:
// with a remote database every extra round trip adds latency to every product page and list.
export async function loadListings(db, ids, at = new Date()) {
  const unique = [...new Set(ids)];
  const [rows, promos] = await Promise.all([
    db.sellerListing.findMany({ where: { id: { in: unique } }, include: listingInclude, relationLoadStrategy: 'join' }),
    activePromotions(db, unique, at),
  ]);
  return new Map(rows.map((r) => [r.id, shapeListing(r, promos.get(r.id))]));
}

export async function loadListingsWhere(db, where, at = new Date()) {
  const rows = await db.sellerListing.findMany({ where, include: listingInclude, relationLoadStrategy: 'join' });
  const promos = await activePromotions(db, rows.map((r) => r.id), at);
  return rows.map((r) => shapeListing(r, promos.get(r.id)));
}

export const sellableListingWhere = {
  status: 'APPROVED',
  store: { status: 'APPROVED' },
  variant: { product: { status: 'APPROVED' } },
};

// ───────────── Search ─────────────

const SORTS = {
  relevance: Prisma.sql`score DESC, cp."createdAt" DESC`,
  newest: Prisma.sql`cp."createdAt" DESC`,
  'price-asc': Prisma.sql`best_price ASC, cp."createdAt" DESC`,
  'price-desc': Prisma.sql`best_price DESC, cp."createdAt" DESC`,
  rating: Prisma.sql`avg_rating DESC NULLS LAST, review_count DESC`,
  popular: Prisma.sql`sold DESC, cp."createdAt" DESC`,
  discount: Prisma.sql`best_discount DESC, cp."createdAt" DESC`,
};

/**
 * One result per catalogue product, priced at its best live offer.
 * Typo tolerance: words of 4+ letters match with pg_trgm word_similarity, so "hedphones" still finds headphones.
 */
export async function searchCatalog(db, filters, { take, skip }) {
  const terms = String(filters.q || '').toLowerCase().split(/\s+/).map((t) => t.replace(/[%_\\]/g, '')).filter(Boolean).slice(0, 6);
  const conditions = [
    Prisma.sql`cp.status = 'APPROVED'`,
    Prisma.sql`l.status = 'APPROVED'`,
    Prisma.sql`s.status = 'APPROVED'`,
  ];
  for (const term of terms) {
    conditions.push(term.length >= 4
      ? Prisma.sql`(cp."searchText" ILIKE ${'%' + term + '%'} OR word_similarity(${term}, cp."searchText") >= 0.5)`
      : Prisma.sql`cp."searchText" ILIKE ${'%' + term + '%'}`);
  }
  if (filters.category) conditions.push(Prisma.sql`(c.slug = ${filters.category} OR c.name = ${filters.category} OR pc.slug = ${filters.category})`);
  if (filters.brands?.length) conditions.push(Prisma.sql`(b.slug = ANY(${filters.brands}) OR b.name = ANY(${filters.brands}))`);
  if (filters.seller) conditions.push(Prisma.sql`(s.slug = ${filters.seller} OR s.id::text = ${filters.seller})`);
  if (filters.wholesale) conditions.push(Prisma.sql`l."wholesaleEnabled" = true`);

  const scoreSql = terms.length
    ? Prisma.join(terms.map((t) => Prisma.sql`(CASE WHEN cp.name ILIKE ${'%' + t + '%'} THEN 3 WHEN cp."searchText" ILIKE ${'%' + t + '%'} THEN 2 ELSE word_similarity(${t}, cp."searchText") END)`), ' + ')
    : Prisma.sql`0`;

  const having = [];
  if (filters.minPrice != null) having.push(Prisma.sql`MIN(o.effective) >= ${filters.minPrice}`);
  if (filters.maxPrice != null) having.push(Prisma.sql`MIN(o.effective) <= ${filters.maxPrice}`);
  if (filters.inStock) having.push(Prisma.sql`SUM(o.available) > 0`);
  if (filters.minRating) having.push(Prisma.sql`COALESCE(MAX(r.avg_rating), 0) >= ${filters.minRating}`);
  if (filters.deals) having.push(Prisma.sql`MAX(o.deal_bps) > 0`);
  const havingSql = having.length ? Prisma.sql`HAVING ${Prisma.join(having, ' AND ')}` : Prisma.empty;
  const sort = SORTS[filters.sort] ?? (terms.length ? SORTS.relevance : SORTS.popular);

  const base = Prisma.sql`
    FROM catalog_products cp
    JOIN categories c ON c.id = cp."categoryId"
    LEFT JOIN categories pc ON pc.id = c."parentId"
    JOIN brands b ON b.id = cp."brandId"
    JOIN product_variants v ON v."catalogProductId" = cp.id
    JOIN seller_listings l ON l."variantId" = v.id
    JOIN seller_stores s ON s.id = l."storeId"
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(p."discountBps"), 0) AS deal_bps
      FROM promotion_items pi JOIN promotions p ON p.id = pi."promotionId"
      WHERE pi."listingId" = l.id AND p.active AND p."startsAt" <= now() AND p."endsAt" > now()
    ) promo
    CROSS JOIN LATERAL (
      SELECT l."pricePaise" - floor(l."pricePaise" * promo.deal_bps / 10000) AS effective,
             promo.deal_bps,
             COALESCE((SELECT SUM(ib."onHand" - ib.reserved) FROM inventory_balances ib WHERE ib."listingId" = l.id), 0) AS available,
             (l."mrpPaise" - (l."pricePaise" - floor(l."pricePaise" * promo.deal_bps / 10000))) * 10000 / l."mrpPaise" AS discount_bps
    ) o
    LEFT JOIN LATERAL (
      SELECT AVG(rv.rating)::float AS avg_rating, COUNT(*)::int AS review_count
      FROM reviews rv WHERE rv."catalogProductId" = cp.id AND rv.status = 'PUBLISHED'
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oi.quantity), 0)::int AS sold FROM order_items oi
      JOIN orders od ON od.id = oi."orderId"
      WHERE oi."catalogProductId" = cp.id AND od.status <> 'CANCELLED' AND od.status <> 'AWAITING_PAYMENT'
    ) sales ON true
    WHERE ${Prisma.join(conditions, ' AND ')}`;

  const rows = await db.$queryRaw`
    SELECT cp.id, MIN(o.effective)::bigint AS best_price, MAX(o.discount_bps)::int AS best_discount,
           MAX(r.avg_rating) AS avg_rating, MAX(r.review_count) AS review_count, MAX(sales.sold) AS sold,
           MAX(${scoreSql}) AS score, COUNT(*) OVER() AS total
    ${base}
    GROUP BY cp.id
    ${havingSql}
    ORDER BY ${sort}
    LIMIT ${take} OFFSET ${skip}`;

  const total = rows.length ? Number(rows[0].total) : await countOnly(db, base, havingSql);
  return { ids: rows.map((r) => r.id), total };
}

async function countOnly(db, base, havingSql) {
  const [row] = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM (SELECT cp.id ${base} GROUP BY cp.id ${havingSql}) x`;
  return row.n;
}

/** Facet values (brands and price range) for the current category or search, for filter UIs. */
export async function facets(db, { category }) {
  const where = category ? Prisma.sql`AND (c.slug = ${category} OR c.name = ${category} OR pc.slug = ${category})` : Prisma.empty;
  const brands = await db.$queryRaw`
    SELECT b.name, b.slug, COUNT(DISTINCT cp.id)::int AS count
    FROM catalog_products cp JOIN brands b ON b.id = cp."brandId" JOIN categories c ON c.id = cp."categoryId"
    LEFT JOIN categories pc ON pc.id = c."parentId"
    JOIN product_variants v ON v."catalogProductId" = cp.id JOIN seller_listings l ON l."variantId" = v.id JOIN seller_stores s ON s.id = l."storeId"
    WHERE cp.status = 'APPROVED' AND l.status = 'APPROVED' AND s.status = 'APPROVED' ${where}
    GROUP BY b.name, b.slug ORDER BY count DESC, b.name LIMIT 30`;
  return { brands };
}

/** Rating summary per catalogue product. */
export async function ratings(db, productIds) {
  if (!productIds.length) return new Map();
  const rows = await db.review.groupBy({ by: ['catalogProductId'], where: { catalogProductId: { in: productIds }, status: 'PUBLISHED' }, _avg: { rating: true }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.catalogProductId, { average: Math.round(r._avg.rating * 10) / 10, count: r._count._all }]));
}

/** Product cards for the given catalogue product ids, in that order. Each card shows its best sellable offer. */
export async function productCards(db, productIds) {
  if (!productIds.length) return [];
  const listings = await loadListingsWhere(db, { ...sellableListingWhere, variant: { catalogProductId: { in: productIds }, product: { status: 'APPROVED' } } });
  const rating = await ratings(db, productIds);
  const byProduct = new Map();
  for (const l of listings) {
    const list = byProduct.get(l.catalogProductId) ?? [];
    list.push(l);
    byProduct.set(l.catalogProductId, list);
  }
  return productIds.map((id) => {
    const offers = byProduct.get(id);
    if (!offers?.length) return null;
    const best = buyBox(offers);
    return {
      ...publicListing(best),
      rating: rating.get(id) ?? null,
      offerCount: new Set(offers.map((o) => o.storeId)).size,
      variantCount: new Set(offers.map((o) => o.variantId)).size,
    };
  }).filter(Boolean);
}

/** The offer shown by default: in stock first, then lowest effective price, then the earliest listed. */
export function buyBox(offers) {
  return [...offers].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.effectivePaise - b.effectivePaise)[0];
}

/** Public view of a listing — no internal stock numbers beyond availability, no store tax details. */
export function publicListing(l) {
  return {
    id: l.id,
    listingId: l.id,
    catalogProductId: l.catalogProductId,
    slug: l.variantSlug,
    productSlug: l.productSlug,
    name: l.name,
    brand: l.brand,
    category: l.category,
    variantId: l.variantId,
    variantLabel: l.variantLabel,
    image: l.image,
    images: l.images,
    pricePaise: l.effectivePaise,
    listPricePaise: l.pricePaise,
    mrpPaise: l.mrpPaise,
    promotion: l.promotion,
    stock: l.stock,
    moq: l.moq,
    bulkPackUnits: l.bulkPackUnits,
    wholesaleEnabled: l.wholesaleEnabled,
    tiers: l.wholesaleEnabled ? l.tiers : [],
    codAllowed: l.codAllowed,
    returnable: l.returnable,
    taxRateBps: l.taxRateBps,
    hsnCode: l.hsnCode,
    sellerId: l.storeId,
    sellerName: l.sellerName,
    sellerSlug: l.store.slug,
    demo: l.demo,
  };
}
