# IBazzzar — Intelligent Digital Mall

Multi-vendor B2C + B2B marketplace for India. Development preview: demo catalogue, no live payments, no real fulfilment.

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 16 App Router storefront and workspaces (TypeScript) |
| `apps/api` | Express 5 API, native ESM JavaScript, Prisma 7 / PostgreSQL |
| `apps/worker` | BullMQ worker (releases stock held by unpaid orders) |
| `packages/shared` | Pricing, coupons, fulfilment flow, commission, search — the single source of business rules |
| `packages/validation` | Zod request schemas |
| `docs/` | Architecture, [API](docs/api/openapi.yaml), [database ER diagram](docs/database/er-diagram.md), [deployment](docs/deployment/README.md), [progress](docs/progress.md) |

## Run locally (demo mode)

```bash
npm install
cp .env.example .env          # set BOOTSTRAP_ADMIN_EMAIL to get a local admin
npm run dev                   # API on :4000, web on :3000
```

Demo mode keeps data in API memory and clears it on restart. The first account registered with `BOOTSTRAP_ADMIN_EMAIL` becomes the admin (never in production).

To try the full journey: register → add to bag → checkout → **Simulate test payment** on the order page → sign in as a seller (apply in `/seller`, approve in `/admin`) → pack, ship, deliver → request a return or write a verified review.

## Database mode

```bash
docker compose -f infra/compose.yaml up -d   # new, dedicated Postgres + Redis
# .env: APP_MODE=database, DATABASE_URL, REDIS_URL
npm run db:migrate && npm run db:generate
npm run dev                                   # API + web
npm run worker                                # in another terminal
node scripts/grant-admin.mjs you@example.com  # after registering
```

The database must use UTF-8 encoding. Never point `DATABASE_URL` at an existing database.

## Checks

| Command | What it verifies |
| --- | --- |
| `npm test` | Vitest + Supertest: pricing, coupons, auth, tenant isolation, checkout idempotency, oversell, payments, fulfilment, returns, ledger, B2B approvals, support |
| `npm run test:db` | Same lifecycle against a disposable embedded PostgreSQL cluster (`.local/`) |
| `npm run test:browser` | Playwright (Edge) smoke test; needs API with `BOOTSTRAP_ADMIN_EMAIL=admin-smoke@example.test` and the web app running |
| `npm run lint` / `npm run typecheck` / `npm run build` | ESLint, TypeScript, production build |

## Brand assets

The official logo lives at `public/branding/ibazzzar-logo.png` (original, never edited). `node scripts/assets.mjs` copies it into the web app, trims only the white margin, and crops the emblem for the favicon, Apple icon and Open Graph image. On dark surfaces the logo always sits on an ivory plate. The robotic mall artwork is a labelled AI-generated concept; see [docs/ux/robotic-media.md](docs/ux/robotic-media.md) for the scene brief. Demo product images are illustrative placeholders until sellers upload real photos.

## Local email

Without an email provider, password-reset links are printed to the API log (non-production only). Production refuses to send rather than pretending.
