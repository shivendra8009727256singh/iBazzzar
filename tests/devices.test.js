// Signed-in devices: last-active time, signing out one device or all others, and the new-sign-in alert.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createContext } from './setup/context.js';
import { deviceName } from '../packages/shared/src/index.js';

const PASSWORD = 'Correct horse battery 9';
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let ctx;
beforeAll(async () => { ctx = await createContext({ demo: false }); });
afterAll(async () => { await ctx?.close(); });

/** A fresh browser (its own cookie jar, so its own ib_device) signing in with a given user-agent. */
async function signIn(email, ua, agent = ctx.agent()) {
  const res = await agent.raw.post('/api/auth/login').set('Origin', 'http://127.0.0.1:3000').set('User-Agent', ua).send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}
const alerts = (userId) => ctx.prisma.emailOutbox.findMany({ where: { userId, kind: 'security.new-sign-in' } });

describe('device names', () => {
  it('turns user-agent strings into short names', () => {
    expect(deviceName(CHROME_WIN)).toBe('Chrome on Windows');
    expect(deviceName(SAFARI_IPHONE)).toBe('Safari on iOS');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120')).toBe('Edge on Windows');
    expect(deviceName(null)).toBe('Unknown device');
  });
});

describe('Signed-in devices', () => {
  it('alerts the owner when a new device signs in, but not for the same device or at registration', async () => {
    const { agent: laptop, user, email } = await ctx.register();
    expect(await alerts(user.id)).toHaveLength(0);

    // The registering browser signs in again: known device, no alert.
    await signIn(email, CHROME_WIN, laptop);
    expect(await alerts(user.id)).toHaveLength(0);

    // A different browser: alert by email and in-app, naming the device.
    await signIn(email, SAFARI_IPHONE);
    const [mail] = await alerts(user.id);
    expect(mail.subject).toBe('New sign-in to your IBazzzar account from Safari on iOS');
    expect(mail.text).toContain('Device: Safari on iOS');
    expect(await ctx.prisma.notification.count({ where: { userId: user.id, title: 'New sign-in to your account' } })).toBe(1);
  });

  it('an account with no known devices yet (from before this feature) is not alerted on its first sign-in', async () => {
    const { user, email } = await ctx.register();
    await ctx.prisma.knownDevice.deleteMany({ where: { userId: user.id } });
    await signIn(email, CHROME_WIN);
    expect(await alerts(user.id)).toHaveLength(0);
  });

  it('lists devices with last-active time, this device first', async () => {
    const { agent: laptop, user, email } = await ctx.register();
    await signIn(email, SAFARI_IPHONE);
    const old = new Date(Date.now() - 3 * 3_600_000);
    await ctx.prisma.session.updateMany({ where: { userId: user.id, userAgent: SAFARI_IPHONE }, data: { lastSeenAt: old } });
    const { sessions } = (await laptop.get('/api/auth/sessions')).body;
    expect(sessions).toHaveLength(2);
    expect(sessions[0].current).toBe(true);
    expect(sessions[1]).toMatchObject({ current: false, userAgent: SAFARI_IPHONE, lastSeenAt: old.toISOString() });
  });

  it('refreshes last-active on use, at most every few minutes', async () => {
    const { agent, user } = await ctx.register();
    const stale = new Date(Date.now() - 10 * 60_000);
    await ctx.prisma.session.updateMany({ where: { userId: user.id }, data: { lastSeenAt: stale } });
    await agent.get('/api/auth/me');
    await new Promise((r) => setTimeout(r, 200)); // the update is fire-and-forget
    const [s] = await ctx.prisma.session.findMany({ where: { userId: user.id } });
    expect(s.lastSeenAt.getTime()).toBeGreaterThan(stale.getTime() + 5 * 60_000);
  });

  it('signs out one other device, forgets it, and alerts again if it signs back in', async () => {
    const { agent: laptop, user, email } = await ctx.register();
    const phone = await signIn(email, SAFARI_IPHONE);
    expect(await alerts(user.id)).toHaveLength(1);
    const { sessions } = (await laptop.get('/api/auth/sessions')).body;
    const other = sessions.find((s) => !s.current);
    const me = sessions.find((s) => s.current);

    // This device can't be removed this way, and another account can't touch these sessions.
    expect((await laptop.delete(`/api/auth/sessions/${me.id}`)).status).toBe(400);
    const stranger = (await ctx.register()).agent;
    expect((await stranger.delete(`/api/auth/sessions/${other.id}`)).status).toBe(404);
    expect((await laptop.delete('/api/auth/sessions/not-an-id')).status).toBe(404);

    const res = await laptop.delete(`/api/auth/sessions/${other.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Safari on iOS has been signed out');
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/me')).status).toBe(200);
    expect(await ctx.prisma.auditLog.count({ where: { actorId: user.id, action: 'user.session-revoked' } })).toBe(1);

    // Same phone signs in again: it was forgotten, so the owner hears about it.
    await signIn(email, SAFARI_IPHONE, phone);
    expect(await alerts(user.id)).toHaveLength(2);
  });

  it('signs out every other device at once', async () => {
    const { agent: laptop, user, email } = await ctx.register();
    const phone = await signIn(email, SAFARI_IPHONE);
    const tablet = await signIn(email, CHROME_WIN);
    const res = await laptop.post('/api/auth/sessions/revoke-others');
    expect(res.body).toMatchObject({ count: 2, message: 'Signed out of 2 other devices' });
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await tablet.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/sessions')).body.sessions).toHaveLength(1);
    expect(await ctx.prisma.knownDevice.count({ where: { userId: user.id } })).toBe(1);
    expect((await laptop.post('/api/auth/sessions/revoke-others')).body.count).toBe(0);
  });
});
