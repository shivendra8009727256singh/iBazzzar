// Seller product writes. New catalogue products and new offers go to moderation; price and stock changes don't.
import { DomainError } from '../../../../packages/shared/src/index.js';
import { audit } from '../lib/audit.js';
import { slugify } from '../lib/http.js';
import { randomToken } from '../lib/security.js';

export function buildSearchText({ name, brand, category, highlights = [], attributes = {}, variantLabels = [] }) {
  return [name, brand, category, ...highlights, ...Object.values(attributes), ...variantLabels].join(' ').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 4000);
}

async function uniqueSlug(tx, model, base) {
  let slug = slugify(base) || 'product';
  while (await tx[model].findUnique({ where: { slug } })) slug = `${slugify(base).slice(0, 70)}-${randomToken(3)}`;
  return slug;
}

async function assertOwnMedia(tx, storeId, urls) {
  if (!urls?.length) return [];
  const assets = await tx.mediaAsset.findMany({ where: { storeId, url: { in: urls } } });
  if (assets.length !== new Set(urls).size) throw new DomainError('Use photos uploaded by your store', 403);
  return assets;
}

async function brandId(tx, name) {
  const existing = await tx.brand.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (existing) return existing.id;
  return (await tx.brand.create({ data: { name, slug: await uniqueSlug(tx, 'brand', name) } })).id;
}

async function attributeRows(tx, attributes) {
  const rows = [];
  for (const [name, value] of Object.entries(attributes || {})) {
    const attr = await tx.productAttribute.upsert({ where: { name }, create: { name }, update: {} });
    rows.push({ attributeId: attr.id, value });
  }
  return rows;
}

async function createListing(tx, { storeId, variantId, input, actorId }) {
  if (await tx.sellerListing.findUnique({ where: { storeId_sku: { storeId, sku: input.sku } } })) throw new DomainError('You already use this SKU', 409, { sku: 'This SKU is already in use in your store' });
  const warehouse = await tx.warehouse.findFirst({ where: { storeId, isDefault: true } });
  if (!warehouse) throw new DomainError('Add a pickup address before listing products', 409);
  const listing = await tx.sellerListing.create({
    data: {
      storeId, variantId, sku: input.sku, pricePaise: input.pricePaise, mrpPaise: input.mrpPaise, moq: input.moq,
      bulkPackUnits: input.bulkPackUnits, wholesaleEnabled: input.wholesaleEnabled, codAllowed: input.codAllowed, returnable: input.returnable,
      status: 'PENDING',
      tiers: { create: input.tiers.map((t) => ({ minQty: t.minQty, pricePaise: t.pricePaise })) },
      inventory: { create: { warehouseId: warehouse.id, onHand: input.stock } },
    },
  });
  if (input.stock) await tx.stockMovement.create({ data: { listingId: listing.id, delta: input.stock, reason: 'RECEIVED', reference: 'Opening stock', actorId } });
  return listing;
}

/** A brand-new catalogue product with its first variant and the seller's offer. */
export async function createProduct(tx, { storeId, actorId, input }) {
  const category = await tx.category.findFirst({ where: { name: input.category, active: true } });
  if (!category) throw new DomainError('Please choose one of the current categories', 400, { category: 'Please choose one of the current categories' });
  const assets = await assertOwnMedia(tx, storeId, input.images);
  const product = await tx.catalogProduct.create({
    data: {
      slug: await uniqueSlug(tx, 'catalogProduct', `${input.brand} ${input.name}`), name: input.name, brandId: await brandId(tx, input.brand),
      categoryId: category.id, description: input.description, highlights: input.highlights, hsnCode: input.hsnCode ?? null,
      createdByStoreId: storeId, status: 'PENDING',
      searchText: buildSearchText({ name: input.name, brand: input.brand, category: category.name, highlights: input.highlights, attributes: input.attributes, variantLabels: [input.variantLabel] }),
      media: { create: input.images.map((url, i) => ({ url, alt: `${input.name} — photo ${i + 1}`, sortOrder: i, mediaAssetId: assets.find((a) => a.url === url)?.id })) },
      attributes: { create: await attributeRows(tx, input.attributes) },
    },
  });
  const variant = await tx.productVariant.create({
    data: { catalogProductId: product.id, slug: await uniqueSlug(tx, 'productVariant', `${input.brand} ${input.name} ${input.variantLabel === 'Standard' ? '' : input.variantLabel}`), label: input.variantLabel, weightGrams: input.weightGrams, attributes: input.attributes },
  });
  const listing = await createListing(tx, { storeId, variantId: variant.id, input, actorId });
  await audit(tx, { actorId, action: 'product.submitted', entityType: 'catalog_product', entityId: product.id, metadata: { listingId: listing.id } });
  return { product, variant, listing };
}

