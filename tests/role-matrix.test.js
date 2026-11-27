// Every role against every protected API route.
//
// The route list and each route's guard are read from the API source, so a new route is covered automatically. For
// each route and each role the test checks the guard's decision: a role the guard admits must not get 401/403, and a
// role it refuses must. (Admitted requests use placeholder ids and empty bodies, so they end in 400/404 — that is fine;
// the test is about who gets past the door, not about the action itself.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createContext, ORIGIN } from './setup/context.js';
import { can, orgCan } from '../packages/shared/src/index.js';
import { hashPassword } from '../apps/api/src/lib/security.js';

const MODULES = path.resolve(import.meta.dirname, '../apps/api/src/modules');
const PASSWORD = 'Correct horse battery 9';
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

/** [{ method, path, guard }] where guard is { staff: cap } | { seller: 'any'|'owner' } | { business: perm|null } | 'auth' | null. */
function readRoutes() {
  const files = [...fs.readdirSync(MODULES).filter((f) => f.endsWith('.js')).map((f) => path.join(MODULES, f)),
    ...fs.readdirSync(path.join(MODULES, 'admin')).map((f) => path.join(MODULES, 'admin', f))];
  const routes = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const aliases = {};
    for (const m of src.matchAll(/const (\w+) = requireStaff\('([\w.]+)'\)/g)) aliases[m[1]] = { staff: m[2] };
    for (const m of src.matchAll(/const (\w+) = requireSeller\(([^)]*)\)/g)) aliases[m[1]] = { seller: /owner:\s*true/.test(m[2]) ? 'owner' : 'any' };
    for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)',([^\n]*)/g)) {
      const [, method, route, rest] = m;
      const args = rest.split(/async\s*\(|\(req,/)[0];
      let guard = null;
      const staff = args.match(/requireStaff\('([\w.]+)'\)/);
      const business = args.match(/requireBusiness\((?:'([\w.]+)'|null)?/);
      const seller = args.match(/requireSeller\(([^)]*)\)/);
      if (staff) guard = { staff: staff[1] };
      else if (business) guard = { business: business[1] ?? null };
      else if (seller) guard = { seller: /owner:\s*true/.test(seller[1]) ? 'owner' : 'any' };
      else {
        const alias = args.split(',').map((a) => a.trim()).find((a) => aliases[a]);
        if (alias) guard = aliases[alias];
        else if (route.startsWith('/api/admin/')) guard = 'anyStaff'; // checks req.staffRoles inside the handler
        else if (/requireAuth/.test(args)) guard = 'auth';
      }
      routes.push({ method, path: route, guard, file: path.basename(file) });
    }
  }
  return routes;
}

const ROUTES = readRoutes();
const fill = (p) => p.replace(/:(\w+)/g, (_, name) => (/slug|token|key/i.test(name) ? 'not-a-real-one' : FAKE_ID));

let ctx;
const actors = {};
beforeAll(async () => {
  ctx = await createContext();
  ctx.config.internalKey = INTERNAL;
  const signIn = async (email) => {
    const agent = ctx.agent();
    const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
    if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`);
    return agent;
  };
  const person = async (label) => {
    const email = `${label}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    return ctx.prisma.user.create({ data: { name: label, email, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() } });
  };

  actors.guest = { agent: ctx.agent(), kind: 'guest' };
  actors.customer = { agent: (await ctx.register()).agent, kind: 'customer' };

  actors.ADMIN = { agent: (await ctx.admin()).agent, kind: 'staff', role: 'ADMIN' };
  for (const role of ['OPERATIONS', 'FINANCE', 'SUPPORT']) {
    const u = await person(role.toLowerCase());
    actors[role] = { user: u, kind: 'staff', role };
  }

  // A store with an owner and a staff member, and a business with an owner, approver and buyer.
  const seller = await ctx.register('seller');
  const biz = await ctx.register('business');
  await ctx.approveAll();
  const storeId = seller.user.stores[0].id;
  const orgId = biz.user.organizations[0].id;
  actors.sellerOwner = { agent: seller.agent, kind: 'seller', role: 'OWNER' };
  const sellerStaff = await person('seller-staff');
  await ctx.prisma.sellerMember.create({ data: { storeId, userId: sellerStaff.id, role: 'STAFF' } });
  actors.sellerStaff = { user: sellerStaff, kind: 'seller', role: 'STAFF' };
  actors.bizOwner = { agent: biz.agent, kind: 'business', role: 'OWNER' };
  for (const role of ['APPROVER', 'BUYER']) {
    const u = await person(`biz-${role.toLowerCase()}`);
    await ctx.prisma.organizationMember.create({ data: { organizationId: orgId, userId: u.id, role } });
    actors[`biz${role[0]}${role.slice(1).toLowerCase()}`] = { user: u, kind: 'business', role };
  }

  // Staff roles are stored in the user's roles relation.
  for (const a of Object.values(actors)) {
    if (a.kind === 'staff' && a.user) await ctx.prisma.user.update({ where: { id: a.user.id }, data: { roles: { create: { role: a.role } } } });
  }
  for (const a of Object.values(actors)) if (!a.agent) a.agent = await signIn(a.user.email);
}, 120_000);
afterAll(async () => { await ctx?.close(); });

