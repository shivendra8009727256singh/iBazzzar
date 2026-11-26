// Background worker (BullMQ on Redis). Runs scheduled maintenance against the same PostgreSQL database as the API.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { loadConfig } from '../../api/src/config.js';
import { createPrisma } from '../../api/src/lib/db.js';
import { expireUnpaid } from '../../api/src/services/orders.js';
import { runB2bReminders } from '../../api/src/services/b2b-finance.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const logger = pino({ name: 'ibazzzar-worker' });
const config = loadConfig();
if (!config.redisUrl) {
  logger.error('REDIS_URL is required for the worker');
  process.exit(1);
}

const prisma = createPrisma({ ...config, poolSize: 4 });
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue('maintenance', { connection });

const jobs = {
  // Unpaid orders past their payment window release their reserved stock.
  'expire-unpaid-orders': async () => ({ expired: await expireUnpaid(prisma) }),
  // Credit dues (due soon, due today, overdue) and quotations about to expire. Each reminder is sent once.
  'b2b-reminders': async () => runB2bReminders(prisma),
  // Housekeeping: expired sessions, used tokens and idempotency keys older than 30 days.
  cleanup: async () => {
    const now = new Date();
    const month = new Date(Date.now() - 30 * 86_400_000);
    const [sessions, resets, verifications, keys] = await prisma.$transaction([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: month } } }),
    ]);
    return { sessions: sessions.count, resets: resets.count, verifications: verifications.count, keys: keys.count };
  },
};

await queue.upsertJobScheduler('expire-unpaid-orders', { every: 5 * 60_000 }, { name: 'expire-unpaid-orders' });
await queue.upsertJobScheduler('b2b-reminders', { every: 30 * 60_000 }, { name: 'b2b-reminders' });
await queue.upsertJobScheduler('cleanup', { pattern: '30 3 * * *', tz: 'Asia/Kolkata' }, { name: 'cleanup' });

const worker = new Worker('maintenance', async (job) => {
  const run = jobs[job.name];
  if (!run) throw new Error(`Unknown job ${job.name}`);
  return run();
}, { connection, concurrency: 1 });

worker.on('completed', (job, result) => logger.info({ job: job.name, result }, 'Job completed'));
worker.on('failed', (job, error) => logger.error({ job: job?.name, err: error }, 'Job failed'));
logger.info('IBazzzar worker ready');

async function shutdown() {
  await worker.close();
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
