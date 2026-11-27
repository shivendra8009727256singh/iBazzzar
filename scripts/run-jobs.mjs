// Runs whatever scheduled maintenance is due, once, then exits. For a server cron that runs Node directly
// (the alternative is a cron calling POST /api/internal/jobs/run on the API):
//
//   */5 * * * *  cd /home/<user>/ibazzzar && node scripts/run-jobs.mjs >> logs/jobs.log 2>&1
//
// Safe alongside the API's own timer: each job runs at most once per slot (see apps/api/src/services/jobs.js).
// Usage: npm run jobs:run                     (everything that is due)
//        npm run jobs:run -- --force cleanup  (a named job now, even if not due)
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/src/config.js';
import { createPrisma } from '../apps/api/src/lib/db.js';
import { createMailer } from '../apps/api/src/integrations/mailer.js';
import { configureEmail } from '../apps/api/src/lib/email.js';
import { runDueJobs, JOBS } from '../apps/api/src/services/jobs.js';

loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const config = loadConfig();
const args = process.argv.slice(2);
const force = args.includes('--force') ? args.slice(args.indexOf('--force') + 1).filter((a) => !a.startsWith('--')) : [];
const unknown = force.filter((name) => !JOBS.some((j) => j.name === name));
if (unknown.length) {
  console.error(`Unknown job: ${unknown.join(', ')}. Jobs: ${JOBS.map((j) => j.name).join(', ')}`);
  process.exit(2);
}

const prisma = createPrisma({ ...config, poolSize: 2 });
const logger = { info: () => {}, warn: (m) => console.warn(m), error: (o) => console.error(o?.err?.message ?? o) };
configureEmail({ origin: config.origin });
const mailer = await createMailer(config.mail, null);
try {
  const result = await runDueJobs({ prisma, mailer, logger, force });
  const stamp = new Date().toISOString();
  for (const [name, r] of Object.entries(result.ran)) console.log(`${stamp} ran ${name} ${JSON.stringify(r)}`);
  if (result.skipped.length) console.log(`${stamp} not due or already running: ${result.skipped.join(', ')}`);
  if (result.emails) console.log(`${stamp} emails sent ${result.emails.sent}, failed ${result.emails.failed}`);
  for (const [name, m] of Object.entries(result.failed)) console.error(`${stamp} FAILED ${name}: ${m}`);
  process.exitCode = Object.keys(result.failed).length ? 1 : 0;
} finally {
  await prisma.$disconnect();
}
