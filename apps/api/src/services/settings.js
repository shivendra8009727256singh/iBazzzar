// Platform settings stored as JSON rows in the settings table, merged over safe defaults.
import { DEFAULT_SHIPPING } from '../../../../packages/shared/src/index.js';

export const DEFAULTS = {
  platform: { returnWindowDays: 7, lowStockThreshold: 10, paymentWindowMinutes: 30, bankTransferWindowDays: 3 },
  commission: { rateBps: 1000 },
  shipping: DEFAULT_SHIPPING,
  bank: { accountName: '', accountNumber: '', ifsc: '', bankName: '', note: 'Bank transfer details are configured by IBazzzar finance.' },
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

/** Commission for a category: its own rule if one exists, otherwise the platform default. */
export async function commissionRateFor(db, categoryId) {
  if (categoryId) {
    const rule = await db.commissionRule.findUnique({ where: { categoryId } });
    if (rule) return rule.rateBps;
  }
  return (await getSetting(db, 'commission')).rateBps;
}
