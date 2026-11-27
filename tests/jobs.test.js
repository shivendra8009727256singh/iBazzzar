// Scheduled maintenance inside the API: unpaid orders, business reminders, nightly clean-up, the job_runs lease that
// keeps each job to one run, and the internal endpoint a cPanel cron calls.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createContext, address, key } from './setup/context.js';
import { runDueJobs, dailySlot, JOBS } from '../apps/api/src/services/jobs.js';

const INTERNAL = 'jobs-test-internal-key-0123456789';
let ctx;
beforeAll(async () => { ctx = await createContext(); });
afterAll(async () => { await ctx?.close(); });
beforeEach(async () => { await ctx.prisma.jobRun.deleteMany(); });

const run = (opts = {}) => runDueJobs({ prisma: ctx.prisma, ...opts });

/** An online-payment order that was never paid, with its payment window moved into the past (or not). */
async function unpaidOrder({ overdue = true } = {}) {
  const { agent } = await ctx.register();
  const l = await ctx.listing('ceramic-pour-over-set');
  const res = await agent.post('/api/checkout').set('Idempotency-Key', key()).send({ items: [{ listingId: l.id, quantity: 1 }], address, paymentMethod: 'ONLINE' });
  expect(res.status).toBe(201);
  if (overdue) await ctx.prisma.order.update({ where: { id: res.body.order.id }, data: { paymentDueAt: new Date(Date.now() - 60_000) } });
  return { order: res.body.order, listingId: l.id };
}

describe('database time', () => {
  it('dates written by the app agree with the database clock even when the server is not on UTC', async () => {
    // The test database runs in this machine's zone (often Asia/Kolkata); connections are switched to UTC.
    const [{ tz }] = await ctx.prisma.$queryRaw`SELECT current_setting('TimeZone') AS tz`;
    expect(tz).toBe('UTC');
    const now = new Date();
    await ctx.prisma.jobRun.create({ data: { name: 'clock-check', lockedUntil: now } });
    const [{ diff }] = await ctx.prisma.$queryRaw`SELECT abs(extract(epoch from ("lockedUntil" - now())))::float AS diff FROM job_runs WHERE name = 'clock-check'`;
    expect(diff).toBeLessThan(5);
    await ctx.prisma.$executeRaw`UPDATE job_runs SET "lastStartedAt" = now() WHERE name = 'clock-check'`;
    const row = await ctx.prisma.jobRun.findUnique({ where: { name: 'clock-check' } });
    expect(Math.abs(row.lastStartedAt.getTime() - Date.now())).toBeLessThan(5_000);
  });
});

describe('nightly slot', () => {
  it('is the latest 03:30 IST at or before now', () => {
    // 02:00 IST on 10 Dec → previous night's 03:30 IST (9 Dec 22:00 UTC).
    expect(dailySlot(new Date('2026-12-09T20:30:00Z')).toISOString()).toBe('2026-12-08T22:00:00.000Z');
    // 03:30 IST exactly, and 10:00 IST → that morning's slot.
    expect(dailySlot(new Date('2026-12-09T22:00:00Z')).toISOString()).toBe('2026-12-09T22:00:00.000Z');
    expect(dailySlot(new Date('2026-12-10T04:30:00Z')).toISOString()).toBe('2026-12-09T22:00:00.000Z');
  });
});

