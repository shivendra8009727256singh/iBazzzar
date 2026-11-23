// Marketplace staff roles and what each may do. ADMIN is the Super Admin and holds every capability.
// The API enforces these on every admin route; the console only uses them to decide what to show.
export const staffRoles = {
  ADMIN: {label:'Super Admin', description:'Full control, including staff roles and platform settings'},
  OPERATIONS: {label:'Operations manager', description:'Approvals, catalogue, orders, returns, B2B, content and media'},
  FINANCE: {label:'Finance manager', description:'Payments, refunds, commissions, settlements, payouts and reports'},
  SUPPORT: {label:'Support agent', description:'Support tickets and read-only customer and order lookups'},
};
export const assignableRoles = ['CUSTOMER', ...Object.keys(staffRoles)];
const all = ['dashboard','users.view','users.manage','staff.manage','approvals.manage','catalogue.manage','orders.view','orders.manage','b2b.view','finance.view','finance.manage','returns.manage','promotions.manage','cms.manage','media.manage','notifications.send','support.manage','reports.view','audit.view','settings.manage'];
const capabilities = {
  ADMIN: all,
  OPERATIONS: ['dashboard','users.view','approvals.manage','catalogue.manage','orders.view','orders.manage','b2b.view','returns.manage','promotions.manage','cms.manage','media.manage','notifications.send','reports.view','support.manage'],
  FINANCE: ['dashboard','users.view','orders.view','b2b.view','finance.view','finance.manage','reports.view'],
  SUPPORT: ['users.view','orders.view','support.manage'],
};
export const can = (role, capability) => (capabilities[role] || []).includes(capability);
export const isStaff = role => role in staffRoles;
export const capabilitiesFor = role => capabilities[role] || [];
