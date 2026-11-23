import { test, expect } from '@playwright/test';

test('login fits iPhone SE and has no duplicate React keys', async ({ page }) => {
  const warnings = [];
  page.on('console', (message) => {
    if (message.text().includes('same key')) warnings.push(message.text());
  });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('admin@example.test');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(warnings).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
