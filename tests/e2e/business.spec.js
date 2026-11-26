// Business buying in the browser: request → quote → purchase order → order on credit → dues, PO document and statement.
import { test, expect } from '@playwright/test';
import pg from 'pg';

const unique = () => Math.random().toString(36).slice(2, 8);
const phone = () => `9${String(Math.floor(100000000 + Math.random() * 899999999))}`;
const postal = { line1: '12 Commerce Street', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
const GSTIN = '27AABCU9603R1ZM';

test('a business buys on credit and sees its dues, the PO document and the monthly statement', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const headers = { Origin: baseURL };
  try {
    // A business owner and a seller, each in their own browser session.
    const ownerCtx = await browser.newContext({ extraHTTPHeaders: headers });
    const sellerCtx = await browser.newContext({ extraHTTPHeaders: headers });
    const ownerEmail = `owner-${unique()}@example.test`;
    const reg = await ownerCtx.request.post('/api/auth/register', { data: {
      accountType: 'business', name: 'Meera Joshi', email: ownerEmail, phone: phone(), password: 'Correct horse battery 9', acceptTerms: true,
      business: { legalName: 'Joshi Office Solutions Private Limited', businessType: 'PRIVATE_LIMITED', gstRegistered: false, contactPhone: phone(), address: postal },
    } });
    expect(reg.status()).toBe(201);
    const sellerReg = await sellerCtx.request.post('/api/auth/register', { data: { accountType: 'customer', name: 'Store Keeper', email: `seller-${unique()}@example.test`, phone: phone(), password: 'Correct horse battery 9', acceptTerms: true } });
    expect(sellerReg.status()).toBe(201);
    const sellerId = (await sellerReg.json()).user.id;

    // Verification and credit are staff decisions; set them directly for this journey.
    const { rows: [org] } = await db.query(`SELECT o.id FROM organizations o JOIN organization_members m ON m."organizationId" = o.id JOIN users u ON u.id = m."userId" WHERE u.email = $1`, [ownerEmail]);
    await db.query(`UPDATE organizations SET status = 'APPROVED', "gstRegistered" = true, gstin = $2, "creditApproved" = true, "allowedTerms" = 'NET_30', "creditLimitPaise" = 50000000 WHERE id = $1`, [org.id, GSTIN]);
    const { rows: [store] } = await db.query(`SELECT id FROM seller_stores WHERE slug = 'the-everyday-collective'`);
    await db.query(`INSERT INTO seller_members ("storeId", "userId", role) VALUES ($1, $2, 'OWNER')`, [store.id, sellerId]);
    const { rows: [listing] } = await db.query(`SELECT l.id, cp.id AS product FROM seller_listings l JOIN product_variants v ON v.id = l."variantId" JOIN catalog_products cp ON cp.id = v."catalogProductId" WHERE cp.slug = 'notebook-work-set' AND l."storeId" = $1 LIMIT 1`, [store.id]);
    await db.query(`UPDATE inventory_balances SET "onHand" = 5000 WHERE "listingId" = $1`, [listing.id]);
    expect((await ownerCtx.request.patch('/api/business/settings', { data: { approvalThresholdPaise: 100_000_000 } })).status()).toBe(200);

    // Request → quote (NET 30) → accept → seller confirms.
    const rfq = await ownerCtx.request.post('/api/business/rfqs', { data: { title: 'Notebooks for the Pune office', deliveryPincode: '411001', notes: 'A5 ruled, GST invoice please', items: [{ catalogProductId: listing.product, description: 'Notebook work set', quantity: 40 }] } });
    expect(rfq.status()).toBe(201);
    const rfqId = (await rfq.json()).rfq.id;
    const rfqItemId = (await (await ownerCtx.request.get(`/api/business/rfqs/${rfqId}`)).json()).rfq.items[0].id;
    const quote = await sellerCtx.request.post(`/api/seller/rfqs/${rfqId}/quotes`, { data: { items: [{ rfqItemId, listingId: listing.id, quantity: 40, unitPaise: 52500 }], terms: 'Delivery within 4 working days', validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(), deliveryDays: 4, shippingPaise: 0, paymentTerms: 'NET_30' } });
    expect(quote.status()).toBe(201);
    const accepted = await ownerCtx.request.post(`/api/business/quotes/${(await quote.json()).quotationId}/accept`, { data: {} });
    const po = (await accepted.json()).purchaseOrder;
    expect(po.status).toBe('APPROVED');
    expect((await sellerCtx.request.post(`/api/seller/purchase-orders/${po.id}/confirm`, { data: {} })).status()).toBe(200);

    // The owner places the order on credit from the purchase-orders page.
    const page = await ownerCtx.newPage();
    await page.goto('/business/purchase-orders');
    await page.getByRole('button', { name: 'Place order' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Full name').fill('Meera Joshi');
    await dialog.getByLabel('Mobile number').fill(phone());
    await dialog.getByLabel('House, building and street').fill('4th Floor, Pinnacle House, FC Road');
    await dialog.getByLabel('City').fill('Pune');
    await dialog.getByLabel('PIN code').fill('411004');
    await dialog.getByLabel('State or union territory').selectOption('Maharashtra');
    await expect(dialog.getByText('Credit terms — Net 30')).toBeVisible();
    await dialog.getByRole('button', { name: /Place order for/ }).click();
    await expect(page).toHaveURL(/\/account\/orders\//);

    // Dues: ₹21,000 owed, due in about 30 days.
    await page.goto('/business/credit');
    await expect(page.getByRole('heading', { name: 'Open dues' })).toBeVisible();
    await expect(page.getByText(/Due in (29|30) days/)).toBeVisible();
    await expect(page.getByText('₹21,000').first()).toBeVisible();

    // The PO document: both parties, the buyer's GSTIN, HSN-wise lines and the total in words.
    await page.goto(`/business/purchase-orders/${po.id}`);
    await expect(page.getByRole('heading', { name: po.number })).toBeVisible();
    await expect(page.getByText(GSTIN)).toBeVisible();
    await expect(page.getByText('Rupees Twenty One Thousand Only')).toBeVisible();
    if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/po-document.png`, fullPage: true });

    // The statement shows the credit purchase and the closing balance.
    await page.goto('/business/statement');
    await expect(page.getByText('Closing balance')).toBeVisible();
    await expect(page.locator('dl').getByText('₹21,000').first()).toBeVisible();
    if (process.env.E2E_SHOTS) {
      await page.goto('/business/credit');
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/credit.png`, fullPage: true });
    }
    await ownerCtx.close();
    await sellerCtx.close();
  } finally {
    await db.end();
  }
});
