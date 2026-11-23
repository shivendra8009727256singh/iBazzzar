type LoginUser = { staffRole: string | null; stores: unknown[]; organizations: unknown[] };

export function loginDestination(user: LoginUser, portal: string | null, next: string | null) {
  const returnTo = next && next.startsWith('/') && !next.startsWith('//') && !/[\\\u0000-\u0020]/.test(next) ? next : null;
  return returnTo ?? (user.staffRole === 'ADMIN' || portal === 'staff' && user.staffRole ? '/admin' : portal === 'seller' && user.stores.length ? '/seller' : portal === 'business' && user.organizations.length ? '/business' : '/account');
}
