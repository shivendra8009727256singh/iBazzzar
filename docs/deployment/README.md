# Deploying IBazzzar

Nothing has been deployed. Production deployment, DNS changes and live payments need the owner's explicit approval.

## What runs

| Component | Needs | Notes |
| --- | --- | --- |
| Web (`apps/web`) | Node.js 22.12+ (24 recommended) | `next start`. Reads `API_ORIGIN` at request time. |
| API (`apps/api`) | Node.js, PostgreSQL, optional Redis | Stateless; run 2+ instances behind the web for availability. |
| Worker (`apps/worker`) | Node.js, PostgreSQL, Redis | Exactly one instance. Expires unpaid orders every 5 minutes. |
| PostgreSQL | 16+, UTF-8, `pg_trgm` | Managed (Aiven, RDS, Neon, Supabase). Daily backups + point-in-time recovery. |
| Redis | 7 | Shared rate limits and job queue. |
| Object storage | S3-compatible | Product photos and documents (`STORAGE_DRIVER=s3`). Put a CDN in front via `S3_PUBLIC_URL`. |
| Email | SMTP | Verification, password reset. `MAIL_PROVIDER=smtp`, `SMTP_URL`. |

A basic shared/cPanel host cannot run this (it needs long-running Node processes and a worker). Suitable: a VPS/VM with
Docker (`infra/compose.production.yaml`), or a platform such as Render/Railway/Fly.io/AWS (web + API + worker services).

## Environment

Copy `.env.example` to `.env` and fill every value. Production refuses to start if: `NODE_ENV=production` with
`DEMO_PAYMENTS=true`, a missing `APP_ENCRYPTION_KEY`, `MAIL_PROVIDER=console`, a non-https `WEB_ORIGIN`, or any Razorpay key
that is not `rzp_test_…` (live keys stay blocked until live payments are approved — remove that check deliberately then).

Managed PostgreSQL with its own CA (Aiven): download the project CA certificate from the Aiven console and set
`DATABASE_CA_CERT_FILE=/path/to/ca.pem`. Certificate verification is always on.

Secrets live in the hosting platform's secret store, never in git. Rotate `APP_ENCRYPTION_KEY` only with a re-encryption
script (it protects seller bank account numbers).

## Release steps

1. `npm ci && npm run check` (lint, unit/integration tests, typecheck, production build) and `npm run test:e2e`.
2. Back up the database.
3. `npm run db:migrate` (or `docker run … npx prisma migrate deploy --config apps/api/prisma.config.js`).
4. First release only: `npm run db:seed` (reference data — tax classes, categories, policy pages). Do **not** pass `--demo` in production.
5. Deploy API, worker, then web. Check `GET /api/health` returns `database: ok`.
6. First administrator: register on the site, then `node scripts/grant-admin.mjs you@example.com`.

Rollback: redeploy the previous image. Migrations are additive; if one must be undone, restore the backup taken in step 2.

## Staging

Use a separate database, Redis and bucket with Razorpay test keys and `NEXT_PUBLIC_ALLOW_INDEXING` unset (pages send
`noindex`). Point Razorpay test webhooks at `https://staging…/api/payments/webhook` with the webhook secret.

## Razorpay

1. Create test keys; set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
2. Add a webhook for `payment.captured`, `order.paid`, `payment.failed` → `/api/payments/webhook`; set `RAZORPAY_WEBHOOK_SECRET`.
3. Set `DEMO_PAYMENTS=false`. Run a test payment; confirm the order turns Paid and the webhook appears under Admin → Payments.

## Monitoring

- `GET /api/health` for uptime checks (returns 503 if the database is unreachable).
- API logs are JSON (pino) with request ids; ship them to your log service. Errors 5xx are logged with stack traces.
- Watch Admin → Payments for anomalies (amount mismatch, payment after cancellation) and Admin → Refunds for pending refunds.

## Go-live checklist

- [ ] Legal review of Terms, Privacy, Returns, Shipping, Seller Agreement (CMS pages are marked as drafts)
- [ ] GST registration of the marketplace operator and TCS obligations reviewed by a CA
- [ ] Razorpay live activation and explicit approval to accept live keys
- [ ] SMTP provider with SPF/DKIM on ibazzzar.com
- [ ] S3 bucket + CDN, `STORAGE_DRIVER=s3`
- [ ] Courier partner chosen (sandbox adapter replaced)
- [ ] Real product photography from sellers; demo catalogue not seeded
- [ ] Robotic brand artwork produced (`docs/ux/robotic-media.md`)
- [ ] Backups and restore tested; alerting on health check
- [ ] `NEXT_PUBLIC_ALLOW_INDEXING=true` only on launch day
