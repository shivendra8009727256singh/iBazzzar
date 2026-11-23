# IBazzzar progress

## 2026-11-23 — production rebuild

The November 19–20 MVP stored data through a generic repository that loaded whole tables into memory, serialised every
write behind one database-wide lock, kept order lines in JSON, and had no GST, shipping charges, COD, server cart,
multi-seller offers or shipment records. It has been rebuilt. History is in git (`17fcf85` is the old MVP).

### Built

| Area | What exists now |
| --- | --- |
| Database | 79-table normalized schema (Prisma 7, PostgreSQL 18), `pg_trgm` search index, CHECK constraints for stock and money, one clean migration `202611230001_marketplace_core` |
| Backend | Modular ESM API (180 operations, `docs/api/openapi.yaml`): config validation, row-level locking, SMTP/S3/Razorpay/sandbox-shipping adapters, Redis rate limits, worker |
| Catalogue | Products → variants → per-seller listings (multi-seller offers, buy box), brands, category tree with GST classes and commission rules, attributes, media, moderation with change requests, SQL search with typo tolerance, facets, flash deals with real schedules |
| B2C | Server cart + guest cart merge, save for later, wishlist, coupons with per-user limits, per-seller shipping, PIN-code delivery estimates, COD rules, guest checkout, 4-step checkout with price-change protection, Razorpay test checkout + webhook, demo mode, parcels with tracking, GST tax invoices / bills of supply, item-level returns, refunds, reviews from delivered orders, addresses, notifications, support threads |
| B2B | Organisations with multiple members (owner/buyer/approver), verification, multi-item RFQs with attachments sent to every approved wholesale seller, quote revisions, negotiation threads, PO approval limits with separation of duties, seller confirmation, PO checkout (online, bank transfer with finance UTR confirmation, credit terms only when finance approves), organisation order history |
| Sellers | Multiple stores per person and staff roles, dashboard analytics, product/variant/offer creation, price & tier edits, stock adjustments with movement history, fulfilment (pack → sandbox or own courier → tracking → delivered), cancellations with auto-refund, returns, RFQ quoting, PO confirmation, settlement ledger, payouts, encrypted bank account, reviews |
| Admin | 26 capability-gated sections: dashboard (calculated, demo money separated), people & staff roles, business verification & credit terms, seller approval & bank verification, moderation, products, categories & tax/commission, brands, inventory, orders (incl. bank-transfer confirmation), B2B, shipping, returns, flash deals, coupons, payments & anomalies, refunds (Razorpay API or manual), settlements & payouts, homepage CMS with versioning, pages, banners, media library, broadcasts, support queue, CSV reports incl. GST, audit log, settings |
| Web | New design system on the brand palette; every homepage section from the brief; SSR catalogue and product pages with JSON-LD; sitemap/robots; account, business, seller and admin workspaces; mobile tab bar, filter sheet, sticky buy bar; accessible labels/focus/reduced motion |
| Ops | `npm run dev:db` (local embedded PostgreSQL), Dockerfiles, production compose, CI (lint, tests, typecheck, build, e2e, audit), deployment guide, `scripts/grant-admin.mjs` |

### Verified (run on 2026-11-23)

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm test` | **84 / 84** across 6 files, each on its own disposable PostgreSQL database; migration-vs-schema drift check passes |
| `npm run typecheck` | clean |
| `npm run build` | passes (49 routes + proxy) |
| `npm run test:e2e` | **10 / 10** in Microsoft Edge against the production build, real API and disposable database: homepage, typo search + URL filters + back button, product page (variants, 2 sellers, JSON-LD, delivery check), guest COD checkout, registration + demo payment, admin console, 360/390/430 px without overflow, mobile filter sheet and sticky buy bar |
| Aiven database | migration applied (79 tables). Seeding not done — see blocker 1 |

Tests that matter most: 6 concurrent buyers for 3 units → exactly 3 orders; invalid webhook signature rejected; amount
mismatch never marks paid; duplicate webhook applied once; payment after cancellation flagged, not applied; sellers can't see
or act on other sellers' orders, listings, returns or POs; approver can't approve their own PO; credit terms refused until
finance approves; last Super Admin can't be removed; CSV formula injection neutralised; CMS edits can't overwrite each other.

### Not verified

- Dockerfiles and `infra/compose.production.yaml` were written but not built (Docker isn't installed on this machine).
- Real Razorpay test payments (no keys yet) — the flow is covered with signed fake responses in tests.
- SMTP and S3 adapters (no credentials) — covered by interface, not exercised against a provider.
- CI has not run (no remote repository yet).

### Blockers needing the owner

1. **Aiven CA certificate** — download it (Aiven console → service → Overview → CA certificate), save as `.local/aiven-ca.pem`,
   and add `DATABASE_CA_CERT_FILE=.local/aiven-ca.pem` to `.env`. Then `npm run db:seed:demo` (or `db:seed` without demo data).
   TLS verification was deliberately not turned off.
2. Razorpay test keys + webhook secret.
3. SMTP provider (email verification and password reset need it in production).
4. S3-compatible bucket (+ CDN) for production uploads.
5. Brand artwork: only the hero exists; 15 scenes in `docs/ux/robotic-media.md`. Department tiles use icons until then.
6. Real product photography from sellers (demo items use illustrative placeholders and are labelled demo).
7. Courier partner for live shipping (sandbox adapter in place).
8. Hosting choice, legal review of the policy pages, GST/TCS review by a CA, approval for live payments and DNS.

### Next steps

1. Seed Aiven once the CA certificate is in place; create the first admin with `scripts/grant-admin.mjs`.
2. Push to a private GitHub repository so CI runs.
3. Choose hosting and deploy a staging environment with Razorpay test keys.
4. Commission artwork and onboard first real sellers.
