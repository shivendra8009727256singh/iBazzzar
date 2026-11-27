// Pure commerce rules shared by the API and the web app.
// Every amount is an integer number of paise. Nothing in this file touches the database.
import { DomainError } from './errors.js';

export const money = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);

// ───────────── Indian states and GST state codes ─────────────

export const indianStates = [
  ['35', 'Andaman and Nicobar Islands'], ['37', 'Andhra Pradesh'], ['12', 'Arunachal Pradesh'], ['18', 'Assam'],
  ['10', 'Bihar'], ['04', 'Chandigarh'], ['22', 'Chhattisgarh'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['07', 'Delhi'], ['30', 'Goa'], ['24', 'Gujarat'], ['06', 'Haryana'], ['02', 'Himachal Pradesh'],
  ['01', 'Jammu and Kashmir'], ['20', 'Jharkhand'], ['29', 'Karnataka'], ['32', 'Kerala'], ['38', 'Ladakh'],
  ['31', 'Lakshadweep'], ['23', 'Madhya Pradesh'], ['27', 'Maharashtra'], ['14', 'Manipur'], ['17', 'Meghalaya'],
  ['15', 'Mizoram'], ['13', 'Nagaland'], ['21', 'Odisha'], ['34', 'Puducherry'], ['03', 'Punjab'],
  ['08', 'Rajasthan'], ['11', 'Sikkim'], ['33', 'Tamil Nadu'], ['36', 'Telangana'], ['16', 'Tripura'],
  ['09', 'Uttar Pradesh'], ['05', 'Uttarakhand'], ['19', 'West Bengal'],
].map(([code, name]) => ({ code, name }));

const byName = new Map(indianStates.map((s) => [s.name.toLowerCase(), s.code]));

/** GST state code for a state or union territory name, or null when the name is not recognised. */
export function stateCode(name) {
  return byName.get(String(name || '').trim().toLowerCase()) ?? null;
}

export function assertStateCode(name) {
  const code = stateCode(name);
  if (!code) throw new DomainError('Please choose a valid Indian state or union territory');
  return code;
}

// ───────────── Allocation and rounding ─────────────

/**
 * Splits an integer amount across weights so the parts always add up exactly (largest remainder method).
 * Used to share an order-level discount across lines without losing or creating a paisa.
 */
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) parts[order[k][1]]++;
  return parts;
}

// ───────────── GST ─────────────

/**
 * Splits a GST-inclusive amount into taxable value and tax.
 * Intra-state supplies (seller and place of supply in the same state) are CGST + SGST; otherwise IGST.
 */
export function gstSplit(inclusivePaise, rateBps, intraState) {
  if (!Number.isSafeInteger(inclusivePaise) || inclusivePaise < 0) throw new DomainError('Invalid taxable amount');
  const taxable = Math.round((inclusivePaise * 10000) / (10000 + rateBps));
  const tax = inclusivePaise - taxable;
  if (intraState) {
    const cgst = Math.floor(tax / 2);
    return { taxablePaise: taxable, taxPaise: tax, cgstPaise: cgst, sgstPaise: tax - cgst, igstPaise: 0 };
  }
  return { taxablePaise: taxable, taxPaise: tax, cgstPaise: 0, sgstPaise: 0, igstPaise: tax };
}

/** Shipping and COD handling are taxed at 18% GST as a service, included in the charge shown to the customer. */
export const SERVICE_GST_BPS = 1800;

// ───────────── Unit price ─────────────

/**
 * Price per unit for a listing at a quantity.
 * Business buyers get the best wholesale tier they qualify for. A live flash deal applies only when it beats that.
 */
export function unitPrice(listing, quantity, mode, promotionBps = 0) {
  const tiers = mode === 'BUSINESS' && listing.wholesaleEnabled !== false
    ? [...(listing.tiers || [])].filter((t) => t.minQty <= quantity).sort((a, b) => b.minQty - a.minQty)
    : [];
  const tierPrice = tiers[0]?.pricePaise ?? listing.pricePaise;
  const dealPrice = promotionBps > 0 ? listing.pricePaise - Math.floor((listing.pricePaise * promotionBps) / 10000) : listing.pricePaise;
  const unit = Math.min(tierPrice, dealPrice);
  return { unitPaise: unit, source: unit === listing.pricePaise ? 'LIST' : unit === dealPrice && promotionBps ? 'DEAL' : 'TIER' };
}

export function assertQuantity(listing, quantity, mode) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new DomainError('Quantity must be a whole number between 1 and 10,000');
  }
  if (mode === 'BUSINESS') {
    if (quantity < listing.moq) throw new DomainError(`${listing.name ?? 'This item'} has a minimum order of ${listing.moq} units for business buying`);
    if (listing.bulkPackUnits > 1 && quantity % listing.bulkPackUnits !== 0) {
      throw new DomainError(`${listing.name ?? 'This item'} is sold in packs of ${listing.bulkPackUnits} units`);
    }
  }
}

// ───────────── Coupons ─────────────

