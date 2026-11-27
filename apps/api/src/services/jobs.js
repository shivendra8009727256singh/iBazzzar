// Scheduled maintenance, run inside the API (no separate worker, no Redis).
//
// runDueJobs() is called every minute by the API's own timer, and can also be triggered from outside — a cPanel cron
// calling POST /api/internal/jobs/run, or `npm run jobs:run` — so the work still happens when a shared host has put an
// idle app to sleep. Whoever calls it, each job runs at most once per slot: a row in `job_runs` acts as a lease
// (claimed with one atomic UPDATE), so a timer, a cron and several API instances never run the same job twice.
import { expireUnpaid } from './orders.js';
import { runB2bReminders } from './b2b-finance.js';
import { dispatchEmails } from '../lib/email.js';

const MINUTE = 60_000;
const IST_MS = 5.5 * 3_600_000;
/** A job that is still "running" after this long is assumed to have died with its process and may be claimed again. */
const LEASE_SECONDS = 10 * 60;

/** The most recent 03:30 IST at or before `now` — the nightly clean-up slot. */
export function dailySlot(now, hour = 3, minute = 30) {
  const ist = new Date(now.getTime() + IST_MS);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour, minute) - IST_MS;
  return new Date(today <= now.getTime() ? today : today - 24 * 3_600_000);
}

/** Deletes records that are no longer useful: expired sessions and links, old idempotency keys. */
async function cleanup(prisma, now) {
  const month = new Date(now.getTime() - 30 * 86_400_000);
  const [sessions, resets, verifications, keys] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: month } } }),
  ]);
  return { sessions: sessions.count, resets: resets.count, verifications: verifications.count, idempotencyKeys: keys.count };
}

/**
 * The jobs. `due(now)` returns the time a previous run must have started before for this one to be due:
 * "every 5 minutes" → five minutes ago (less a few seconds, so a once-a-minute timer doesn't slip a whole minute);
 * "nightly" → the latest 03:30 IST slot (a missed night is caught up on the next call).
 */
export const JOBS = [
  { name: 'expire-unpaid-orders', label: 'Cancel unpaid orders and release their stock', due: (now) => new Date(now.getTime() - 5 * MINUTE + 5_000), run: ({ prisma, now }) => expireUnpaid(prisma, now).then((expired) => ({ expired })) },
  { name: 'b2b-reminders', label: 'Business credit-due and quotation-expiry reminders', due: (now) => new Date(now.getTime() - 15 * MINUTE + 5_000), run: ({ prisma, now }) => runB2bReminders(prisma, now) },
  { name: 'cleanup', label: 'Nightly clean-up of expired sessions and links', due: (now) => dailySlot(now), run: ({ prisma, now }) => cleanup(prisma, now) },
];

/** Claims a job if it is due and not already running. Returns true when this caller should run it. */
async function claim(prisma, name, dueBefore) {
  const rows = await prisma.$queryRaw`
    INSERT INTO job_runs (name, "lockedUntil", "lastStartedAt")
    VALUES (${name}, now() + make_interval(secs => ${LEASE_SECONDS}::int), now())
    ON CONFLICT (name) DO UPDATE SET "lockedUntil" = EXCLUDED."lockedUntil", "lastStartedAt" = EXCLUDED."lastStartedAt"
    WHERE job_runs."lockedUntil" < now() AND (job_runs."lastStartedAt" IS NULL OR job_runs."lastStartedAt" < ${dueBefore})
    RETURNING name`;
  return rows.length === 1;
}

async function finish(prisma, name, status, result, error) {
  await prisma.jobRun.update({
    where: { name },
    data: { lockedUntil: new Date(), lastFinishedAt: new Date(), lastStatus: status, lastResult: result ?? undefined, lastError: error ?? null },
  });
}

/**
 * Runs every job that is due, one after another, then sends pending emails.
 * Returns { ran: { job: result }, skipped: [job], failed: { job: message }, emails }.
 * `force` runs the named jobs even if not yet due (still never alongside another run of the same job).
 */
export async function runDueJobs({ prisma, mailer, logger, now = new Date(), force = [] } = {}) {
  const out = { ran: {}, skipped: [], failed: {}, emails: null };
  for (const job of JOBS) {
    const dueBefore = force.includes(job.name) ? new Date(now.getTime() + MINUTE) : job.due(now);
    if (!(await claim(prisma, job.name, dueBefore))) { out.skipped.push(job.name); continue; }
    try {
      const result = await job.run({ prisma, now });
      out.ran[job.name] = result;
      await finish(prisma, job.name, 'ok', result);
      logger?.info?.({ job: job.name, result }, 'Job completed');
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 500);
      out.failed[job.name] = message;
      await finish(prisma, job.name, 'failed', null, message).catch(() => {});
      logger?.error?.({ job: job.name, err: error }, 'Job failed');
    }
  }
  // The email outbox is safe to drain from any number of callers at once (rows are claimed with SKIP LOCKED).
  if (mailer) {
    try { out.emails = await dispatchEmails(prisma, mailer, { logger }); } catch (error) { out.failed.emails = String(error?.message ?? error); }
  }
  return out;
}

/** Last run of every job, for the internal status endpoint. */
export async function jobStatus(prisma) {
  const rows = await prisma.jobRun.findMany();
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  return JOBS.map((j) => {
    const r = byName[j.name];
    return {
      name: j.name, label: j.label,
      running: Boolean(r && r.lockedUntil > new Date() && (!r.lastFinishedAt || r.lastFinishedAt < r.lastStartedAt)),
      lastStartedAt: r?.lastStartedAt ?? null, lastFinishedAt: r?.lastFinishedAt ?? null,
      lastStatus: r?.lastStatus ?? null, lastResult: r?.lastResult ?? null, lastError: r?.lastError ?? null,
    };
  });
}
