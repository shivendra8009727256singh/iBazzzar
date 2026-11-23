import { test, expect } from '@playwright/test';

for (const width of [360, 390, 430]) {
  test(`homepage and product page fit a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/products', '/products/aura-wireless-headphones', '/cart', '/wholesale', '/login', '/register']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
}

test('mobile navigation, filter sheet and sticky buy bar work', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Furniture' }).click();
  await expect(page).toHaveURL(/category=furniture/);
  await page.goto('/products/studio-task-chair');
  await expect(page.getByRole('button', { name: 'Buy now', exact: true })).toBeVisible();
});
