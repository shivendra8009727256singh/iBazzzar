import { describe, it, expect } from 'vitest';
import {
  gstSplit, allocate, unitPrice, assertQuantity, couponDiscount, shippingFee, deliveryEstimate, orderStatusFrom,
  stateCode, financialYear, isValidGstin, DEFAULT_SHIPPING,
} from '../packages/shared/src/index.js';

describe('GST', () => {
  it('splits an inclusive price into taxable value and CGST + SGST for intra-state supply', () => {
    const t = gstSplit(118000, 1800, true);
    expect(t).toEqual({ taxablePaise: 100000, taxPaise: 18000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0 });
  });
  it('uses IGST for inter-state supply and never loses a paisa', () => {
    const t = gstSplit(99999, 500, false);
    expect(t.taxablePaise + t.igstPaise).toBe(99999);
    expect(t.cgstPaise + t.sgstPaise).toBe(0);
  });
  it('puts the odd paisa in SGST so CGST + SGST equals the tax', () => {
    const t = gstSplit(10001, 1800, true);
    expect(t.cgstPaise + t.sgstPaise).toBe(t.taxPaise);
  });
  it('charges no tax at 0%', () => expect(gstSplit(5000, 0, true).taxPaise).toBe(0));
  it('maps state names to GST state codes', () => {
    expect(stateCode('Maharashtra')).toBe('27');
    expect(stateCode('karnataka')).toBe('29');
    expect(stateCode('Atlantis')).toBeNull();
  });
  it('validates GSTIN checksums', () => {
    expect(isValidGstin('27AAACE1234F1Z6')).toBe(true);
    expect(isValidGstin('27AAACE1234F1Z0')).toBe(false);
  });
  it('labels the Indian financial year', () => {
    expect(financialYear(new Date('2026-03-31T12:00:00Z'))).toBe('2025-26');
    expect(financialYear(new Date('2026-04-01T12:00:00Z'))).toBe('2026-27');
  });
});

describe('Allocation', () => {
  it('shares a discount exactly across lines', () => {
    const parts = allocate(1000, [3333, 3333, 3334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });
  it('returns zeros when there is nothing to share', () => expect(allocate(0, [5, 5])).toEqual([0, 0]));
});

describe('Unit price', () => {
  const listing = { pricePaise: 10000, moq: 10, bulkPackUnits: 1, wholesaleEnabled: true, tiers: [{ minQty: 10, pricePaise: 9000 }, { minQty: 50, pricePaise: 8000 }] };
  it('uses list price for retail even at high quantity', () => expect(unitPrice(listing, 100, 'RETAIL').unitPaise).toBe(10000));
  it('applies the best qualifying wholesale tier', () => {
    expect(unitPrice(listing, 10, 'BUSINESS').unitPaise).toBe(9000);
    expect(unitPrice(listing, 60, 'BUSINESS').unitPaise).toBe(8000);
  });
  it('applies a flash deal only when it beats the tier', () => {
    expect(unitPrice(listing, 1, 'RETAIL', 2000)).toEqual({ unitPaise: 8000, source: 'DEAL' });
    expect(unitPrice(listing, 60, 'BUSINESS', 500).unitPaise).toBe(8000);
  });
  it('enforces MOQ and pack size for business buying', () => {
    expect(() => assertQuantity(listing, 5, 'BUSINESS')).toThrow(/minimum order of 10/);
    expect(() => assertQuantity({ ...listing, bulkPackUnits: 6 }, 10, 'BUSINESS')).toThrow(/packs of 6/);
    expect(() => assertQuantity(listing, 5, 'RETAIL')).not.toThrow();
  });
  it.each([0, -1, 1.5, 10001])('rejects quantity %s', (q) => expect(() => assertQuantity(listing, q, 'RETAIL')).toThrow());
});

describe('Coupons', () => {
  const now = Date.parse('2026-11-23T10:00:00Z');
  const coupon = { active: true, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', usageLimit: 10, used: 0, mode: 'ANY', minOrderPaise: 50000, kind: 'PERCENT', value: 10, maxDiscountPaise: 20000 };
  it('applies a capped percentage', () => {
    expect(couponDiscount(coupon, 100000, 'RETAIL', now)).toBe(10000);
    expect(couponDiscount(coupon, 1000000, 'RETAIL', now)).toBe(20000);
  });
  it('enforces minimum order, dates, mode and usage limit', () => {
    expect(() => couponDiscount(coupon, 40000, 'RETAIL', now)).toThrow(/minimum order/);
    expect(() => couponDiscount(coupon, 100000, 'RETAIL', Date.parse('2026-12-02'))).toThrow(/not active/);
    expect(() => couponDiscount({ ...coupon, mode: 'BUSINESS' }, 100000, 'RETAIL', now)).toThrow(/business/);
    expect(() => couponDiscount({ ...coupon, used: 10 }, 100000, 'RETAIL', now)).toThrow(/usage limit/);
  });
  it('always leaves at least ₹1 payable', () => {
    expect(couponDiscount({ ...coupon, kind: 'FLAT', value: 999999, maxDiscountPaise: null, minOrderPaise: 0 }, 5000, 'RETAIL', now)).toBe(4900);
  });
});

describe('Shipping', () => {
  it('is free above the threshold and charged per kg below it', () => {
    expect(shippingFee({ subtotalPaise: 49900, weightGrams: 5000 })).toBe(0);
    expect(shippingFee({ subtotalPaise: 10000, weightGrams: 800 })).toBe(DEFAULT_SHIPPING.baseShippingPaise);
    expect(shippingFee({ subtotalPaise: 10000, weightGrams: 3500 })).toBe(DEFAULT_SHIPPING.baseShippingPaise + 3 * DEFAULT_SHIPPING.perExtraKgPaise);
  });
  it('estimates delivery by PIN code distance and blocks configured areas', () => {
    expect(deliveryEstimate('411001', '411045', 2).zone).toBe('LOCAL');
    expect(deliveryEstimate('411001', '413001', 2).zone).toBe('REGIONAL');
    expect(deliveryEstimate('411001', '400001', 2).zone).toBe('ZONAL');
    expect(deliveryEstimate('411001', '110001', 2)).toMatchObject({ zone: 'NATIONAL', minDays: 7 });
    expect(deliveryEstimate('411001', '744101', 2, { ...DEFAULT_SHIPPING, blockedPincodePrefixes: ['744'] }).serviceable).toBe(false);
    expect(deliveryEstimate('411001', '12345', 2).serviceable).toBe(false);
  });
});

describe('Order status from parcels', () => {
  it.each([
    [['PENDING', 'PACKED'], 'CONFIRMED'],
    [['SHIPPED', 'PENDING'], 'PARTIALLY_SHIPPED'],
    [['SHIPPED', 'DELIVERED'], 'SHIPPED'],
    [['DELIVERED', 'CANCELLED'], 'DELIVERED'],
    [['CANCELLED', 'CANCELLED'], 'CANCELLED'],
  ])('%j → %s', (parcels, expected) => expect(orderStatusFrom(parcels)).toBe(expected));
});
