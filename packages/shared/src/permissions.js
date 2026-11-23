// Marketplace staff roles and what each may do. ADMIN is the Super Admin and holds every capability.
// The API enforces these on every staff route; the console only uses them to decide what to show.
export const staffRoles = {
  ADMIN: { label: 'Super Admin', description: 'Full control, including staff roles and platform settings' },
  OPERATIONS: { label: 'Operations manager', description: 'Approvals, catalogue, orders, returns, B2B, content and media' },
  FINANCE: { label: 'Finance manager', description: 'Payments, refunds, commissions, settlements, payouts and reports' },
  SUPPORT: { label: 'Support agent', description: 'Support tickets and read-only customer and order lookups' },
};

export const allCapabilities = [
  'dashboard', 'users.view', 'users.manage', 'staff.manage', 'approvals.manage', 'catalogue.manage',
  'orders.view', 'orders.manage', 'b2b.view', 'finance.view', 'finance.manage', 'returns.manage',
  'promotions.manage', 'cms.manage', 'media.manage', 'notifications.send', 'support.manage',
  'reports.view', 'audit.view', 'settings.manage', 'shipping.manage',
];

const capabilities = {
  ADMIN: allCapabilities,
  OPERATIONS: ['dashboard', 'users.view', 'approvals.manage', 'catalogue.manage', 'orders.view', 'orders.manage', 'b2b.view',
    'returns.manage', 'promotions.manage', 'cms.manage', 'media.manage', 'notifications.send', 'reports.view', 'support.manage', 'shipping.manage'],
  FINANCE: ['dashboard', 'users.view', 'orders.view', 'b2b.view', 'finance.view', 'finance.manage', 'reports.view'],
  SUPPORT: ['users.view', 'orders.view', 'support.manage'],
};

/** True when any of the given staff roles grants the capability. */
export function can(roles, capability) {
  const list = Array.isArray(roles) ? roles : [roles];
  return list.some((role) => (capabilities[role] || []).includes(capability));
}

export const isStaffRole = (role) => role in staffRoles;
export const capabilitiesFor = (roles) => [...new Set((Array.isArray(roles) ? roles : [roles]).flatMap((r) => capabilities[r] || []))];

/** Business team permissions. Approval rules are enforced server-side in the purchase-order service. */
export const orgPermissions = {
  OWNER: ['rfq.create', 'quote.decide', 'po.approve', 'po.checkout', 'team.manage', 'settings.manage', 'orders.view'],
  APPROVER: ['rfq.create', 'quote.decide', 'po.approve', 'po.checkout', 'orders.view'],
  BUYER: ['rfq.create', 'quote.decide', 'po.checkout', 'orders.view'],
};
export const orgCan = (role, permission) => (orgPermissions[role] || []).includes(permission);
