// Authoritative pricing. The browser shows this quote; checkout recomputes it inside the transaction and never trusts
// client-side prices. Prices are GST-inclusive (Indian retail norm); tax is split out per line for invoices.
import {
  DomainError, allocate, gstSplit, unitPrice, assertQuantity, couponDiscount, shippingFee, deliveryEstimate,
  stateCode, SERVICE_GST_BPS, money,
} from '../../../../packages/shared/src/index.js';
import { loadListings } from './catalog.js';
import { getSetting } from './settings.js';

/**
 * Prices a set of lines.
 * @param {object} input { items:[{listingId,quantity}], mode, couponCode?, state?, pincode?, userId?, paymentMethod? }
 * @returns a full quote: lines, per-seller groups with shipping and GST, totals and payment options.
 */
export async function quote(db, input, { at = new Date(), listings: preloaded } = {}) {
  const mode = input.mode ?? 'RETAIL';
  if (!input.items?.length) throw new DomainError('Your cart is empty');
  const quantities = new Map();
  for (const item of input.items) quantities.set(item.listingId, (quantities.get(item.listingId) || 0) + item.quantity);

  const listings = preloaded ?? await loadListings(db, [...quantities.keys()], at);
  const shipping = await getSetting(db, 'shipping');
  const placeOfSupply = input.state ? stateCode(input.state) : null;
  const problems = [];

  // 1. Lines at unit price.
  const lines = [];
  for (const [listingId, quantity] of quantities) {
    const l = listings.get(listingId);
    if (!l || !l.sellable) { problems.push({ listingId, message: 'This item is no longer available' }); continue; }
    try { assertQuantity(l, quantity, mode); } catch (e) { problems.push({ listingId, message: e.message }); continue; }
    if (quantity > l.stock) { problems.push({ listingId, message: l.stock ? `Only ${l.stock} left in stock` : 'Out of stock' }); continue; }
    const { unitPaise, source } = unitPrice(l, quantity, mode, l.promotion?.discountBps ?? 0);
    lines.push({
      listingId, quantity, unitPaise, priceSource: source, lineTotalPaise: unitPaise * quantity,
      mrpPaise: l.mrpPaise, name: l.name, variantLabel: l.variantLabel, sku: l.sku, image: l.image, hsnCode: l.hsnCode,
      catalogProductId: l.catalogProductId, storeId: l.storeId, sellerName: l.sellerName, taxRateBps: l.taxRateBps,
      weightGrams: l.weightGrams, codAllowed: l.codAllowed, returnable: l.returnable, productSlug: l.productSlug,
    });
  }
  if (input.strict && problems.length) throw new DomainError(problems[0].message, 409, { items: problems });
  if (!lines.length) {
    if (problems.length) throw new DomainError(problems[0].message, 409, { items: problems });
    throw new DomainError('Your cart is empty');
  }

  const subtotalPaise = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  if (!Number.isSafeInteger(subtotalPaise)) throw new DomainError('Order total is too large');

  // 2. Coupon, shared across lines in proportion to their value.
  let coupon = null;
  let discountPaise = 0;
  if (input.couponCode) {
    // Coupon problems carry { coupon } so the website can remove just the coupon and keep the rest of the cart priced.
    try {
      coupon = await db.coupon.findUnique({ where: { code: input.couponCode } });
      if (!coupon) throw new DomainError('We couldn’t find that coupon code', 404);
      const normalised = { ...coupon, minOrderPaise: Number(coupon.minOrderPaise), maxDiscountPaise: coupon.maxDiscountPaise == null ? null : Number(coupon.maxDiscountPaise) };
      discountPaise = couponDiscount(normalised, subtotalPaise, mode, at.getTime());
      if (input.userId) {
        const used = await couponUsesBy(db, coupon.id, input.userId);
        if (used >= coupon.perUserLimit) throw new DomainError('You have already used this coupon', 409);
      }
    } catch (e) {
      if (e instanceof DomainError) throw new DomainError(e.message, e.status, { coupon: input.couponCode });
      throw e;
    }
  }
  const shares = allocate(discountPaise, lines.map((l) => l.lineTotalPaise));
  lines.forEach((l, i) => { l.discountPaise = shares[i]; l.totalPaise = l.lineTotalPaise - shares[i]; });

  // 3. Per seller: shipping, delivery estimate and GST.
  const groups = [];
  for (const storeId of [...new Set(lines.map((l) => l.storeId))]) {
    const store = listings.get(lines.find((l) => l.storeId === storeId).listingId).store;
    const own = lines.filter((l) => l.storeId === storeId);
    const goods = own.reduce((s, l) => s + l.totalPaise, 0);
    const weight = own.reduce((s, l) => s + l.weightGrams * l.quantity, 0);
    const fee = shippingFee({ subtotalPaise: own.reduce((s, l) => s + l.lineTotalPaise, 0), weightGrams: weight }, shipping);
    const fromPincode = store.pickupAddress?.pincode;
    const estimate = input.pincode ? deliveryEstimate(fromPincode, input.pincode, store.handlingDays, shipping) : null;
    const intra = placeOfSupply ? placeOfSupply === store.stateCode : null;
    let taxPaise = 0;
    for (const l of own) {
      Object.assign(l, intra == null ? { taxablePaise: null, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: null } : gstSplit(l.totalPaise, l.taxRateBps, intra));
      taxPaise += l.taxPaise ?? 0;
    }
    const shippingTax = intra == null ? null : gstSplit(fee, store.gstRegistered ? SERVICE_GST_BPS : 0, intra);
    groups.push({
      storeId, sellerName: store.name, items: own.map((l) => l.listingId),
      goodsPaise: goods, shippingPaise: fee, shippingTax, taxPaise: intra == null ? null : taxPaise + (shippingTax?.taxPaise ?? 0),
      totalPaise: goods + fee, weightGrams: weight, intraState: intra, estimate,
      codAllowed: store.codEnabled && own.every((l) => l.codAllowed),
    });
  }

  const shippingPaise = groups.reduce((s, g) => s + g.shippingPaise, 0);
  const goodsPaise = subtotalPaise - discountPaise;
  const serviceable = groups.every((g) => !g.estimate || g.estimate.serviceable);
  const codEligible = mode === 'RETAIL' && shipping.codEnabled && groups.every((g) => g.codAllowed)
    && goodsPaise + shippingPaise + shipping.codFeePaise <= shipping.codMaxOrderPaise
    && (!input.pincode || groups.every((g) => g.estimate?.codAvailable));
  const codFeePaise = input.paymentMethod === 'COD' ? shipping.codFeePaise : 0;
  const taxPaise = placeOfSupply
    ? groups.reduce((s, g) => s + g.taxPaise, 0) + (codFeePaise ? gstSplit(codFeePaise, SERVICE_GST_BPS, false).taxPaise : 0)
    : null;

  return {
    mode,
    lines,
    groups,
    problems,
    coupon: coupon ? { code: coupon.code, description: coupon.description } : null,
    subtotalPaise,
    discountPaise,
    shippingPaise,
    codFeePaise,
    taxPaise, // included in the total (GST-inclusive prices); null until a delivery state is known
    totalPaise: goodsPaise + shippingPaise + codFeePaise,
    serviceable,
    payment: {
      cod: { available: codEligible, feePaise: shipping.codFeePaise, reason: codEligible ? null : codReason(mode, shipping, groups, goodsPaise + shippingPaise) },
      bankTransfer: { available: mode === 'BUSINESS' },
    },
    freeShippingThresholdPaise: shipping.freeShippingThresholdPaise,
  };
}

/** How many of this customer's orders (not cancelled) used the coupon. */
export function couponUsesBy(db, couponId, userId) {
  return db.couponRedemption.count({ where: { couponId, userId, order: { status: { not: 'CANCELLED' } } } });
}

function codReason(mode, shipping, groups, total) {
  if (mode !== 'RETAIL') return 'Cash on delivery is for personal orders. Business orders can pay online or by bank transfer.';
  if (!shipping.codEnabled) return 'Cash on delivery is currently unavailable.';
  if (!groups.every((g) => g.codAllowed)) return 'One or more sellers in your cart don’t offer cash on delivery for these items.';
  if (total + shipping.codFeePaise > shipping.codMaxOrderPaise) return `Cash on delivery is available for orders up to ${money(shipping.codMaxOrderPaise)}.`;
  return 'Cash on delivery isn’t available for this PIN code.';
}
