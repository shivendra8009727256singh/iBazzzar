import { describe, it, expect } from 'vitest';
import { loginDestination } from '../apps/web/lib/login-destination';

const shopper = { staffRole: null, stores: [], organizations: [] };
describe('login destination', () => {
  it('opens the Admin console even from the default Shopper tab', () => {
    expect(loginDestination({ ...shopper, staffRole: 'ADMIN' }, null, null)).toBe('/admin');
  });
  it('keeps ordinary shopper, staff, seller and business destinations', () => {
    expect(loginDestination(shopper, null, null)).toBe('/account');
    expect(loginDestination({ ...shopper, staffRole: 'SUPPORT' }, 'staff', null)).toBe('/admin');
    expect(loginDestination({ ...shopper, stores: [{}] }, 'seller', null)).toBe('/seller');
    expect(loginDestination({ ...shopper, organizations: [{}] }, 'business', null)).toBe('/business');
  });
  it('preserves local return paths and rejects external redirects', () => {
    expect(loginDestination(shopper, null, '/checkout')).toBe('/checkout');
    for (const next of ['https://evil.test', '//evil.test', '/\\evil.test']) {
      expect(loginDestination(shopper, null, next)).toBe('/account');
    }
  });
});
