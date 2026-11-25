// Request schemas shared by the API and the web forms, so customers see the same plain-language messages everywhere.
import { z } from 'zod';
import { isValidGstin, isValidPan, isValidIfsc, panFromGstin, stateCode } from '../../shared/src/index.js';

z.config({
  customError: (issue) => {
    const label = issue.origin === 'number' || issue.origin === 'int' ? 'number' : 'value';
    switch (issue.code) {
      case 'invalid_type':
        return issue.input === undefined || issue.input === null || issue.input === '' ? 'This field is required' : 'Please enter a valid value';
      case 'too_small':
        if (issue.origin === 'string') return Number(issue.minimum) <= 1 ? 'This field is required' : `Please enter at least ${issue.minimum} characters`;
        if (issue.origin === 'array') return Number(issue.minimum) <= 1 ? 'Please add at least one item' : `Please add at least ${issue.minimum} items`;
        return `Please enter a ${label} of at least ${issue.minimum}`;
      case 'too_big':
        if (issue.origin === 'string') return `Please keep this under ${Number(issue.maximum) + 1} characters`;
        if (issue.origin === 'array') return `You can add up to ${issue.maximum} items`;
        return `Please enter a ${label} no more than ${issue.maximum}`;
      case 'invalid_format':
        if (issue.format === 'email') return 'Please enter a valid email address, like name@example.com';
        if (issue.format === 'datetime') return 'Please choose a valid date and time';
        return 'Please check the format of this field';
      case 'invalid_value':
        return 'Please choose one of the options';
      default:
        return 'Please check this field';
    }
  },
});

// ───────────── Building blocks ─────────────

export const uuid = z.uuid({ message: 'This reference is not valid' });
export const paise = (max = 1_000_000_000) => z.number().int().min(0).max(max);
export const mobileSchema = z.string({ message: 'Please enter your mobile number' }).trim()
  .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number starting with 6, 7, 8 or 9');
export const pincodeSchema = z.string({ message: 'Please enter your 6-digit PIN code' }).trim()
  .regex(/^[1-9]\d{5}$/, 'Please enter a valid 6-digit PIN code');
const stateSchema = z.string({ message: 'Please select your state or union territory' }).trim()
  .refine((s) => !!stateCode(s), 'Please select your state or union territory');
const gstinSchema = z.string().trim().toUpperCase().refine(isValidGstin, 'This GSTIN doesn’t look right. Please check all 15 characters');
const panSchema = z.string().trim().toUpperCase().refine(isValidPan, 'This PAN doesn’t look right. It should look like ABCDE1234F');
export const passwordSchema = z.string({ message: 'Please create a password' })
  .min(12, 'Your password needs at least 12 characters').max(128)
  .refine((p) => new Set(p).size >= 6, 'This password is too easy to guess. Try a short phrase with a few different characters');
const couponCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, 'Coupon codes use 3–30 letters, digits or hyphens');
export const modeSchema = z.enum(['RETAIL', 'BUSINESS']);

export const postalAddressSchema = z.object({
  line1: z.string({ message: 'Please enter the building and street' }).trim().min(5, 'Please enter the full building and street address').max(250),
  line2: z.string().trim().max(250).optional(),
  city: z.string({ message: 'Please enter your city' }).trim().min(2, 'Please enter your city').max(100),
  state: stateSchema,
  pincode: pincodeSchema,
});

export const addressSchema = postalAddressSchema.extend({
  name: z.string({ message: 'Please enter the recipient’s name' }).trim().min(2, 'Please enter the recipient’s full name').max(100),
  phone: mobileSchema,
  label: z.string().trim().min(2).max(30).default('Home'),
  gstin: gstinSchema.optional(),
  isDefault: z.boolean().default(false),
});

/** Edits have no defaults, so an omitted field is left unchanged instead of being reset. */
export const addressPatchSchema = postalAddressSchema.extend({
  name: z.string().trim().min(2).max(100),
  phone: mobileSchema,
  label: z.string().trim().min(2).max(30),
  gstin: gstinSchema,
  isDefault: z.boolean(),
}).partial();

// ───────────── Accounts ─────────────

