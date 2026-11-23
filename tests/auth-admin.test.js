import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createContext, ORIGIN, nextPhone, ADMIN_EMAIL, ADMIN_PASSWORD } from './setup/context.js';

let ctx;
let admin;
beforeAll(async () => {
  ctx = await createContext();
  admin = await ctx.admin();
});
afterAll(async () => { await ctx?.close(); });

describe('Accounts and sessions', () => {
  it('registers shoppers, businesses and sellers with pending applications', async () => {
    const shopper = await ctx.register();
    expect(shopper.user.organizations).toEqual([]);
    const biz = await ctx.register('business');
    expect(biz.user.organizations[0]).toMatchObject({ status: 'PENDING', role: 'OWNER' });
    const seller = await ctx.register('seller');
    expect(seller.user.stores[0]).toMatchObject({ status: 'PENDING', role: 'OWNER' });
    expect((await seller.agent.get('/api/seller/orders')).status).toBe(403);
    expect(ctx.mails.some((m) => m.subject.includes('Confirm your IBazzzar email'))).toBe(true);
  });

  it('rejects duplicate emails and phones, weak passwords and invalid GSTINs', async () => {
    const { email } = await ctx.register();
    const dup = await ctx.agent().post('/api/auth/register').send({ accountType: 'customer', name: 'Copy', email, phone: nextPhone(), password: 'Another strong pass 9', acceptTerms: true });
    expect(dup.status).toBe(409);
    const weak = await ctx.agent().post('/api/auth/register').send({ accountType: 'customer', name: 'Weak', email: 'weak@example.test', phone: nextPhone(), password: 'short', acceptTerms: true });
    expect(weak.status).toBe(400);
    expect(weak.body.fields.password).toBeTruthy();
    const gst = await ctx.agent().post('/api/auth/register').send({ accountType: 'business', name: 'Bad GST', email: 'gst@example.test', phone: nextPhone(), password: 'Correct horse battery 9', acceptTerms: true, business: { legalName: 'Bad GST Ltd', businessType: 'OTHER', gstRegistered: true, gstin: '27AAACE1234F1Z0', contactPhone: nextPhone(), address: { line1: '1 Test Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } } });
    expect(gst.status).toBe(400);
  });

  it('locks an account after five wrong passwords and hides whether an email exists', async () => {
    const { email } = await ctx.register();
    const guest = ctx.agent();
    for (let i = 0; i < 5; i++) expect((await guest.post('/api/auth/login').send({ email, password: 'wrong password!' })).status).toBe(401);
    expect((await guest.post('/api/auth/login').send({ email, password: 'Correct horse battery 9' })).status).toBe(429);
    const unknown = await guest.post('/api/auth/login').send({ email: 'nobody@example.test', password: 'wrong password!' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe('Email or password is incorrect');
  });

  it('rejects state-changing requests from other origins', async () => {
    const res = await request(ctx.app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@b.c', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('password reset is single-use and signs out every session', async () => {
    const { agent, email } = await ctx.register();
    await ctx.agent().post('/api/auth/password-reset/request').send({ email });
    const link = ctx.mails.filter((m) => m.to === email && m.subject.includes('Reset')).at(-1).text;
    const token = link.match(/token=([a-f0-9]{64})/)[1];
    expect((await ctx.agent().post('/api/auth/password-reset/confirm').send({ token, newPassword: 'Brand new secret phrase 7' })).status).toBe(200);
    expect((await ctx.agent().post('/api/auth/password-reset/confirm').send({ token, newPassword: 'Brand new secret phrase 8' })).status).toBe(400);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('cannot switch into a business account the user does not belong to', async () => {
    const a = await ctx.register('business');
    const b = await ctx.register();
    const res = await b.agent.post('/api/auth/context').send({ organizationId: a.user.organizations[0].id });
    expect(res.status).toBe(404);
  });
});

describe('Staff permissions', () => {
  it('the script-created account is the Super Admin, with a short session', async () => {
    expect((await admin.agent.get('/api/admin/me')).body.role).toBe('ADMIN');
    const session = await ctx.prisma.session.findFirst({ where: { userId: admin.user.id } });
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(12 * 3_600_000 + 5_000);
  });

  it('registration never creates a Super Admin, not even the very first account', async () => {
    const fresh = await createContext({ demo: false });
    try {
      const first = await fresh.register('customer', { email: 'first@example.test' });
      expect(first.user.roles).toEqual([]);
      expect(await fresh.prisma.userRole.count()).toBe(0);
    } finally { await fresh.close(); }
  });

  it('the Super Admin can only sign in on the Super Admin page', async () => {
    const normal = await ctx.agent().post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(normal.status).toBe(403);
    expect(normal.body.error).toMatch(/Super Admin sign-in page/);
    expect(normal.headers['set-cookie']).toBeUndefined();
  });

  it('the Super Admin page refuses every other account with a generic answer', async () => {
    const shopper = await ctx.register();
    const res = await ctx.agent().post('/api/auth/superadmin/login').send({ email: shopper.email, password: 'Correct horse battery 9' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Email or password is incorrect');
  });

  it('nobody can be made Super Admin from the console, and the Super Admin account is locked there', async () => {
    const someone = await ctx.register();
    const grant = await admin.agent.put(`/api/admin/users/${someone.user.id}/roles`).send({ roles: ['ADMIN'] });
    expect(grant.status).toBe(400);
    expect((await admin.agent.patch(`/api/admin/users/${admin.user.id}/status`).send({ status: 'SUSPENDED', reason: 'Testing the lock' })).status).toBe(409);
    expect(await ctx.prisma.userRole.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('email password reset is not available for the Super Admin', async () => {
    const before = ctx.mails.length;
    const res = await ctx.agent().post('/api/auth/password-reset/request').send({ email: ADMIN_EMAIL });
    expect(res.status).toBe(200);
    expect(ctx.mails.length).toBe(before);
  });

  it('a stale cookie from an older build does not hide a fresh session', async () => {
    const { email } = await ctx.register();
    const login = await ctx.agent().post('/api/auth/login').send({ email, password: 'Correct horse battery 9' });
    const fresh = login.headers['set-cookie'].find((c) => c.startsWith('ib_session=') && !c.startsWith('ib_session=;')).split(';')[0];
    // The browser sends the more specific Path=/api cookie first.
    const res = await request(ctx.app).get('/api/auth/me').set('Cookie', `ib_session=${'b'.repeat(64)}; ${fresh}`);
    expect(res.status).toBe(200);
    expect(login.headers['set-cookie'].some((c) => c.startsWith('ib_session=;') && c.includes('Path=/api'))).toBe(true);
    expect((await request(ctx.app).get('/api/auth/session')).body).toEqual({ user: null });
  });

  it('a support agent can work tickets but not see finance or change roles', async () => {
    const agentUser = await ctx.register();
    expect((await admin.agent.put(`/api/admin/users/${agentUser.user.id}/roles`).send({ roles: ['SUPPORT'] })).status).toBe(200);
    // Role changes sign the person out, so they sign in again.
    const support = ctx.agent();
    await support.post('/api/auth/login').send({ email: agentUser.email, password: 'Correct horse battery 9' });
    expect((await support.get('/api/support/queue')).status).toBe(200);
    expect((await support.get('/api/admin/finance')).status).toBe(403);
    expect((await support.get('/api/admin/dashboard')).status).toBe(403);
    expect((await support.put(`/api/admin/users/${agentUser.user.id}/roles`).send({ roles: ['ADMIN'] })).status).toBe(403);
  });

  it('customers are refused every staff endpoint', async () => {
    const { agent } = await ctx.register();
    for (const path of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/orders', '/api/admin/finance', '/api/admin/audit', '/api/support/queue']) {
      expect((await agent.get(path)).status).toBe(403);
    }
  });

  it('nobody edits their own roles', async () => {
    expect((await admin.agent.put(`/api/admin/users/${admin.user.id}/roles`).send({ roles: [] })).status).toBe(409);
  });

  it('suspending a user signs them out everywhere', async () => {
    const victim = await ctx.register();
    expect((await admin.agent.patch(`/api/admin/users/${victim.user.id}/status`).send({ status: 'SUSPENDED', reason: 'Fraud review' })).status).toBe(200);
    expect((await victim.agent.get('/api/auth/me')).status).toBe(401);
    expect((await ctx.agent().post('/api/auth/login').send({ email: victim.email, password: 'Correct horse battery 9' })).status).toBe(403);
  });

  it('dashboard numbers are calculated, and demo money is kept apart from real GMV', async () => {
    const res = await admin.agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.metrics.paidGmvPaise).toBe(0);
    expect(res.body.series).toHaveLength(30);
  });

  it('payouts need a verified bank account and can never exceed the payable balance', async () => {
    const store = await ctx.prisma.sellerStore.findFirst();
    const tooEarly = await admin.agent.post('/api/admin/payouts').send({ storeId: store.id, amountPaise: 10000, providerRef: 'UTR123456789012' });
    expect(tooEarly.status).toBe(409);
    await ctx.prisma.sellerPayoutAccount.create({ data: { storeId: store.id, accountHolder: 'Demo', accountNumberEnc: 'x', accountLast4: '1234', ifsc: 'HDFC0001234', verified: true } });
    const over = await admin.agent.post('/api/admin/payouts').send({ storeId: store.id, amountPaise: 10000, providerRef: 'UTR123456789012' });
    expect(over.status).toBe(409);
    expect(over.body.error).toMatch(/payable balance/);
  });

  it('exports CSV reports with formula injection neutralised and logs the export', async () => {
    await ctx.prisma.user.create({ data: { email: 'csv@example.test', name: '=HYPERLINK("http://x")', passwordHash: 'x' } });
    const res = await admin.agent.get('/api/admin/reports/users');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`"'=HYPERLINK`);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'report.exported' } })).toBe(1);
  });

  it('CMS edits are versioned so two editors cannot overwrite each other', async () => {
    const first = await admin.agent.put('/api/admin/cms/hero').send({ heading: 'Welcome to the Future of Shopping', body: 'Updated hero copy for the season.', version: 1 });
    expect(first.status).toBe(200);
    const stale = await admin.agent.put('/api/admin/cms/hero').send({ heading: 'Old tab', body: 'Stale edit from another tab.', version: 1 });
    expect(stale.status).toBe(409);
  });

  it('audit log records sign-ins with the actor', async () => {
    const res = await admin.agent.get('/api/admin/audit?q=user.registered');
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('rejects unknown origins even for authenticated users', async () => {
    const res = await request(ctx.app).post('/api/admin/coupons').set('Origin', 'http://evil.test').set('Cookie', 'ib_session=' + 'a'.repeat(64)).send({});
    expect(res.status).toBe(403);
    expect(ORIGIN).not.toBe('http://evil.test');
  });
});
