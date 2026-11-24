// Runtime configuration, validated once at start-up. Unsafe production combinations stop the process early.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.url().default('http://127.0.0.1:3000'),
  DATABASE_URL: z.string().min(10, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)').optional(),
  DEMO_PAYMENTS: z.enum(['true', 'false']).default('false'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  MAIL_PROVIDER: z.enum(['console', 'smtp', 'none']).default('console'),
  MAIL_FROM: z.string().default('IBazzzar <no-reply@ibazzzar.com>'),
  SMTP_URL: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  MEDIA_DIR: z.string().default('.local/uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';

  if (e.RAZORPAY_KEY_ID && !e.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
    throw new Error('Only Razorpay test keys (rzp_test_…) are permitted until live payments are explicitly approved');
  }
  if (production) {
    if (e.DEMO_PAYMENTS === 'true') throw new Error('DEMO_PAYMENTS cannot be enabled in production');
    if (!e.APP_ENCRYPTION_KEY) throw new Error('APP_ENCRYPTION_KEY is required in production');
    if (e.MAIL_PROVIDER === 'console') throw new Error('Configure MAIL_PROVIDER=smtp (or none) in production');
    if (!e.WEB_ORIGIN.startsWith('https://')) throw new Error('WEB_ORIGIN must use https in production');
  }
  if (e.MAIL_PROVIDER === 'smtp' && !e.SMTP_URL) throw new Error('SMTP_URL is required when MAIL_PROVIDER=smtp');
  if (e.STORAGE_DRIVER === 's3' && (!e.S3_BUCKET || !e.S3_REGION)) throw new Error('S3_BUCKET and S3_REGION are required when STORAGE_DRIVER=s3');

  return {
    env: e.NODE_ENV,
    production,
    port: e.PORT,
    host: e.HOST,
    origin: e.WEB_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    trustProxy: e.TRUST_PROXY,
    // A fixed development key keeps local data readable across restarts; production must supply its own.
    encryptionKey: e.APP_ENCRYPTION_KEY ?? '0'.repeat(63) + '1',
    demoPayments: e.DEMO_PAYMENTS === 'true',
    payments: { keyId: e.RAZORPAY_KEY_ID, keySecret: e.RAZORPAY_KEY_SECRET, webhookSecret: e.RAZORPAY_WEBHOOK_SECRET },
    mail: { provider: e.MAIL_PROVIDER, from: e.MAIL_FROM, smtpUrl: e.SMTP_URL },
    storage: {
      driver: e.STORAGE_DRIVER, mediaDir: e.MEDIA_DIR,
      s3: { bucket: e.S3_BUCKET, region: e.S3_REGION, endpoint: e.S3_ENDPOINT, accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY, publicUrl: e.S3_PUBLIC_URL },
    },
    logLevel: e.LOG_LEVEL,
  };
}