export const businessTypes = ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'ONE_PERSON_COMPANY', 'TRUST_SOCIETY', 'OTHER'];
const taxIdentity = {
  businessType: z.enum(businessTypes, { message: 'Please choose your business type' }),
  gstRegistered: z.boolean(),
  gstin: gstinSchema.optional(),
  pan: panSchema.optional(),
};
// GST registration is optional for small businesses in India, but a registered business must give a valid GSTIN whose PAN matches.
const taxRules = (value, ctx) => {
  if (value.gstRegistered && !value.gstin) ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Please enter your GSTIN, or untick “registered under GST”' });
  if (!value.gstRegistered && value.gstin) ctx.addIssue({ code: 'custom', path: ['gstRegistered'], message: 'Please tick “registered under GST” to add a GSTIN' });
  if (value.gstin && value.pan && panFromGstin(value.gstin) !== value.pan) ctx.addIssue({ code: 'custom', path: ['pan'], message: 'This PAN doesn’t match the PAN inside your GSTIN (characters 3–12)' });
};

export const businessProfileSchema = z.object({
  legalName: z.string({ message: 'Please enter your legal business name' }).trim().min(3, 'Please enter your full legal business name').max(150),
  tradeName: z.string().trim().max(150).optional(),
  ...taxIdentity,
  contactPhone: mobileSchema,
  address: postalAddressSchema,
}).superRefine(taxRules);

export const sellerProfileSchema = z.object({
  storeName: z.string({ message: 'Please enter a store name' }).trim().min(3, 'Store name needs at least 3 characters').max(80),
  description: z.string({ message: 'Please tell customers about your store' }).trim().min(20, 'Please describe your store in at least 20 characters').max(1000),
  legalName: z.string({ message: 'Please enter your legal business name' }).trim().min(3, 'Please enter your full legal business name').max(150),
  ...taxIdentity,
  primaryCategory: z.string({ message: 'Please choose the main category you sell in' }).trim().min(2, 'Please choose the main category you sell in').max(60),
  contactPhone: mobileSchema,
  pickupAddress: postalAddressSchema,
  acceptSellerTerms: z.literal(true, { message: 'Please accept the seller agreement to continue' }),
}).superRefine(taxRules);

const accountBase = {
  name: z.string({ message: 'Please enter your full name' }).trim().min(2, 'Please enter your full name').max(100),
  email: z.email({ message: 'Please enter a valid email address, like name@example.com' }).toLowerCase().max(254),
  phone: mobileSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { message: 'Please accept the Terms of Use and Privacy Policy to continue' }),
  marketingOptIn: z.boolean().default(false),
};

export const accountRegisterSchema = z.discriminatedUnion('accountType', [
  z.object({ accountType: z.literal('customer'), ...accountBase }),
  z.object({ accountType: z.literal('business'), ...accountBase, business: businessProfileSchema }),
  z.object({ accountType: z.literal('seller'), ...accountBase, seller: sellerProfileSchema }),
]).superRefine((v, ctx) => {
  const local = v.email.split('@')[0];
  if (local.length >= 4 && v.password.toLowerCase().includes(local)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'For your safety, don’t use your email name in your password' });
  }
});

export const loginSchema = z.object({
  email: z.email().toLowerCase().max(254),
  password: z.string().min(1, 'Enter your password').max(128),
});
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const passwordResetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'This reset link is invalid'), newPassword: passwordSchema });
export const contextSchema = z.object({ organizationId: uuid.nullable().optional(), storeId: uuid.nullable().optional() });

// ───────────── Cart and checkout ─────────────

export const cartLineSchema = z.object({ listingId: uuid, quantity: z.number().int().min(1).max(10000) });
export const cartQuoteSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(100),
  mode: modeSchema.default('RETAIL'),
  couponCode: couponCode.optional(),
  pincode: pincodeSchema.optional(),
  state: stateSchema.optional(),
  paymentMethod: z.enum(['ONLINE', 'COD', 'BANK_TRANSFER']).optional(),
});
export const cartItemSchema = z.object({ listingId: uuid, quantity: z.number().int().min(0).max(10000), savedForLater: z.boolean().optional() });
export const cartMergeSchema = z.object({ items: z.array(cartLineSchema).max(100), mode: modeSchema.optional() });
export const paymentMethods = ['ONLINE', 'COD', 'BANK_TRANSFER'];
export const checkoutSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(100),
  mode: modeSchema.default('RETAIL'),
  couponCode: couponCode.optional(),
  address: addressSchema.omit({ label: true, isDefault: true }),
  saveAddress: z.boolean().default(false),
  paymentMethod: z.enum(paymentMethods).default('ONLINE'),
  billingGstin: gstinSchema.optional(),
  expectedTotalPaise: paise().optional(),
});

// ───────────── Catalogue ─────────────

