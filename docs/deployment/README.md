# Deployment guide

Status: **not deployed.** Nothing here has been run against a real host. Production deployment, DNS changes for ibazzzar.com and Razorpay live mode all need explicit owner approval.

## What has to run

| Component | Runtime | Notes |
| --- | --- | --- |
| Web (`apps/web`) | Node 22.12+ host that runs `next start` (or a Next.js platform) | Build with `API_ORIGIN` set: the `/api` rewrite is baked in at build time |
| API (`apps/api`) | Persistent Node 22.12+ process | `APP_MODE=database`, `NODE_ENV=production`. Refuses to start in demo mode under production |
| Worker (`apps/worker`) | Persistent Node process | Needs the same `DATABASE_URL` plus `REDIS_URL` |
| PostgreSQL 15+ | Managed, UTF-8, daily backups + PITR | New dedicated database only |
| Redis 7 | Managed | BullMQ scheduler for the stock-release job |
| Object storage + CDN | S3-compatible | Not wired yet — required before sellers can upload product images |

A basic shared cPanel plan cannot run the API and worker as persistent processes. Confirm the chosen provider supports long-running Node processes before committing.

## Environment

See [`.env.example`](../../.env.example). Production rules:

- `WEB_ORIGIN=https://ibazzzar.com` — mutations from any other origin are rejected.
- Keep `RAZORPAY_KEY_ID` on a `rzp_test_` key until live mode is approved. The API refuses non-test keys by design; enabling live mode is a code change that needs review.
- Leave `BOOTSTRAP_ADMIN_EMAIL` empty. Create admins with `node scripts/grant-admin.mjs <email>` after the person registers.
- Store secrets in the host's secret manager, never in the repository.

## Release steps (staging first, then production)

1. `npm ci && npm run lint && npm test && npm run typecheck && npm run test:db`
2. Back up the target database (`pg_dump -Fc`) and confirm the backup restores.
3. `npm run db:migrate` (runs `prisma migrate deploy`; additive migrations only — review any destructive SQL before it ships).
4. `API_ORIGIN=<internal API URL> npm run build`
5. Start or roll the API, then the worker, then the web app.
6. Check `GET /api/health` → `{"status":"ok","mode":"database"}`.
7. Run the browser smoke test against staging.

**Rollback:** redeploy the previous build. Migrations are written to be backward compatible, so the old build runs on the new schema. Restore from the pre-release backup only if data was corrupted.

## Payments

1. Create Razorpay test keys and a webhook secret; set the webhook URL to `https://<api-host>/api/payments/webhook` with the `payment.captured` event.
2. Verify a test payment end to end: order page → Razorpay checkout → signature verification → webhook → order `CONFIRMED`.
3. Refunds are issued in the Razorpay dashboard and recorded in Admin → Refunds with the `rfnd_` ID. Seller payouts need Razorpay Route (or similar) onboarding; until then the ledger shows amounts as pending settlement.

## Before public launch

- Legal review: privacy policy, terms, returns policy, seller agreement, DPDP Act 2023 obligations.
- Email/SMS provider for verification, password reset and order notifications (currently in-app only).
- Change `robots.ts` from disallow-all and remove `robots: {index:false}` in `app/layout.tsx`.
- Replace demo catalogue and illustrative images with approved seller data and real product photography.
- Error monitoring (e.g. Sentry) and log shipping for the pino JSON logs.
