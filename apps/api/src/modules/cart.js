// Cart and wishlist. Guests keep a cart in the browser and get server quotes; signed-in carts live in the database and
// follow the customer across devices. On sign-in the guest cart is merged in (quantities added, capped at stock).
import { z } from 'zod';
import { DomainError } from '../../../../packages/shared/src/index.js';
import { cartQuoteSchema, cartItemSchema, cartMergeSchema, modeSchema, uuid } from '../../../../packages/validation/src/index.js';
import { requireAuth } from '../http/middleware.js';
import { transaction } from '../lib/db.js';
import { quote } from '../services/pricing.js';
import { loadListings, publicListing, productCards } from '../services/catalog.js';

const MAX_LINES = 100;

/** Browser-facing quote: everything needed to show the cart and checkout totals. */
export function publicQuote(q) {
  return {
    mode: q.mode,
    lines: q.lines.map((l) => ({
      listingId: l.listingId, name: l.name, variantLabel: l.variantLabel, image: l.image, productSlug: l.productSlug,
      quantity: l.quantity, unitPaise: l.unitPaise, mrpPaise: l.mrpPaise, priceSource: l.priceSource,
      lineTotalPaise: l.lineTotalPaise, discountPaise: l.discountPaise, totalPaise: l.totalPaise,
      taxRateBps: l.taxRateBps, taxPaise: l.taxPaise, sellerId: l.storeId, sellerName: l.sellerName, returnable: l.returnable,
    })),
    sellers: q.groups.map((g) => ({
      sellerId: g.storeId, sellerName: g.sellerName, goodsPaise: g.goodsPaise, shippingPaise: g.shippingPaise, taxPaise: g.taxPaise,
      totalPaise: g.totalPaise, estimate: g.estimate, codAllowed: g.codAllowed,
    })),
    problems: q.problems,
    coupon: q.coupon,
    subtotalPaise: q.subtotalPaise, discountPaise: q.discountPaise, shippingPaise: q.shippingPaise, codFeePaise: q.codFeePaise,
    taxPaise: q.taxPaise, totalPaise: q.totalPaise, serviceable: q.serviceable, payment: q.payment,
    freeShippingThresholdPaise: q.freeShippingThresholdPaise,
  };
}

async function cartFor(db, userId) {
  return db.cart.upsert({ where: { userId }, create: { userId }, update: {}, include: { items: { orderBy: { addedAt: 'asc' } } } });
}

async function cartView(db, cart) {
  const listings = await loadListings(db, cart.items.map((i) => i.listingId));
  const toItem = (i) => {
    const l = listings.get(i.listingId);
    return { listingId: i.listingId, quantity: i.quantity, savedForLater: i.savedForLater, available: !!l?.sellable && l.stock > 0, product: l ? publicListing(l) : null };
  };
  return {
    mode: cart.mode,
    couponCode: cart.couponCode,
    items: cart.items.filter((i) => !i.savedForLater).map(toItem),
    savedForLater: cart.items.filter((i) => i.savedForLater).map(toItem),
  };
}