const mediaUrl = z.string().regex(/^\/api\/media\/[0-9a-f-]{36}\.webp$/, 'Use an image uploaded to IBazzzar');
const tierSchema = z.object({ minQty: z.number().int().min(1).max(100000), pricePaise: z.number().int().min(1).max(100_000_000) });
const listingFields = {
  sku: z.string().trim().regex(/^[A-Za-z0-9._-]{2,40}$/, 'SKUs use 2–40 letters, digits, dots, dashes or underscores'),
  pricePaise: z.number().int().min(100, 'Price must be at least ₹1').max(100_000_000),
  mrpPaise: z.number().int().min(100).max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  moq: z.number().int().min(1).max(100000).default(1),
  bulkPackUnits: z.number().int().min(1).max(10000).default(1),
  wholesaleEnabled: z.boolean().default(true),
  codAllowed: z.boolean().default(true),
  returnable: z.boolean().default(true),
  tiers: z.array(tierSchema).max(10).default([]),
};
const listingRules = (v, ctx) => {
  if (v.mrpPaise !== undefined && v.pricePaise !== undefined && v.mrpPaise < v.pricePaise) ctx.addIssue({ code: 'custom', path: ['mrpPaise'], message: 'MRP cannot be lower than your selling price' });
  const mins = new Set();
  for (const [i, t] of (v.tiers || []).entries()) {
    if (v.moq !== undefined && t.minQty < v.moq) ctx.addIssue({ code: 'custom', path: ['tiers', i, 'minQty'], message: 'Wholesale tiers must start at or above the MOQ' });
    if (v.pricePaise !== undefined && t.pricePaise > v.pricePaise) ctx.addIssue({ code: 'custom', path: ['tiers', i, 'pricePaise'], message: 'Wholesale prices cannot be higher than the retail price' });
    if (mins.has(t.minQty)) ctx.addIssue({ code: 'custom', path: ['tiers', i, 'minQty'], message: 'Each tier needs a different minimum quantity' });
    mins.add(t.minQty);
  }
};

export const productCreateSchema = z.object({
  name: z.string().trim().min(3).max(150),
  brand: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(20, 'Please describe the product in at least 20 characters').max(5000),
  highlights: z.array(z.string().trim().min(3).max(140)).max(8).default([]),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/, 'HSN codes are 4 to 8 digits').optional(),
  images: z.array(mediaUrl).min(1, 'Please add at least one product photo').max(4, 'Add up to 4 photos'),
  attributes: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(120)).default({}),
  variantLabel: z.string().trim().min(1).max(40).default('Standard'),
  weightGrams: z.number().int().min(1).max(500000).default(500),
  ...listingFields,
}).superRefine(listingRules);

/** Add a new variant (e.g. another colour) to one of the seller's own catalogue products. */
export const variantCreateSchema = z.object({
  catalogProductId: uuid,
  variantLabel: z.string().trim().min(1).max(40),
  weightGrams: z.number().int().min(1).max(500000).default(500),
  attributes: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(120)).default({}),
  ...listingFields,
}).superRefine(listingRules);

/** Offer an existing catalogue variant from your own store (multi-seller offers). */
export const offerCreateSchema = z.object({ variantId: uuid, ...listingFields }).superRefine(listingRules);

export const listingUpdateSchema = z.object({
  pricePaise: listingFields.pricePaise, mrpPaise: listingFields.mrpPaise, moq: z.number().int().min(1).max(100000),
  bulkPackUnits: z.number().int().min(1).max(10000), wholesaleEnabled: z.boolean(), codAllowed: z.boolean(), returnable: z.boolean(),
  tiers: z.array(tierSchema).max(10), paused: z.boolean(),
}).partial().superRefine(listingRules);

export const productContentUpdateSchema = z.object({
  name: z.string().trim().min(3).max(150), description: z.string().trim().min(20).max(5000),
  highlights: z.array(z.string().trim().min(3).max(140)).max(8), images: z.array(mediaUrl).min(1).max(4, 'Add up to 4 photos'),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/).optional(), attributes: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(120)),
}).partial();

