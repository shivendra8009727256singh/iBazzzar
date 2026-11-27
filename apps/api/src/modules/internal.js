// Internal endpoints for the hosting platform, authenticated by INTERNAL_API_KEY in the x-internal-key header.
// They never use cookies, so they are exempt from the browser Origin check (see originCheck).
//
// cPanel → Cron Jobs, every 5 minutes:
//   curl -fsS -X POST -H "x-internal-key: $INTERNAL_API_KEY" https://api.example.com/api/internal/jobs/run
import { isInternalRequest } from '../http/middleware.js';
import { runDueJobs, jobStatus } from '../services/jobs.js';

export function registerInternal(app, { prisma, config, mailer, logger }) {
  const internalOnly = (req, res, next) => {
    // Without a configured key these endpoints don't exist, so nothing is guessable.
    if (!config.internalKey) return res.status(404).json({ error: 'Endpoint not found' });
    if (!isInternalRequest(req, config.internalKey)) return res.status(401).json({ error: 'A valid x-internal-key header is required' });
    next();
  };

  /** Runs whatever maintenance is due (unpaid orders, business reminders, nightly clean-up) and sends pending emails. */
  app.post('/api/internal/jobs/run', internalOnly, async (_req, res) => {
    const result = await runDueJobs({ prisma, mailer, logger });
    res.status(Object.keys(result.failed).length ? 500 : 200).json(result);
  });

  /** When each job last ran and how it went — for monitoring. */
  app.get('/api/internal/jobs', internalOnly, async (_req, res) => {
    res.json({ jobs: await jobStatus(prisma) });
  });
}