describe('scheduled jobs', () => {
  it('cancels unpaid orders whose payment window has passed and releases their stock', async () => {
    const late = await unpaidOrder();
    const onTime = await unpaidOrder({ overdue: false });
    const reservedBefore = (await ctx.stock(late.listingId)).reserved;
    const result = await run();
    expect(result.ran['expire-unpaid-orders'].expired).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.order.findUnique({ where: { id: late.order.id } })).status).toBe('CANCELLED');
    expect((await ctx.prisma.order.findUnique({ where: { id: onTime.order.id } })).status).toBe('AWAITING_PAYMENT');
    expect((await ctx.stock(late.listingId)).reserved).toBe(reservedBefore - 1);
    expect(await ctx.prisma.emailOutbox.count({ where: { kind: 'order.expired' } })).toBeGreaterThanOrEqual(1);
  });

  it('runs each job once per slot, and again only when due', async () => {
    const first = await run();
    expect(Object.keys(first.ran).sort()).toEqual(JOBS.map((j) => j.name).sort());
    const second = await run();
    expect(second.ran).toEqual({});
    expect(second.skipped.sort()).toEqual(JOBS.map((j) => j.name).sort());
    // Six minutes later the 5-minute job is due again; the 15-minute and nightly ones are not.
    const later = await run({ now: new Date(Date.now() + 6 * 60_000) });
    expect(Object.keys(later.ran)).toEqual(['expire-unpaid-orders']);
    // --force runs a named job now.
    expect(Object.keys((await run({ force: ['cleanup'] })).ran)).toEqual(['cleanup']);
  });

  it('never runs a job twice when several callers ask at once', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => run()));
    for (const job of JOBS) expect(results.filter((r) => job.name in r.ran)).toHaveLength(1);
  });

  it('a running job blocks others; a lease left by a crashed run is taken over', async () => {
    await ctx.prisma.jobRun.create({ data: { name: 'b2b-reminders', lockedUntil: new Date(Date.now() + 5 * 60_000), lastStartedAt: new Date(Date.now() - 20 * 60_000) } });
    expect((await run()).skipped).toContain('b2b-reminders');
    await ctx.prisma.jobRun.update({ where: { name: 'b2b-reminders' }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect(Object.keys((await run()).ran)).toContain('b2b-reminders');
  });

  it('nightly clean-up removes expired sessions and runs once a night', async () => {
    const { user } = await ctx.register();
    await ctx.prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await ctx.prisma.jobRun.create({ data: { name: 'cleanup', lockedUntil: new Date(0), lastStartedAt: new Date(dailySlot(new Date()).getTime() - 60_000) } });
    const result = await run();
    expect(result.ran.cleanup.sessions).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await run()).skipped).toContain('cleanup');
  });

  it('a failing job is recorded and does not stop the others', async () => {
    const job = JOBS.find((j) => j.name === 'b2b-reminders');
    const original = job.run;
    job.run = async () => { throw new Error('reminder service down'); };
    try {
      const result = await run();
      expect(result.failed['b2b-reminders']).toBe('reminder service down');
      expect(result.ran).toHaveProperty('expire-unpaid-orders');
      expect(result.ran).toHaveProperty('cleanup');
      const row = await ctx.prisma.jobRun.findUnique({ where: { name: 'b2b-reminders' } });
      expect(row).toMatchObject({ lastStatus: 'failed', lastError: 'reminder service down' });
      expect(row.lockedUntil.getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      job.run = original;
    }
  });
});

describe('internal endpoint for a cron', () => {
  it('needs the internal key, works without a browser Origin, and reports job status', async () => {
    const api = () => request(ctx.app);
    delete ctx.config.internalKey;
    expect((await api().post('/api/internal/jobs/run')).status).toBe(404);

    ctx.config.internalKey = INTERNAL;
    expect((await api().post('/api/internal/jobs/run')).status).toBe(401);
    expect((await api().post('/api/internal/jobs/run').set('x-internal-key', 'wrong')).status).toBe(401);

    // A queued customer email goes out with the run, as it would when a sleeping app is woken by the cron.
    await ctx.prisma.emailOutbox.create({ data: { to: 'cron-check@example.test', kind: 'test.cron', subject: 'Cron check', text: 'hello' } });
    const res = await api().post('/api/internal/jobs/run').set('x-internal-key', INTERNAL);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.ran).sort()).toEqual(JOBS.map((j) => j.name).sort());
    expect(res.body.emails.sent).toBeGreaterThanOrEqual(1);
    expect(ctx.mails.some((m) => m.subject === 'Cron check')).toBe(true);

    const status = await api().get('/api/internal/jobs').set('x-internal-key', INTERNAL);
    expect(status.status).toBe(200);
    expect(status.body.jobs.map((j) => j.name).sort()).toEqual(JOBS.map((j) => j.name).sort());
    expect(status.body.jobs.every((j) => j.lastStatus === 'ok' && !j.running)).toBe(true);
    expect((await api().get('/api/internal/jobs')).status).toBe(401);
  });
});
