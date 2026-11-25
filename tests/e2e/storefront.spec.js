// Browser journeys against the production build, a real API and a disposable PostgreSQL database.
import { test, expect } from '@playwright/test';

const unique = () => Math.random().toString(36).slice(2, 8);
const phone = () => `9${String(Math.floor(100000000 + Math.random() * 899999999))}`;

test.describe.configure({ mode: 'serial' });

test('homepage shows the official logo, hero and real catalogue data', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('img', { name: /IBazzzar — Intelligent Digital Mall/i }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to the Future of Shopping' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore Products' })).toBeVisible();
  // Admin-managed hero carousel: at least four seeded slides with working controls.
  expect(await page.locator('[aria-roledescription="slide"]').count()).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Next slide' }).click();
  await expect(page.locator('[aria-roledescription="slide"]').nth(1)).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByRole('heading', { name: 'Shop by price' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Under ₹499/ })).toHaveAttribute('href', '/products?max=499');
  await expect(page.getByRole('link', { name: /Electronics/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shop for Yourself' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Buy for Your Business' })).toBeVisible();
  // No horizontal overflow at desktop width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('search tolerates a typo and filters are URL-driven', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search IBazzzar' }).first();
  await search.fill('hedphones');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=hedphones/);
  await expect(page.getByRole('heading', { name: /Aura wireless headphones/ })).toBeVisible();
  await page.goto('/products?category=furniture');
  await expect(page.getByRole('heading', { level: 1, name: 'Furniture' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Studio task chair' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/q=hedphones/);
});

test('product page shows variants, multiple sellers, structured data and delivery check', async ({ page }) => {
  await page.goto('/products/aura-wireless-headphones');
  await expect(page.getByRole('heading', { level: 1, name: 'Aura wireless headphones' })).toBeVisible();
  await expect(page.getByText('2 sellers offer this item')).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld)[0]['@type']).toBe('Product');
  await page.getByLabel('Delivery PIN code').fill('411045');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText(/Estimated delivery/)).toBeVisible();
  await page.goto('/products/pulse-smart-watch');
  await expect(page.getByRole('link', { name: 'Sand' })).toBeVisible();
});

test('guest adds to cart, checks out with cash on delivery and sees the order', async ({ page }) => {
  await page.goto('/products/everyday-canvas-tote');
  await page.getByRole('button', { name: 'Add to Cart' }).first().click();
  await expect(page.getByText('Added to cart')).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await expect(page.getByText('The everyday canvas tote')).toBeVisible();
  await page.getByRole('link', { name: /Proceed to checkout/ }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByLabel('Your name').fill('Guest Shopper');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`guest-${unique()}@example.test`);
  await page.getByLabel('Mobile number').first().fill(phone());
  await page.getByRole('checkbox', { name: /I accept the Terms of Use/ }).check();
  await page.getByLabel('Full name').fill('Guest Shopper');
  await page.getByLabel('Mobile number').nth(1).fill('9876543210');
  await page.getByLabel('House, building and street').fill('12 Commerce Street');
  await page.getByLabel('City').fill('Pune');
  await page.getByLabel('PIN code').fill('411002');
  await page.getByLabel('State or union territory').selectOption('Maharashtra');
  await page.getByRole('button', { name: 'Continue to delivery' }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  await page.getByRole('button', { name: 'Review order' }).click();
  await page.getByRole('button', { name: /Place order · pay .* on delivery/ }).click();
  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
  await page.getByRole('link', { name: 'View order' }).click();
  await expect(page.getByRole('heading', { name: /Order IBZ-/ })).toBeVisible();
  await expect(page.getByText('Pay on delivery')).toBeVisible();
});

test('a new shopper registers, pays online and gets a confirmed order', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Asha Rao');
  await page.getByLabel('Mobile number').fill(phone());
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`asha-${unique()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').first().fill('Bright sunny window 42');
  await page.getByLabel('Confirm password').fill('Bright sunny window 42');
  await page.getByRole('checkbox', { name: /I accept the Terms of Use/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto('/products/arc-desk-lamp');
  await page.getByRole('button', { name: 'Buy Now' }).first().click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByLabel('House, building and street').fill('22 MG Road');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('PIN code').fill('560001');
  await page.getByLabel('State or union territory').selectOption('Karnataka');
  await page.getByRole('button', { name: 'Continue to delivery' }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: 'Review order' }).click();
  await page.getByRole('button', { name: /Place order and pay/ }).click();
  await page.getByRole('button', { name: /Pay .* securely/ }).click();
  await expect(page).toHaveURL(/\/account\/orders\/.+placed=1/);
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Confirmed').first()).toBeVisible();
});

test('the Admin signs in only on its own page; a stale legacy cookie does not break sign-in', async ({ page, context }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
  // An older build left a Path=/api cookie in many browsers; it used to shadow the new session.
  await context.addCookies([{ name: 'ib_session', value: 'c'.repeat(64), domain: '127.0.0.1', path: '/api' }]);
  // The normal sign-in refuses the Admin.
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/Admin sign-in page/)).toBeVisible();
  // The Admin page works.
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: /Sign in to the console/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  for (const path of ['/api/auth/me', '/api/notifications', '/api/admin/me']) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }
  // State-changing API calls need the site's Origin (CSRF protection); browsers send it automatically.
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/cart/merge', { data: { items: [], mode: 'RETAIL' }, headers: { Origin: origin } })).status()).toBe(200);
  expect((await page.request.post('/api/cart/merge', { data: { items: [], mode: 'RETAIL' } })).status()).toBe(403);
  for (const [path, heading] of [['orders', 'Orders'], ['moderation', 'Moderation'], ['finance', 'Commissions & settlements'], ['cms', 'Homepage & content'], ['settings', 'Platform settings'], ['audit', 'Audit log'], ['staff', 'Staff and permissions'], ['analytics', 'Analytics'], ['customers', 'People'], ['products', 'Products'], ['categories', 'Categories and GST'], ['coupons', 'Coupons'], ['reviews', 'Reviews']]) {
    await page.goto(`/admin/${path}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});

