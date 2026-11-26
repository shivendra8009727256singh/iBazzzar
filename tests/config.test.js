// Database pool sizing: hosted databases get a small pool by default so the API stays under plan limits.
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../apps/api/src/config.js';

const base = { NODE_ENV: 'development', APP_ENCRYPTION_KEY: 'a'.repeat(64) };
describe('Database pool size', () => {
  it('is 10 for a local database and 4 for a hosted one, unless DATABASE_POOL_SIZE says otherwise', () => {
    expect(loadConfig({ ...base, DATABASE_URL: 'postgresql://u:p@127.0.0.1:5544/db' }).poolSize).toBe(10);
    expect(loadConfig({ ...base, DATABASE_URL: 'postgresql://u:p@localhost/db' }).poolSize).toBe(10);
    expect(loadConfig({ ...base, DATABASE_URL: 'postgresql://u:p@pg-x.aivencloud.com:23924/db?sslmode=require' }).poolSize).toBe(4);
    expect(loadConfig({ ...base, DATABASE_URL: 'postgresql://u:p@pg-x.aivencloud.com:23924/db', DATABASE_POOL_SIZE: '6' }).poolSize).toBe(6);
    expect(() => loadConfig({ ...base, DATABASE_URL: 'postgresql://u:p@h/db', DATABASE_POOL_SIZE: '0' })).toThrow();
  });
});

describe('Internal requests from the web server', () => {
  it('skip the per-address limit only with the right key', async () => {
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const { limiter, isInternalRequest } = await import('../apps/api/src/http/middleware.js');
    const key = 'k'.repeat(48);
    const app = express();
    app.use(limiter({ windowMs: 60_000, limit: 2, skip: (req) => isInternalRequest(req, key) }));
    app.get('/x', (_req, res) => res.json({ ok: true }));
    const statuses = async (headers) => { const out = []; for (let i = 0; i < 4; i++) out.push((await request(app).get('/x').set(headers)).status); return out; };
    expect(await statuses({ 'x-internal-key': key })).toEqual([200, 200, 200, 200]);
    expect(await statuses({})).toEqual([200, 200, 429, 429]);
    expect((await request(app).get('/x').set('x-internal-key', 'wrong')).status).toBe(429);
    expect(isInternalRequest({ get: () => key }, null)).toBe(false); // no key configured: nobody is exempt
  });
});

describe('Allowed site addresses (origin check)', () => {
  const db = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5544/db' };
  it('treats localhost and 127.0.0.1 on the same port as one site during development', async () => {
    const config = loadConfig({ ...base, ...db, WEB_ORIGIN: 'http://127.0.0.1:3000' });
    expect(config.allowedOrigins).toEqual(['http://127.0.0.1:3000', 'http://localhost:3000']);
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const { originCheck } = await import('../apps/api/src/http/middleware.js');
    const app = express();
    app.use(originCheck(config));
    app.post('/x', (_req, res) => res.json({ ok: true }));
    expect((await request(app).post('/x').set('Origin', 'http://localhost:3000')).status).toBe(200);
    expect((await request(app).post('/x').set('Origin', 'http://127.0.0.1:3000')).status).toBe(200);
    const evil = await request(app).post('/x').set('Origin', 'https://evil.example');
    expect(evil.status).toBe(403);
    expect(evil.body.error).toMatch(/Open the site at http:\/\/127\.0\.0\.1:3000/);
    expect((await request(app).post('/x').set('Origin', 'http://localhost:3001')).status).toBe(403);
  });

  it('in production allows only WEB_ORIGIN plus ALLOWED_ORIGINS, with no localhost twin', () => {
    const prod = { ...db, NODE_ENV: 'production', APP_ENCRYPTION_KEY: 'a'.repeat(64), INTERNAL_API_KEY: 'k'.repeat(48), MAIL_PROVIDER: 'none' };
    expect(loadConfig({ ...prod, WEB_ORIGIN: 'https://ibazzzar.com', ALLOWED_ORIGINS: 'https://www.ibazzzar.com, https://ibazzzar.vercel.app/' }).allowedOrigins)
      .toEqual(['https://ibazzzar.com', 'https://www.ibazzzar.com', 'https://ibazzzar.vercel.app']);
    expect(() => loadConfig({ ...prod, WEB_ORIGIN: 'https://ibazzzar.com', ALLOWED_ORIGINS: 'not a url' })).toThrow(/ALLOWED_ORIGINS/);
  });
});
