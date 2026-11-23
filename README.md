# IBazzzar — Intelligent Digital Mall

Multi-vendor B2C + B2B marketplace for India: retail shopping, wholesale with MOQ tiers, RFQs, quotations and purchase
orders with approvals, a seller hub, and a capability-based admin console.

## Quick start (local)

Requirements: Node.js 22.12+ (24 recommended). No Docker needed.

```bash
npm install
npm run db:generate
cp .env.example .env            # then edit

# Option A — local database (embedded PostgreSQL, demo catalogue):
npm run dev:db                  # keep running; copy the printed DATABASE_URL into .env

# Option B — your managed database (e.g. Aiven): set DATABASE_URL and DATABASE_CA_CERT_FILE in .env, then
npm run db:migrate && npm run db:seed:demo

npm run dev                     # API on :4000, web on http://127.0.0.1:3000
```

Set `BOOTSTRAP_ADMIN_EMAIL` in `.env` and register with that email to become the local Super Admin, or run
`node scripts/grant-admin.mjs you@example.com`. With no Razorpay keys and `DEMO_PAYMENTS=true`, checkout offers a clearly
labelled payment simulation; no money moves and demo orders are excluded from GMV.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API (watch) + web (dev) |
| `npm run worker` | Background jobs (needs Redis) |
| `npm test` | 84 API/domain tests against disposable PostgreSQL (also checks migrations match the schema) |
| `npm run test:e2e` | Playwright browser journeys against the production build (run `npm run build` first) |
| `npm run check` | lint + tests + typecheck + production build |
| `npm run db:migrate` / `db:seed` / `db:seed:demo` | Apply migrations / reference data / demo catalogue |
| `node scripts/openapi.mjs` | Regenerate `docs/api/openapi.yaml` from the routes |

## Layout

```
apps/web         Next.js storefront, account, business, seller hub and admin console
apps/api         Express API (ESM JavaScript), Prisma/PostgreSQL
apps/worker      BullMQ jobs
packages/shared  Commerce rules: GST, pricing, coupons, shipping, permissions
packages/validation  Shared Zod schemas
docs/            architecture, database, API, deployment, UX media brief, progress
infra/           Dockerfiles and production compose
tests/           API tests (Vitest + Supertest) and e2e (Playwright)
```

Read `docs/architecture/decisions.md` first, then `docs/deployment/README.md` before deploying.