/** Coupon discount on a subtotal. Throws a customer-friendly error when the coupon cannot be used. */
export function couponDiscount(coupon, subtotalPaise, mode, at = Date.now()) {
  const starts = new Date(coupon.startsAt).getTime();
  const ends = new Date(coupon.endsAt).getTime();
  if (!coupon.active || starts > at || ends <= at) throw new DomainError('This coupon is not active right now', 409);
  if (coupon.usageLimit != null && coupon.used >= coupon.usageLimit) throw new DomainError('This coupon has reached its usage limit', 409);
  if (coupon.mode !== 'ANY' && coupon.mode !== mode) {
    throw new DomainError(`This coupon applies to ${coupon.mode === 'RETAIL' ? 'personal' : 'business'} orders only`, 409);
  }
  if (subtotalPaise < coupon.minOrderPaise) throw new DomainError(`This coupon needs a minimum order of ${money(coupon.minOrderPaise)}`, 409);
  const raw = coupon.kind === 'PERCENT' ? Math.floor((subtotalPaise * coupon.value) / 100) : coupon.value;
  const capped = coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  // An order always keeps at least ₹1 payable so payment providers can process it.
  return Math.max(0, Math.min(capped, subtotalPaise - 100));
}

// ───────────── Shipping ─────────────

export const DEFAULT_SHIPPING = {
  freeShippingThresholdPaise: 49900,
  baseShippingPaise: 4900,
  perExtraKgPaise: 2000,
  codEnabled: true,
  codFeePaise: 2900,
  codMaxOrderPaise: 5000000,
  blockedPincodePrefixes: [],
  codBlockedPincodePrefixes: [],
};

/** Delivery charge for one seller's parcel. Free above the threshold; otherwise a base fee plus a per-kg surcharge. */
export function shippingFee({ subtotalPaise, weightGrams }, settings = DEFAULT_SHIPPING) {
  if (subtotalPaise >= settings.freeShippingThresholdPaise) return 0;
  const extraKg = Math.max(0, Math.ceil((weightGrams - 1000) / 1000));
  return settings.baseShippingPaise + extraKg * settings.perExtraKgPaise;
}

export function isPincode(value) {
  return /^[1-9]\d{5}$/.test(String(value || ''));
}

/**
 * Delivery estimate between two PIN codes. Indian PIN codes are geographic: the first digit is the postal zone,
 * the first two the circle and the first three the sorting district. This is an estimate shown as such, not a courier promise.
 */
export function deliveryEstimate(fromPincode, toPincode, handlingDays = 2, settings = DEFAULT_SHIPPING) {
  if (!isPincode(toPincode)) return { serviceable: false, reason: 'Enter a valid 6-digit PIN code' };
  if (settings.blockedPincodePrefixes.some((p) => toPincode.startsWith(p))) {
    return { serviceable: false, reason: 'Sorry, we do not deliver to this PIN code yet' };
  }
  const from = String(fromPincode || '');
  const zone = from.slice(0, 3) === toPincode.slice(0, 3) ? 'LOCAL'
    : from.slice(0, 2) === toPincode.slice(0, 2) ? 'REGIONAL'
    : from[0] === toPincode[0] ? 'ZONAL' : 'NATIONAL';
  const transit = { LOCAL: 1, REGIONAL: 2, ZONAL: 3, NATIONAL: 5 }[zone];
  const codAvailable = settings.codEnabled && !settings.codBlockedPincodePrefixes.some((p) => toPincode.startsWith(p));
  return { serviceable: true, zone, minDays: handlingDays + transit, maxDays: handlingDays + transit + 2, codAvailable };
}

// ───────────── Commission ─────────────

export const commissionPaise = (grossPaise, rateBps) => Math.round((grossPaise * rateBps) / 10000);

// ───────────── Status flows ─────────────

export const sellerOrderFlow = {
  PENDING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
};

export const returnFlow = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PICKUP_SCHEDULED', 'RECEIVED'],
  PICKUP_SCHEDULED: ['RECEIVED'],
  RECEIVED: ['REFUNDED'],
};

export function assertTransition(from, to, graph) {
  if (!graph[from]?.includes(to)) throw new DomainError(`Cannot change ${label(from)} to ${label(to)}`, 409);
}

/** The customer-facing order status follows its seller parcels. */
export function orderStatusFrom(sellerStatuses) {
  const live = sellerStatuses.filter((s) => s !== 'CANCELLED');
  if (!live.length) return 'CANCELLED';
  if (live.every((s) => s === 'DELIVERED')) return 'DELIVERED';
  if (live.every((s) => s === 'SHIPPED' || s === 'DELIVERED')) return 'SHIPPED';
  if (live.some((s) => s === 'SHIPPED' || s === 'DELIVERED')) return 'PARTIALLY_SHIPPED';
  return 'CONFIRMED';
}

export const label = (status) => String(status).replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Indian financial year label (April–March), e.g. "2026-27". */
export function financialYear(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 3600_000);
  const year = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}
