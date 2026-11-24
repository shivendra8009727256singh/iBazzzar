# IBazzzar — Intelligent Digital Mall

Multi-vendor B2C + B2B marketplace for India: retail shopping, wholesale with MOQ tiers, RFQs, quotations and purchase
orders with approvals, a seller hub, and a capability-based admin console.

## Quick start (local)

Requirements: Node.js 22.12+ (24 recommended). No Docker needed.

```bash
npm install
npm run db:generate
cp .env.example .env            # then edit (ADMIN_*, DATABASE_URL)
npm run dev                     # everything: local database, API on :4000, web on http://127.0.0.1:3000
npm run db:seed:sample          # once: realistic sample shop (sellers, products, customers, 90 days of orders)
```

`npm run dev` starts the embedded PostgreSQL in `.local/dev-db` by itself when `DATABASE_URL` points at this machine
(e.g. `postgresql://ibazzzar:ibazzzar_local_dev@127.0.0.1:5544/ibazzzar`), applies new migrations to it, then runs the API
and the website. Ctrl+C stops all of it. With a managed database (e.g. Aiven) in `DATABASE_URL`, it uses that database
as-is: run `npm run db:migrate` yourself when you mean to change it.

**Admin:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, run `npm run admin:create`, then sign in at
`/admin/login`. Registration never creates an admin, the console can't grant the Admin role, and the
Admin can't sign in on the normal `/login` page. Other staff (Operations, Finance, Support) are granted by the Admin
under People and sign in at `/login?portal=staff`. With no Razorpay keys and `DEMO_PAYMENTS=true`, checkout offers a clearly
labelled payment simulation; no money moves and demo orders are excluded from GMV.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local database (if needed) + migrations + API (watch) + web (dev); Ctrl+C stops all |
| `npm run dev:apps` | API + web only, for when the database is managed separately |
| `npm run db:seed:sample` | Realistic sample data, local databases only (`-- --reset`, `-- --remove`, `-- --remove-demo`) |
| `npm run worker` | Background jobs (needs Redis) |
| `npm test` | 115 API/domain tests against disposable PostgreSQL (also checks migrations match the schema) |
| `npm run test:e2e` | Playwright browser journeys against a fresh production build (builds first) |
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
