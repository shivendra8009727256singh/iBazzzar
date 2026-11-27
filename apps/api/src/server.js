// API entry point: loads .env, validates config, connects to PostgreSQL (and Redis if configured), then serves.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { dispatchEmails } from './lib/email.js';
import { runDueJobs } from './services/jobs.js';
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
// Fail fast with a clear reason instead of reporting "ready" and failing on the first request.
try {
  await prisma.$queryRaw`SELECT 1`;
} catch (error) {
  const reason = String(error?.meta?.driverAdapterError?.cause?.reason ?? error?.message ?? error);
  const hint = /certificate/i.test(reason)
    ? 'The server certificate isn’t trusted on this machine. Use ?sslmode=require in DATABASE_URL (encrypted, no certificate check), or verify-full with a trusted certificate.'
    : 'Check DATABASE_URL in .env and that the database is running and reachable.';
  logger.fatal(`Cannot reach the database: ${reason}. ${hint}`);
  process.exit(1);
}

let redis;
if (config.redisUrl) {
  const { default: IORedis } = await import('ioredis');
  // Don't retry the first connection (it's reported once below); once connected, reconnect after drops as usual.
  redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: true, retryStrategy: () => null });
  let connected = false;
  // Without a listener ioredis prints every connection error as "unhandled".
  redis.on('error', (error) => { if (connected) logger.warn(`Redis error: ${error.message}`); });
  try {
    await redis.connect();
    connected = true;
    redis.options.retryStrategy = (times) => Math.min(times * 200, 2000);
  } catch (error) {
    logger.warn(`Redis unavailable at ${new URL(config.redisUrl).host} (${error.message}); rate limits fall back to this process only`);
    redis.disconnect();
    redis = undefined;
  }
}

const mailer = await createMailer(config.mail, logger);
const app = createApp({
  prisma, config, logger, redis,
  mailer,
  storage: await createStorage(config.storage),
  payments: createPayments(config.payments),
  shipping: createShipping(),
});

const server = app.listen(config.port, config.host, () => {
  logger.info({ port: config.port, host: config.host, env: config.env, payments: config.payments.keyId ? 'razorpay-test' : config.demoPayments ? 'demo' : 'off' }, 'IBazzzar API ready');
});
server.keepAliveTimeout = 65_000;

// Customer emails are written to an outbox inside each transaction and sent from here, with retries.
const emailTimer = setInterval(() => { dispatchEmails(prisma, mailer, { logger }).catch((error) => logger.warn(`Email dispatch failed: ${error.message}`)); }, 10_000);
emailTimer.unref();

// Scheduled maintenance (unpaid orders, business reminders, nightly clean-up). Checked every minute; each job runs only
// when due, and the job_runs lease keeps it to one run however many API instances or cron calls ask at the same time.
// On hosting that puts idle apps to sleep, a cron calling POST /api/internal/jobs/run keeps it going (docs/deployment).
const runJobs = () => runDueJobs({ prisma, logger }).catch((error) => logger.warn(`Scheduled jobs failed: ${error.message}`));
const jobTimer = setInterval(runJobs, 60_000);
jobTimer.unref();
setTimeout(runJobs, 20_000).unref();

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