/** Should this actor get past the route's guard? */
function admitted(actor, guard) {
  if (guard === null) return true;
  if (actor.kind === 'guest') return false;
  if (guard === 'auth') return true;
  if (guard === 'anyStaff') return actor.kind === 'staff';
  if (guard.staff) return actor.kind === 'staff' && can(actor.role, guard.staff);
  if (guard.seller) return actor.kind === 'seller' && (guard.seller === 'any' || actor.role === 'OWNER');
  if ('business' in guard) return actor.kind === 'business' && (guard.business === null || orgCan(actor.role, guard.business));
  return true;
}

// Sent as the web server's own requests, which skip the per-address rate limit (this test makes thousands).
const INTERNAL = 'role-matrix-internal-key';
const call = (agent, method, url) => (method === 'get' ? agent.get(url) : agent[method](url)).set('x-internal-key', INTERNAL).send(method === 'get' ? undefined : {});

describe('route guards', () => {
  it('reads the route list from the API', () => {
    expect(ROUTES.length).toBeGreaterThan(200);
    // Every admin route except the public console metadata needs a staff capability (or, for the console's own
    // menu and 'needs attention' list, any staff role).
    const openAdmin = ROUTES.filter((r) => r.path.startsWith('/api/admin') && !r.guard?.staff && r.guard !== 'anyStaff' && r.path !== '/api/admin/meta');
    expect(openAdmin.map((r) => `${r.method.toUpperCase()} ${r.path}`)).toEqual([]);
    const openSeller = ROUTES.filter((r) => r.path.startsWith('/api/seller/') && !r.guard?.seller && !r.guard?.staff && r.guard !== 'auth');
    expect(openSeller.map((r) => `${r.method.toUpperCase()} ${r.path}`)).toEqual([]);
  });

  it('every role is admitted or refused exactly as its permissions say', async () => {
    const order = ['guest', 'customer', 'SUPPORT', 'FINANCE', 'OPERATIONS', 'sellerStaff', 'sellerOwner', 'bizBuyer', 'bizApprover', 'bizOwner', 'ADMIN'];
    const mismatches = [];
    const guarded = ROUTES.filter((r) => r.guard !== null && !/\/(logout|sessions\/revoke-others|account\/delete)$/.test(r.path));
    for (const name of order) {
      const actor = actors[name];
      // Reads first, then writes, so a write can't change what a later read sees.
      for (const r of [...guarded.filter((x) => x.method === 'get'), ...guarded.filter((x) => x.method !== 'get')]) {
        const res = await call(actor.agent, r.method, fill(r.path));
        const shouldPass = admitted(actor, r.guard);
        // A 403 that is a business rule rather than a role check (review photos need a delivered order).
        const ruleRefusal = res.status === 403 && /once you have received an order/.test(res.body.error ?? '');
        const passed = ![401, 403].includes(res.status) || ruleRefusal;
        if (shouldPass !== passed) mismatches.push(`${name.padEnd(12)} ${r.method.toUpperCase().padEnd(6)} ${r.path} → ${res.status} (expected ${shouldPass ? 'allowed' : 'refused'}) ${res.status === 403 || res.status === 401 ? res.body.error ?? '' : ''}`);
      }
      // Nothing above may have signed this actor out.
      if (actor.kind !== 'guest') expect((await call(actor.agent, 'get', '/api/auth/me')).status, `${name} still signed in`).toBe(200);
    }
    expect(mismatches).toEqual([]);
  }, 300_000);
});

describe('who can see the Admin sign-in', () => {
  it('only the Admin signs in at /admin; staff use the ordinary sign-in', async () => {
    const res = await ctx.agent().post('/api/auth/admin/login').send({ email: actors.OPERATIONS.user.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(ORIGIN).toBeTruthy();
  });
});
