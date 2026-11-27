// Every role opens every page of its area: no error page, no console errors, no failed API calls (5xx), and a heading.
// Pages a staff role may not use must say so politely instead of breaking.
import { test, expect } from '@playwright/test';
import pg from 'pg';

const unique = () => Math.random().toString(36).slice(2, 8);
const phone = () => `9${String(Math.floor(100000000 + Math.random() * 899999999))}`;
const PASSWORD = 'Correct horse battery 9';
const postal = { line1: '12 Commerce Street', city: 'Pune', state: 'Maharashtra', pincode: '411001' };

const PUBLIC = ['/', '/products', '/deals', '/brands', '/sellers', '/wholesale', '/sell', '/support', '/cart', '/wishlist', '/products/everyday-canvas-tote'];
const ACCOUNT = ['/account', '/account/orders', '/account/returns', '/account/reviews', '/account/addresses', '/account/notifications', '/account/support', '/account/profile'];
const BUSINESS = ['/business', '/business/rfqs', '/business/rfqs/new', '/business/purchase-orders', '/business/orders', '/business/credit', '/business/statement', '/business/spend', '/business/addresses', '/business/team'];
const SELLER = ['/seller', '/seller/products', '/seller/products/new', '/seller/orders', '/seller/returns', '/seller/reviews', '/seller/rfqs', '/seller/purchase-orders', '/seller/payments', '/seller/settings'];
const ADMIN_SECTIONS = ['', 'analytics', 'customers', 'organizations', 'sellers', 'staff', 'moderation', 'products', 'categories', 'brands', 'inventory', 'reviews',
  'orders', 'b2b', 'shipping', 'returns', 'promotions', 'coupons', 'payments', 'refunds', 'finance', 'cms', 'media', 'notifications', 'emails', 'support', 'reports', 'audit', 'settings'];

/** Opens each path and collects anything that went wrong. */
async function sweep(page, paths) {
  const problems = [];
  const consoleErrors = [];
  const onConsole = (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) consoleErrors.push(m.text()); };
  const onResponse = (r) => { if (r.url().includes('/api/') && r.status() >= 500) problems.push(`${page.url()} → ${r.status()} ${new URL(r.url()).pathname}`); };
  page.on('console', onConsole);
  page.on('response', onResponse);
  for (const path of paths) {
    consoleErrors.length = 0;
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // Every role here browses from one address, so the per-address limit (300 requests a minute) can trip. Real
    // visitors don't share one address like this; wait the minute out and load the page again.
    if (await page.getByText('Too many requests').count()) {
      await page.waitForTimeout(61_000);
      consoleErrors.length = 0;
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    if (await page.getByRole('heading', { name: 'Something went wrong' }).count()) problems.push(`${path}: error page`);
    try { await page.locator('h1').first().waitFor({ timeout: 8_000 }); } catch {
      const shot = `.local/e2e-results/no-heading-${path.replace(/\W+/g, '-')}.png`;
      await page.screenshot({ path: shot });
      problems.push(`${path}: no heading (${shot})`);
    }
    for (const e of consoleErrors) problems.push(`${path}: console error: ${e.slice(0, 160)}`);
  }
  page.off('console', onConsole);
  page.off('response', onResponse);
  return problems;
}

test('every role can open every page of its area without errors', async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const headers = { Origin: baseURL };
  const report = [];
  try {
    const register = async (body) => {
      const ctx = await browser.newContext({ extraHTTPHeaders: headers });
      const email = `${body.accountType}-${unique()}@example.test`;
      const res = await ctx.request.post('/api/auth/register', { data: { name: 'Role Check', email, phone: phone(), password: PASSWORD, acceptTerms: true, ...body } });
      expect(res.status(), `register ${body.accountType}`).toBe(201);
      return { ctx, email, id: (await res.json()).user.id };
    };
    /** A plain account given a role directly in the database (staff roles and team members are granted, not applied for). */
    const member = async (sql, params) => {
      const p = await register({ accountType: 'customer' });
      await db.query(sql, [p.id, ...params]);
      return p;
    };

    // Guest
    const guest = await browser.newContext();
    report.push(...(await sweep(await guest.newPage(), [...PUBLIC, '/login', '/register'])).map((x) => `guest ${x}`));

    // Customer
    const customer = await register({ accountType: 'customer' });
    report.push(...(await sweep(await customer.ctx.newPage(), [...PUBLIC.slice(0, 3), ...ACCOUNT])).map((x) => `customer ${x}`));

    // Business: owner, approver, buyer
    const owner = await register({ accountType: 'business', business: { legalName: `Role Check ${unique()} Private Limited`, businessType: 'PRIVATE_LIMITED', gstRegistered: false, contactPhone: phone(), address: postal } });
    const { rows: [org] } = await db.query(`SELECT m."organizationId" AS id FROM organization_members m WHERE m."userId" = $1`, [owner.id]);
    await db.query(`UPDATE organizations SET status = 'APPROVED' WHERE id = $1`, [org.id]);
    const approver = await member(`INSERT INTO organization_members ("organizationId", "userId", role) VALUES ($2, $1, 'APPROVER')`, [org.id]);
    const buyer = await member(`INSERT INTO organization_members ("organizationId", "userId", role) VALUES ($2, $1, 'BUYER')`, [org.id]);
    for (const [name, p] of [['business owner', owner], ['business approver', approver], ['business buyer', buyer]]) {
      report.push(...(await sweep(await p.ctx.newPage(), BUSINESS)).map((x) => `${name} ${x}`));
    }

    // Seller: owner and staff (the sample store, which has products and orders)
    const { rows: [store] } = await db.query(`SELECT id FROM seller_stores WHERE slug = 'the-everyday-collective'`);
    const sellerOwner = await member(`INSERT INTO seller_members ("storeId", "userId", role) VALUES ($2, $1, 'OWNER')`, [store.id]);
    const sellerStaff = await member(`INSERT INTO seller_members ("storeId", "userId", role) VALUES ($2, $1, 'STAFF')`, [store.id]);
    for (const [name, p] of [['seller owner', sellerOwner], ['seller staff', sellerStaff]]) {
      report.push(...(await sweep(await p.ctx.newPage(), SELLER)).map((x) => `${name} ${x}`));
    }

    // Staff roles open every console section; sections outside their role must show a notice, not break.
    const adminCtx = await browser.newContext({ extraHTTPHeaders: headers });
    const signedIn = await adminCtx.request.post('/api/auth/admin/login', { data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
    expect(signedIn.status()).toBe(200);
    const staff = { ADMIN: adminCtx };
    for (const role of ['OPERATIONS', 'FINANCE', 'SUPPORT']) {
      const p = await register({ accountType: 'customer' });
      await db.query(`INSERT INTO user_roles ("userId", role) VALUES ($1, $2)`, [p.id, role]);
      // A role change takes effect at the next sign-in.
      await p.ctx.request.post('/api/auth/logout');
      expect((await p.ctx.request.post('/api/auth/login', { data: { email: p.email, password: PASSWORD } })).status()).toBe(200);
      staff[role] = p.ctx;
    }
    for (const [role, ctx] of Object.entries(staff)) {
      report.push(...(await sweep(await ctx.newPage(), ADMIN_SECTIONS.map((s) => `/admin/${s}`))).map((x) => `${role} ${x}`));
    }
  } finally {
    await db.end();
  }
  expect(report).toEqual([]);
});
