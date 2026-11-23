# IBazzzar Marketplace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Track progress in docs/progress.md.

**Goal:** Build a runnable retail and wholesale marketplace foundation and continue through backend, seller and admin workflows.
**Architecture:** Next.js frontend, Express ESM API, shared deterministic domain logic, repository abstraction with Prisma PostgreSQL and isolated demo/test memory.
**Tech Stack:** Next.js 16, React 19, Node 24, Express 5, Prisma 7, PostgreSQL, Redis/BullMQ, Vitest, Supertest.
**Spec:** MASTER_PROMPT.md and docs/architecture/decisions.md.

## Global Constraints
- Preserve original logo; never generate a replacement. Brand: #092C20, #174B37, #C99A3D, #F8F4E8.
- Backend native JavaScript ESM. New isolated database only. No deployment/live payments.
- Never trust client prices or role claims. Report demo mode honestly.

## Review Focus
- Duplicate checkout and webhook requests must not duplicate orders or stock deductions.
- Seller and organization IDs supplied by clients must not override ownership.
- Malformed/fractional/negative quantities and missing products must fail before stock mutations.
- Stale quoted prices and insufficient inventory must fail atomically.
- Browser refresh and failed network requests must preserve cart and form data.

### Task 1: Domain, API and persistence
Files: packages/shared/src/{index,catalogue}.js; packages/validation/src/index.js; apps/api/src/{app,service,repository,security,server}.js; apps/api/prisma/schema.prisma; tests/commerce.test.js.
Interfaces: createApp({store,config}); Marketplace(store).checkout(user,body,key); store.transaction(fn); shared priceLines(products,items,mode).
- [ ] Write and run failing Vitest/Supertest tests for prices, MOQ, auth, ownership, duplicate checkout, stock races and quote approval.
- [ ] Implement domain and repository contracts, sessions, catalogue, checkout, orders, B2B, seller/admin routes.
- [ ] Run npm test; expected all tests pass. Generate/validate Prisma schema separately; report DB availability.

### Task 2: Storefront and workspaces
Files: apps/web/app, apps/web/components, apps/web/lib, apps/web/public.
Interfaces: /api endpoints from Task 1; Product DTO has id, slug, name, sellerId, pricePaise, stock, moq, tiers, category, image.
- [ ] Build responsive branded homepage, URL search/filter, product pages, cart/wishlist and authenticated checkout.
- [ ] Build account, business RFQ, seller inventory and admin moderation workspaces with real API actions.
- [ ] Run typecheck/build and browser smoke checks; verify no mobile overflow and persisted cart.

### Task 3: Operations and release evidence
Files: infra/compose.yaml, apps/worker/src/index.js, docs/api/openapi.yaml, docs/deployment/README.md, README.md, docs/progress.md.
- [ ] Add worker, isolated infrastructure configuration, API documentation, deployment/backup guidance and CI.
- [ ] Run lint/test/typecheck/build. Review permission boundaries and fix reproduced defects.
- [ ] Record actual coverage, unmet master-prompt requirements and remaining integration blockers.
