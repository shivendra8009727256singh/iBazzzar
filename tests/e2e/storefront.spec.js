// Browser journeys against the production build, a real API and a disposable PostgreSQL database.
import { test, expect } from '@playwright/test';

const unique = () => Math.random().toString(36).slice(2, 8);
const phone = () => `9${String(Math.floor(100000000 + Math.random() * 899999999))}`;

test.describe.configure({ mode: 'serial' });

test('homepage shows the official logo, hero and real catalogue data', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('img', { name: /iBazzzar — Intelligent Digital Mall/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to the Future of Shopping' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore Products' })).toBeVisible();
  await expect(page.getByText('Every floor of the mall')).toBeVisible();
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

test('a new shopper registers, pays online in demo mode and gets a confirmed order', async ({ page }) => {
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
  await page.getByRole('button', { name: /Simulate payment/ }).click();
  await expect(page).toHaveURL(/\/account\/orders\/.+placed=1/);
  await expect(page.getByText('Demo payment').first()).toBeVisible();
  await expect(page.getByText('Confirmed').first()).toBeVisible();
});

test('the bootstrap admin reaches the console and customers cannot', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Admin');
  await page.getByLabel('Mobile number').fill(phone());
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('e2e-admin@example.test');
  await page.locator('input[autocomplete="new-password"]').first().fill('Admin console phrase 77');
  await page.getByLabel('Confirm password').fill('Admin console phrase 77');
  await page.getByRole('checkbox', { name: /I accept the Terms of Use/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Marketplace overview' })).toBeVisible();
  for (const [path, heading] of [['orders', 'Orders'], ['moderation', 'Moderation'], ['finance', 'Commissions & settlements'], ['cms', 'Homepage & content'], ['settings', 'Platform settings'], ['audit', 'Audit log']]) {
    await page.goto(`/admin/${path}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});
