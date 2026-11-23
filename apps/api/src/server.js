// API entry point: loads .env, validates config, connects to PostgreSQL (and Redis if configured), then serves.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createPrisma } from './lib/db.js';
import { createMailer } from './integrations/mailer.js';
import { createStorage } from './integrations/storage.js';
import { createPayments } from './integrations/payments.js';
import { createShipping } from './integrations/shipping.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const config = loadConfig();
const logger = pino({ level: config.logLevel, redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash'] });

const prisma = createPrisma(config);
await prisma.$connect();

let redis;
if (config.redisUrl) {
  const { default: IORedis } = await import('ioredis');
  redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: true });
  try { await redis.connect(); } catch (error) {
    logger.warn({ err: error }, 'Redis unavailable; rate limits fall back to this process only');
    redis.disconnect();
    redis = undefined;
  }
}

const app = createApp({
  prisma, config, logger, redis,
  mailer: await createMailer(config.mail, logger),
  storage: await createStorage(config.storage),
  payments: createPayments(config.payments),
  shipping: createShipping(),
});

const server = app.listen(config.port, config.host, () => {
  logger.info({ port: config.port, host: config.host, env: config.env, payments: config.payments.keyId ? 'razorpay-test' : config.demoPayments ? 'demo' : 'off' }, 'IBazzzar API ready');
});
server.keepAliveTimeout = 65_000;

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    redis?.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
