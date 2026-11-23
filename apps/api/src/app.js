// Express application factory. Dependencies are injected so tests run the real app against a disposable database.
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { loadSession, originCheck, limiter, errorHandler } from './http/middleware.js';
import { RedisRateStore } from './http/redis-rate-store.js';
import { registerAuth } from './modules/auth.js';
import { registerCatalog } from './modules/catalog.js';
import { registerCart } from './modules/cart.js';
import { registerOrders } from './modules/orders.js';
import { registerBusiness } from './modules/business.js';
import { registerSeller } from './modules/seller.js';
import { registerCommunity } from './modules/community.js';
import { registerAdminPeople } from './modules/admin/people.js';
import { registerAdminCommerce } from './modules/admin/commerce.js';
import { registerAdminPlatform } from './modules/admin/platform.js';
import { registerAdminCatalog } from './modules/admin/catalog.js';
import { registerAdminInsights } from './modules/admin/insights.js';

export function createApp({ prisma, config, mailer, storage, payments, shipping, logger, redis }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use((req, res, next) => {
    req.id = req.get('x-request-id')?.slice(0, 64) || randomUUID();
    res.set('X-Request-Id', req.id);
    req.log = logger?.child?.({ requestId: req.id });
    next();
  });
  // The web app proxies /api on the same origin, so cross-origin browser access is not needed and is not granted.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const store = (name) => (redis ? new RedisRateStore(redis, `rl:${name}:`) : undefined);
  const limits = {
    global: limiter({ windowMs: 60_000, limit: 300, store: store('global') }),
    auth: limiter({ windowMs: 15 * 60_000, limit: 30, store: store('auth') }),
    adminLogin: limiter({ windowMs: 15 * 60_000, limit: 10, store: store('admin-login') }),
    reset: limiter({ windowMs: 15 * 60_000, limit: 10, store: store('reset') }),
    checkout: limiter({ windowMs: 60_000, limit: 20, store: store('checkout') }),
    write: limiter({ windowMs: 60_000, limit: 30, store: store('write') }),
  };

  app.get('/api/health', async (_req, res) => {
    let database = 'ok';
    try { await prisma.$queryRaw`SELECT 1`; } catch { database = 'unavailable'; }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded', database,
      payments: payments.mode, demoPayments: config.demoPayments && !payments.configured,
      email: mailer.provider, storage: storage.driver, shipping: shipping.live ? 'live' : 'sandbox',
      time: new Date().toISOString(),
    });
  });

  app.use(cookieParser());
  // The webhook needs the raw body for signature checks, so it is registered inside orders before JSON parsing applies.
  app.use('/api', limits.global, originCheck(config), loadSession(prisma));
  app.use((req, res, next) => (req.path === '/api/payments/webhook' ? next() : express.json({ limit: '256kb' })(req, res, next)));

  const ctx = { prisma, config, mailer, storage, payments, shipping, logger, limits };
  registerAuth(app, ctx);
  registerCatalog(app, ctx);
  registerCart(app, ctx);
  registerOrders(app, ctx);
  registerBusiness(app, ctx);
  registerSeller(app, ctx);
  registerCommunity(app, ctx);
  registerAdminInsights(app, ctx);
  registerAdminPeople(app, ctx);
  registerAdminCatalog(app, ctx);
  registerAdminCommerce(app, ctx);
  registerAdminPlatform(app, ctx);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
  app.use(errorHandler(logger));
  return app;
}