test('the admin console: URL-synced tables, Order 360, analytics, search and permissions', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(process.env.ADMIN_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Sign in to the console/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();

  // Tables keep their state in the address bar: page size and sort survive a reload.
  await page.goto('/admin/products');
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  await page.getByLabel('Rows').selectOption('50');
  await expect(page).toHaveURL(/limit=50/);
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await expect(page).toHaveURL(/sort=name/);
  await page.reload();
  await expect(page.getByLabel('Rows')).toHaveValue('50');
  await expect(page.getByRole('link', { name: /Export CSV/ })).toHaveAttribute('href', /format=csv/);

  // Order 360 opens in a drawer from the table and is linkable.
  await page.goto('/admin/orders');
  await page.getByRole('button', { name: 'Open' }).first().click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /^Order / })).toBeVisible();
  await expect(page).toHaveURL(/open=/);
  await expect(page.getByRole('dialog').getByText('Internal notes')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/open=/);

  // Analytics compares with the previous period and switches channel.
  await page.goto('/admin/analytics');
  await expect(page.getByText('Average order')).toBeVisible();
  await expect(page.getByText(/Visitor conversion rate: not available/)).toBeVisible();
  await page.getByRole('tab', { name: 'B2B business' }).click();
  await expect(page).toHaveURL(/mode=BUSINESS/);
  await expect(page.getByRole('heading', { name: 'B2B funnel' })).toBeVisible();

  // Global search finds demo products from anywhere.
  await page.getByLabel('Search the console').fill('headphones');
  await expect(page.getByRole('link', { name: /Aura wireless headphones/ }).first()).toBeVisible();

  // Only the Admin edits permissions; the matrix is shown with the Admin column locked.
  await page.goto('/admin/staff');
  await expect(page.getByRole('heading', { name: 'What each role can do' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Support agent: Answer support tickets' })).toBeChecked();
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('a shopper signing in normally lands in their account, with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const email = `shopper-${unique()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Login Check');
  await page.getByLabel('Mobile number').fill(phone());
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.locator('input[autocomplete="new-password"]').first().fill('Quiet river morning 55');
  await page.getByLabel('Confirm password').fill('Quiet river morning 55');
  await page.getByRole('checkbox', { name: /I accept the Terms of Use/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto('/login');
  // Sign out behind the app's back, then reload so no page still holds the old session; count errors from here on.
  await page.request.post('/api/auth/logout', { headers: { Origin: new URL(page.url()).origin } });
  await page.reload();
  errors.length = 0;
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.locator('input[autocomplete="current-password"]').fill('Quiet river morning 55');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: /Hello, Login/ })).toBeVisible();
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
});