export const stockAdjustSchema = z.object({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((d) => d !== 0, 'Enter a change other than zero'),
  reason: z.enum(['RECEIVED', 'ADJUSTMENT', 'CORRECTION']),
  note: z.string().trim().max(200).optional(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(3000),
  images: z.array(mediaUrl).max(5, 'Add up to 5 photos').default([]),
});

// ───────────── Seller operations ─────────────

export const shipmentSchema = z.object({
  mode: z.enum(['SANDBOX', 'MANUAL']),
  carrier: z.string().trim().min(2).max(80).optional(),
  trackingRef: z.string().trim().regex(/^[A-Za-z0-9-]{4,40}$/, 'Tracking numbers use 4–40 letters, digits or dashes').optional(),
}).superRefine((v, ctx) => {
  if (v.mode === 'MANUAL' && (!v.carrier || !v.trackingRef)) ctx.addIssue({ code: 'custom', path: ['trackingRef'], message: 'Enter the courier name and tracking number' });
});
export const trackingUpdateSchema = z.object({
  status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY']),
  location: z.string().trim().max(100).optional(),
  note: z.string().trim().max(200).optional(),
});
export const payoutAccountSchema = z.object({
  accountHolder: z.string().trim().min(3).max(100),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Bank account numbers are 9 to 18 digits'),
  confirmAccountNumber: z.string().trim(),
  ifsc: z.string().trim().toUpperCase().refine(isValidIfsc, 'IFSC codes look like HDFC0001234'),
  bankName: z.string().trim().max(100).optional(),
}).refine((v) => v.accountNumber === v.confirmAccountNumber, { path: ['confirmAccountNumber'], message: 'The account numbers don’t match' });

// ───────────── B2B ─────────────

export const rfqSchema = z.object({
  title: z.string().trim().min(5).max(150),
  deliveryPincode: pincodeSchema,
  neededBy: z.iso.datetime().optional(),
  notes: z.string().trim().min(5).max(3000),
  items: z.array(z.object({
    catalogProductId: uuid.optional(),
    variantId: uuid.optional(),
    description: z.string().trim().min(3).max(300),
    quantity: z.number().int().min(1).max(1_000_000),
  })).min(1).max(50),
  storeIds: z.array(uuid).max(20).optional(),
  attachmentIds: z.array(uuid).max(5).default([]),
});

export const quoteSchema = z.object({
  items: z.array(z.object({ rfqItemId: uuid, listingId: uuid, quantity: z.number().int().min(1).max(1_000_000), unitPaise: z.number().int().min(1).max(100_000_000) })).min(1).max(50),
  terms: z.string().trim().min(5).max(2000),
  validUntil: z.iso.datetime(),
  deliveryDays: z.number().int().min(1).max(180),
  shippingPaise: paise(100_000_000).default(0),
  paymentTerms: z.enum(['PREPAID', 'NET_15', 'NET_30', 'NET_45']).default('PREPAID'),
});
export const messageSchema = z.object({ body: z.string().trim().min(2).max(3000) });
export const poCheckoutSchema = z.object({
  address: addressSchema.omit({ label: true, isDefault: true }),
  paymentMethod: z.enum(['ONLINE', 'BANK_TRANSFER', 'CREDIT_TERMS']).default('ONLINE'),
});

// ───────────── Admin ─────────────

export const couponSchema = z.object({
  code: couponCode,
  description: z.string().trim().min(5).max(200),
  kind: z.enum(['PERCENT', 'FLAT']),
  value: z.number().int().min(1).max(100_000_000),
  maxDiscountPaise: z.number().int().min(100).max(100_000_000).nullable().default(null),
  minOrderPaise: z.number().int().min(0).max(100_000_000).default(0),
  mode: z.enum(['RETAIL', 'BUSINESS', 'ANY']).default('ANY'),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().default(null),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  public: z.boolean().default(false),
}).refine((c) => c.kind !== 'PERCENT' || c.value <= 90, { message: 'Percentage discounts are limited to 90%', path: ['value'] })
  .refine((c) => Date.parse(c.endsAt) > Date.parse(c.startsAt), { message: 'End must be after start', path: ['endsAt'] });

export const promotionSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(5).max(300),
  discountBps: z.number().int().min(100, 'Deals need at least 1% off').max(9000, 'Deals can be at most 90% off'),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  listingIds: z.array(uuid).min(1).max(200),
}).refine((p) => Date.parse(p.endsAt) > Date.parse(p.startsAt), { message: 'End must be after start', path: ['endsAt'] });

export const shippingSettingsSchema = z.object({
  freeShippingThresholdPaise: paise(100_000_000),
  baseShippingPaise: paise(1_000_000),
  perExtraKgPaise: paise(1_000_000),
  codEnabled: z.boolean(),
  codFeePaise: paise(100_000),
  codMaxOrderPaise: paise(100_000_000),
  blockedPincodePrefixes: z.array(z.string().regex(/^[1-9]\d{0,5}$/)).max(200),
  codBlockedPincodePrefixes: z.array(z.string().regex(/^[1-9]\d{0,5}$/)).max(200),
}).partial();

export const ticketSchema = z.object({
  subject: z.string().trim().min(5).max(150),
  message: z.string().trim().min(10).max(5000),
  orderId: uuid.optional(),
});
export const decisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(1000).optional() });