export function registerCart(app, { prisma }) {
  // Pricing for any list of lines — used by guests and by checkout previews.
  app.post('/api/cart/quote', async (req, res) => {
    const input = cartQuoteSchema.parse(req.body);
    const q = await quote(prisma, { ...input, userId: req.user?.id });
    res.json({ quote: publicQuote(q) });
  });

  app.get('/api/cart', requireAuth, async (req, res) => {
    res.json({ cart: await cartView(prisma, await cartFor(prisma, req.user.id)) });
  });

  app.put('/api/cart/items', requireAuth, async (req, res) => {
    const input = cartItemSchema.parse(req.body);
    const cart = await transaction(prisma, async (tx) => {
      const c = await cartFor(tx, req.user.id);
      if (input.quantity === 0) {
        await tx.cartItem.deleteMany({ where: { cartId: c.id, listingId: input.listingId } });
      } else {
        const [l] = [...(await loadListings(tx, [input.listingId])).values()];
        if (!l?.sellable) throw new DomainError('This item is no longer available', 409);
        if (!c.items.some((i) => i.listingId === input.listingId) && c.items.length >= MAX_LINES) throw new DomainError('Your cart is full', 409);
        await tx.cartItem.upsert({
          where: { cartId_listingId: { cartId: c.id, listingId: input.listingId } },
          create: { cartId: c.id, listingId: input.listingId, quantity: Math.min(input.quantity, Math.max(1, l.stock)), savedForLater: input.savedForLater ?? false },
          update: { quantity: Math.min(input.quantity, Math.max(1, l.stock)), ...(input.savedForLater !== undefined ? { savedForLater: input.savedForLater } : {}) },
        });
      }
      await tx.cart.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
      return cartFor(tx, req.user.id);
    });
    res.json({ cart: await cartView(prisma, cart) });
  });

  app.patch('/api/cart', requireAuth, async (req, res) => {
    const input = z.object({ mode: modeSchema.optional(), couponCode: z.string().trim().toUpperCase().max(30).nullable().optional() }).parse(req.body);
    const c = await cartFor(prisma, req.user.id);
    await prisma.cart.update({ where: { id: c.id }, data: input });
    res.json({ cart: await cartView(prisma, await cartFor(prisma, req.user.id)) });
  });

  app.post('/api/cart/merge', requireAuth, async (req, res) => {
    const input = cartMergeSchema.parse(req.body);
    const cart = await transaction(prisma, async (tx) => {
      const c = await cartFor(tx, req.user.id);
      const listings = await loadListings(tx, input.items.map((i) => i.listingId));
      for (const item of input.items) {
        const l = listings.get(item.listingId);
        if (!l?.sellable) continue;
        const existing = c.items.find((i) => i.listingId === item.listingId);
        const quantity = Math.min((existing?.quantity ?? 0) + item.quantity, Math.max(1, l.stock), 10000);
        await tx.cartItem.upsert({
          where: { cartId_listingId: { cartId: c.id, listingId: item.listingId } },
          create: { cartId: c.id, listingId: item.listingId, quantity }, update: { quantity, savedForLater: false },
        });
      }
      if (input.mode) await tx.cart.update({ where: { id: c.id }, data: { mode: input.mode } });
      return cartFor(tx, req.user.id);
    });
    res.json({ cart: await cartView(prisma, cart) });
  });

  // Wishlist (catalogue products, so it survives a seller changing their offer).
  app.get('/api/wishlist', requireAuth, async (req, res) => {
    const rows = await prisma.wishlistItem.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ items: await productCards(prisma, rows.map((r) => r.catalogProductId)), ids: rows.map((r) => r.catalogProductId) });
  });
  app.put('/api/wishlist/:productId', requireAuth, async (req, res) => {
    const catalogProductId = uuid.parse(req.params.productId);
    if (!await prisma.catalogProduct.findFirst({ where: { id: catalogProductId, status: 'APPROVED' } })) throw new DomainError('Product not found', 404);
    if (await prisma.wishlistItem.count({ where: { userId: req.user.id } }) >= 200) throw new DomainError('Your wishlist is full', 409);
    await prisma.wishlistItem.upsert({ where: { userId_catalogProductId: { userId: req.user.id, catalogProductId } }, create: { userId: req.user.id, catalogProductId }, update: {} });
    res.json({ ok: true });
  });
  app.delete('/api/wishlist/:productId', requireAuth, async (req, res) => {
    await prisma.wishlistItem.deleteMany({ where: { userId: req.user.id, catalogProductId: uuid.parse(req.params.productId) } });
    res.json({ ok: true });
  });
  app.post('/api/wishlist/merge', requireAuth, async (req, res) => {
    const { ids } = z.object({ ids: z.array(uuid).max(200) }).parse(req.body);
    const valid = await prisma.catalogProduct.findMany({ where: { id: { in: ids }, status: 'APPROVED' }, select: { id: true } });
    await prisma.wishlistItem.createMany({ data: valid.map((p) => ({ userId: req.user.id, catalogProductId: p.id })), skipDuplicates: true });
    res.json({ ok: true });
  });
}