/** Adds a variant (another size or colour) to a catalogue product this store created. */
export async function createVariant(tx, { storeId, actorId, input }) {
  const product = await tx.catalogProduct.findUnique({ where: { id: input.catalogProductId }, include: { brand: true, variants: true } });
  if (!product || product.createdByStoreId !== storeId) throw new DomainError('Product not found', 404);
  if (product.variants.some((v) => v.label.toLowerCase() === input.variantLabel.toLowerCase())) throw new DomainError('This product already has a variant with that name', 409);
  const variant = await tx.productVariant.create({
    data: { catalogProductId: product.id, slug: await uniqueSlug(tx, 'productVariant', `${product.brand.name} ${product.name} ${input.variantLabel}`), label: input.variantLabel, weightGrams: input.weightGrams, attributes: input.attributes, sortOrder: product.variants.length },
  });
  const listing = await createListing(tx, { storeId, variantId: variant.id, input, actorId });
  await tx.catalogProduct.update({ where: { id: product.id }, data: { searchText: `${product.searchText} ${input.variantLabel.toLowerCase()}`.slice(0, 4000) } });
  await audit(tx, { actorId, action: 'variant.submitted', entityType: 'catalog_product', entityId: product.id, metadata: { variantId: variant.id } });
  return { variant, listing };
}

/** Sell an existing catalogue variant from your own store (another seller's product page gains your offer). */
export async function createOffer(tx, { storeId, actorId, input }) {
  const variant = await tx.productVariant.findUnique({ where: { id: input.variantId }, include: { product: true } });
  if (!variant || variant.product.status !== 'APPROVED') throw new DomainError('Product not found', 404);
  if (await tx.sellerListing.findUnique({ where: { storeId_variantId: { storeId, variantId: variant.id } } })) throw new DomainError('You already sell this item. Edit your existing offer instead.', 409);
  const listing = await createListing(tx, { storeId, variantId: variant.id, input, actorId });
  await audit(tx, { actorId, action: 'offer.submitted', entityType: 'listing', entityId: listing.id });
  return listing;
}

/** Commercial terms. Changing them doesn't need moderation, but price can't exceed MRP and tiers must stay below price. */
export async function updateListing(tx, { storeId, actorId, listingId, input }) {
  const listing = await tx.sellerListing.findUnique({ where: { id: listingId }, include: { tiers: true } });
  if (!listing || listing.storeId !== storeId) throw new DomainError('Listing not found', 404);
  const price = input.pricePaise ?? Number(listing.pricePaise);
  const mrp = input.mrpPaise ?? Number(listing.mrpPaise);
  const moq = input.moq ?? listing.moq;
  if (mrp < price) throw new DomainError('MRP cannot be lower than your selling price', 400, { mrpPaise: 'MRP cannot be lower than your selling price' });
  const tiers = input.tiers ?? listing.tiers.map((t) => ({ minQty: t.minQty, pricePaise: Number(t.pricePaise) }));
  for (const t of tiers) {
    if (t.minQty < moq) throw new DomainError('Wholesale tiers must start at or above the MOQ', 400);
    if (t.pricePaise > price) throw new DomainError('Wholesale prices cannot be higher than the retail price', 400);
  }
  const { paused, tiers: _t, ...rest } = input;
  let status = listing.status;
  if (paused === true && status === 'APPROVED') status = 'PAUSED';
  if (paused === false && status === 'PAUSED') status = 'APPROVED';
  const updated = await tx.sellerListing.update({ where: { id: listingId }, data: { ...rest, status } });
  if (input.tiers) {
    await tx.priceTier.deleteMany({ where: { listingId } });
    await tx.priceTier.createMany({ data: input.tiers.map((t) => ({ listingId, minQty: t.minQty, pricePaise: t.pricePaise })) });
  }
  await audit(tx, { actorId, action: 'listing.updated', entityType: 'listing', entityId: listingId, metadata: { fields: Object.keys(input) } });
  return updated;
}

/** Product page content. Only the store that created the product may edit it, and edits go back to moderation. */
export async function updateContent(tx, { storeId, actorId, productId, input }) {
  const product = await tx.catalogProduct.findUnique({ where: { id: productId }, include: { brand: true, category: true, variants: true, attributes: { include: { attribute: true } } } });
  if (!product || product.createdByStoreId !== storeId) throw new DomainError('Product not found', 404);
  const data = { ...input, status: 'PENDING' };
  delete data.images; delete data.attributes;
  if (input.images) {
    const assets = await assertOwnMedia(tx, storeId, input.images);
    await tx.productMedia.deleteMany({ where: { catalogProductId: productId } });
    await tx.productMedia.createMany({ data: input.images.map((url, i) => ({ catalogProductId: productId, url, alt: `${input.name ?? product.name} — photo ${i + 1}`, sortOrder: i, mediaAssetId: assets.find((a) => a.url === url)?.id })) });
  }
  if (input.attributes) {
    await tx.productAttributeValue.deleteMany({ where: { catalogProductId: productId } });
    await tx.productAttributeValue.createMany({ data: (await attributeRows(tx, input.attributes)).map((r) => ({ ...r, catalogProductId: productId })) });
  }
  const attributes = input.attributes ?? Object.fromEntries(product.attributes.map((a) => [a.attribute.name, a.value]));
  data.searchText = buildSearchText({ name: input.name ?? product.name, brand: product.brand.name, category: product.category.name, highlights: input.highlights ?? product.highlights, attributes, variantLabels: product.variants.map((v) => v.label) });
  const updated = await tx.catalogProduct.update({ where: { id: productId }, data });
  await audit(tx, { actorId, action: 'product.edited', entityType: 'catalog_product', entityId: productId, metadata: { fields: Object.keys(input) } });
  return updated;
}
