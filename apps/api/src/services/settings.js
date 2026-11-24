// Platform settings stored as JSON rows in the settings table, merged over safe defaults.
import { DEFAULT_SHIPPING } from '../../../../packages/shared/src/index.js';

export const DEFAULTS = {
  platform: { returnWindowDays: 7, lowStockThreshold: 10, paymentWindowMinutes: 30, bankTransferWindowDays: 3 },
  commission: { rateBps: 1000 },
  shipping: DEFAULT_SHIPPING,
  bank: { accountName: '', accountNumber: '', ifsc: '', bankName: '', note: 'Bank transfer details are configured by IBazzzar finance.' },
  // Brand and contact details used across the whole website, emails and invoices. Changed in Admin → Settings → Brand & site.
  site: {
    siteName: 'IBazzzar', tagline: 'Intelligent Digital Mall', logoUrl: '/branding/ibazzzar-logo.png', logoMarkUrl: '/icon.png',
    about: 'An intelligent digital mall for shoppers, businesses and independent sellers across India.',
    announcement: 'Retail and wholesale from verified sellers — one intelligent digital mall', announcementLink: '',
    supportEmail: '', supportPhone: '', whatsapp: '', supportHours: 'Mon–Sat, 10 am – 7 pm',
    legalName: '', gstin: '', address: { line1: '', line2: '', city: '', state: '', pincode: '' },
    socials: { instagram: '', facebook: '', x: '', youtube: '', linkedin: '' },
  },
  // The /deals page banner. Empty title or button text means "work it out from the live deals".
  // Changed in Admin → Homepage & content → Deals page banner.
  dealsHero: {
    eyebrow: 'Today’s deals', title: '', subtitle: 'Real start and end times. Prices go back to normal when the timer ends — no fake urgency, no inflated MRPs.',
    ctaLabel: '', bgFrom: '#3d0808', bgVia: '#c8331f', bgTo: '#e8902d', showTimer: true, showProducts: true, fillWithDiscounted: true,
  },
  // The homepage "Deal of the day" block. Empty promotionId = automatic (the live deal ending soonest).
  // Changed in Admin → Homepage & content → Homepage deal block.
  homeDeal: {
    enabled: true, promotionId: '', label: 'Deal of the day', ctaLabel: 'All deals',
    bgFrom: '#5c1010', bgVia: '#b42318', bgTo: '#e0892b', showTimer: true, showOtherDeals: true,
  },
};

export async function getSetting(db, key) {
  const row = await db.setting.findUnique({ where: { key } });
  return { ...DEFAULTS[key], ...(row?.value || {}) };
}

export async function putSetting(db, key, patch, actorId) {
  const value = { ...(await getSetting(db, key)), ...patch };
  await db.setting.upsert({ where: { key }, create: { key, value, updatedBy: actorId }, update: { value, updatedBy: actorId } });
  return value;
}

/** Commission: the store's own rate if set, else the category's rule, else the platform default. */
export async function commissionRateFor(db, categoryId, storeId) {
  if (storeId) {
    const store = await db.sellerStore.findUnique({ where: { id: storeId }, select: { commissionBps: true } });
    if (store?.commissionBps != null) return store.commissionBps;
  }
  if (categoryId) {
    const rule = await db.commissionRule.findUnique({ where: { categoryId } });
    if (rule) return rule.rateBps;
  }
  return (await getSetting(db, 'commission')).rateBps;
}
