import { defineConfig, devices } from '@playwright/test';

const channel = process.env.E2E_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: '../../.local/e2e-results',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) }, testIgnore: /mobile.spec.js/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...(channel ? { channel } : {}) }, testMatch: /mobile\.spec\.js/ },
  ],
});
