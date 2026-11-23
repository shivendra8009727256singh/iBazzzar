// Staff permissions. Defaults come from packages/shared; the Admin can switch individual capabilities on or off for
// Operations, Finance and Support. The Admin role always has every capability and can't be edited.
import { allCapabilities, capabilitiesFor } from '../../../../packages/shared/src/index.js';

export const EDITABLE_ROLES = ['OPERATIONS', 'FINANCE', 'SUPPORT'];
export const CAPABILITY_LABELS = {
  dashboard: 'See the dashboard and analytics',
  'users.view': 'View customers, businesses and sellers',
  'users.manage': 'Edit, suspend and sign out customers',
  'staff.manage': 'Manage staff roles and permissions',
  'approvals.manage': 'Approve sellers and business accounts',
  'catalogue.manage': 'Manage products, categories, brands and moderation',
  'orders.view': 'View orders and shipments',
  'orders.manage': 'Cancel orders, edit addresses, act on parcels',
  'b2b.view': 'View RFQs, quotations and purchase orders',
  'finance.view': 'View payments, refunds and settlements',
  'finance.manage': 'Issue refunds, record payouts, set credit and commission',
  'returns.manage': 'Decide and receive returns',
  'promotions.manage': 'Manage coupons and flash deals',
  'cms.manage': 'Edit homepage, pages and banners',
  'media.manage': 'Manage the media library',
  'notifications.send': 'Send broadcast notifications',
  'support.manage': 'Answer support tickets',
  'reports.view': 'See sales reports and export CSVs',
  'audit.view': 'Read the audit log',
  'settings.manage': 'Change platform settings',
  'shipping.manage': 'Advance sandbox shipments',
};

let cache = { at: 0, value: null };
const TTL_MS = 15_000;

/** Effective capability matrix for the editable roles. */
export async function permissionMatrix(db, { fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await db.setting.findUnique({ where: { key: 'permissions' } });
  const saved = row?.value ?? {};
  const value = Object.fromEntries(EDITABLE_ROLES.map((role) => {
    const list = Array.isArray(saved[role]) ? saved[role].filter((c) => allCapabilities.includes(c) && c !== 'staff.manage') : capabilitiesFor(role);
    return [role, list];
  }));
  cache = { at: Date.now(), value };
  return value;
}

export function invalidatePermissions() {
  cache = { at: 0, value: null };
}

/** Capabilities held by a set of staff roles. */
export async function capabilitiesOf(db, roles) {
  if (!roles?.length) return [];
  if (roles.includes('ADMIN')) return [...allCapabilities];
  const matrix = await permissionMatrix(db);
  return [...new Set(roles.flatMap((r) => matrix[r] ?? []))];
}
