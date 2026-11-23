// Per-test-file context: a fresh PostgreSQL database cloned from the migrated template, the real Express app,
// and fake mail/storage/payment adapters that record what they were asked to do.
import { inject } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import { randomUUID, createHmac } from 'node:crypto';
import { createApp } from '../../apps/api/src/app.js';
import { createPrisma } from '../../apps/api/src/lib/db.js';
import { createPayments } from '../../apps/api/src/integrations/payments.js';
import { hashPassword } from '../../apps/api/src/lib/security.js';
import { createShipping } from '../../apps/api/src/integrations/shipping.js';
import { seedReference, seedDemo } from '../../apps/api/prisma/seed.js';

export const ORIGIN = 'http://127.0.0.1:3000';
export const ADMIN_EMAIL = 'founder@example.test';
export const ADMIN_PASSWORD = 'Super admin test phrase 2026';
export const RAZORPAY = { keyId: 'rzp_test_unit', keySecret: 'unit_test_secret', webhookSecret: 'unit_webhook_secret' };

let phoneCounter = 0;
export const nextPhone = () => `9${String(100000000 + Math.floor(Math.random() * 800000000) + (++phoneCounter)).slice(-9)}`;
export const address = { name: 'Asha Rao', phone: '9876543210', line1: '12 Commerce Street', city: 'Pune', state: 'Maharashtra', pincode: '411002' };
export const otherStateAddress = { ...address, city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' };
export const postal = { line1: '12 Commerce Street', city: 'Pune', state: 'Maharashtra', pincode: '411001' };

export async function createContext({ demo = true, payments = 'demo', fetchImpl } = {}) {
  const base = inject('databaseBaseUrl');
  const name = `t_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ibazzzar_template`);
  await admin.end();

  const prisma = createPrisma({ databaseUrl: `${base}/${name}`, poolSize: 15 });
  await seedReference(prisma);
  if (demo) await seedDemo(prisma);

  const mails = [];
  const files = new Map();
  const config = {
    origin: ORIGIN, production: false, demoPayments: payments === 'demo', encryptionKey: 'a'.repeat(64), trustProxy: 0,
  };
  const app = createApp({
    prisma, config,
    mailer: { configured: true, provider: 'test', send: async (m) => { mails.push(m); return { delivered: true }; } },
    storage: {
      driver: 'memory',
      async put(data, contentType) { const key = `${randomUUID()}.${contentType === 'application/pdf' ? 'pdf' : 'webp'}`; files.set(key, data); return { key, url: `/api/media/${key}` }; },
      async get(key) { return files.get(key) ?? null; },
      async remove(key) { files.delete(key); },
    },
    payments: createPayments(payments === 'razorpay' ? RAZORPAY : {}, { fetchImpl }),
    shipping: createShipping(),
  });

  const ctx = {
    prisma, app, mails, files, config,
    agent: () => {
      const a = request.agent(app);
      const wrap = (method) => (url) => a[method](url).set('Origin', ORIGIN);
      return { get: (url) => a.get(url), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete'), raw: a };
    },
    async register(kind = 'customer', extra = {}) {
      const agent = ctx.agent();
      const email = extra.email ?? `${kind}-${randomUUID().slice(0, 8)}@example.test`;
      const body = { accountType: kind, name: extra.name ?? 'Test Person', email, phone: nextPhone(), password: 'Correct horse battery 9', acceptTerms: true, ...extra.body };
      if (kind === 'business') body.business = { legalName: 'Test Traders Private Limited', businessType: 'PRIVATE_LIMITED', gstRegistered: false, contactPhone: nextPhone(), address: postal, ...extra.business };
      if (kind === 'seller') body.seller = { storeName: extra.storeName ?? `Store ${randomUUID().slice(0, 6)}`, description: 'Independent test seller with handmade goods.', legalName: 'Test Store', businessType: 'PROPRIETORSHIP', gstRegistered: false, primaryCategory: 'Home & Living', contactPhone: nextPhone(), pickupAddress: postal, acceptSellerTerms: true, ...extra.seller };
      const res = await agent.post('/api/auth/register').send(body);
      if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
      return { agent, user: res.body.user, email };
    },
    /** The Admin as scripts/create-admin.mjs creates it, signed in through /api/auth/admin/login. */
    async admin() {
      if (await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })) throw new Error('admin() can only be called once per context');
      const user = await prisma.user.create({ data: { name: 'Founder', email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD), emailVerifiedAt: new Date(), roles: { create: { role: 'ADMIN' } } } });
      const agent = ctx.agent();
      const res = await agent.post('/api/auth/admin/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
      return { agent, user: { ...res.body.user, id: user.id }, email: ADMIN_EMAIL };
    },
    /** Approves every pending store and organisation so tests can focus on the flow under test. */
    async approveAll() {
      await prisma.sellerStore.updateMany({ where: { status: 'PENDING' }, data: { status: 'APPROVED' } });
      await prisma.organization.updateMany({ where: { status: 'PENDING' }, data: { status: 'APPROVED' } });
    },
    async listing(slug) {
      const v = await prisma.productVariant.findFirst({ where: { catalogProductId: (await prisma.catalogProduct.findUnique({ where: { slug } })).id }, include: { listings: { orderBy: { pricePaise: 'asc' } } } });
      return v.listings[0];
    },
    async stock(listingId) {
      const b = await prisma.inventoryBalance.findFirst({ where: { listingId } });
      return { onHand: b.onHand, reserved: b.reserved };
    },
    webhook(body, { secret = RAZORPAY.webhookSecret, eventId = `evt_${randomUUID()}` } = {}) {
      const raw = JSON.stringify(body);
      const signature = createHmac('sha256', secret).update(raw).digest('hex');
      return request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).set('x-razorpay-event-id', eventId).send(raw);
    },
    async close() {
      await prisma.$disconnect();
    },
  };
  return ctx;
}

export const key = () => randomUUID();
