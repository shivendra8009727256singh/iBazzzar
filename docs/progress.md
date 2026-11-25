# IBazzzar progress

## 2026-11-25 — Step B: B2C customer data

| Part | What was added |
| --- | --- |
| Customer emails | Transactional outbox (`email_outbox`): emails are written in the same database transaction as the change (order confirmed with items and total, parcel shipped, delivered, cancelled, order expired, refund initiated/processed, return approved/declined, credit payment received) and sent by the API every 10 seconds with retries (1 min, 5 min, 30 min, 2 h, then failed). Safe with several API instances (`FOR UPDATE SKIP LOCKED`). The development console mailer is recorded as "logged only", never as delivered. Admin → Platform → Customer emails: status counts, filters, preview, send again. |
| Cancel paid orders | Customers can cancel any order until a parcel ships: stock is restored, each seller is told not to ship, money paid online is refunded per parcel, the coupon use is released. |
| Privacy (DPDP Act 2023) | Download my data (JSON). Delete my account with password and "DELETE": blocked with clear reasons while orders, returns or refunds are open, or for sellers, business members and staff. Name, email, phone, addresses, wishlist, cart, notifications and sessions are removed; orders and invoices stay without the person's identity (GST record-keeping); reviews show "Former customer"; the email can be registered again. |
| Buy again | On every order: puts the items back in the cart, skipping anything no longer sold. |
| My reviews | Delivered products waiting for a review with a star picker, and the reviews already written (hidden ones say why). |

Migration `202611250001_b2c_customer` (additive): `email_outbox`, `users.deletedAt`, `UserStatus.DELETED`. Applied to the configured
database (Aiven); local databases get it from `npm run dev`. Verified: 125/125 API tests (10 new in `tests/customer.test.js`),
lint, typecheck, e2e 13/13, every admin section loads with no failed API calls or console errors.

## 2026-11-23 (night) — realistic sample data for local development

`npm run db:seed:sample` fills a **local** database with a running-shop dataset: 10 GST-registered sellers across 10 states, 49 products (76 offers, variants, specs, wholesale tiers), 90 customers, 4 business buyers (two on credit terms) and ~300 orders over the last 90 days, all placed through the real order services so GST, invoices, shipments, the seller ledger, refunds, returns, reviews and payouts are consistent. Nothing is labelled "demo", so dashboards and analytics count it. `-- --reset` also removes the old demo catalogue; `-- --remove` takes the sample data out again (every record is listed in the `sampleData` setting). It refuses to run unless `DATABASE_URL` points at this machine. All e-mail addresses are `@example.com` (never delivered) and accounts share the local password `Local-Sample-2026`. Product images are still the illustrative SVGs in `apps/web/public/products`.

## 2026-11-23 (evening) — Step A: admin console

"Super Admin" is now called **Admin** everywhere: `npm run admin:create` (`scripts/create-admin.mjs`), `/admin/login`,
`ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. The rules are unchanged: only the script creates it, nobody can be
made Admin from the console, and the first account is never promoted.

| Part | What was added |
| --- | --- |
| A1 Tables | One table component for every list: search, filters, India-time date range with presets, sortable columns, 25/50/100 rows, column chooser (remembered per browser), CSV export of exactly the filtered list (up to 10,000 rows), row selection with bulk actions. All state lives in the URL, so views can be shared and survive reloads. |
| A2 360 views | Drawers for Customer 360 (spend, orders, addresses, tickets, sessions, activity), Business 360 (credit used and available, team, POs, RFQs), Seller 360 (cancellation and return rate, dispatch time, rating, money, parcels), Order 360 (parcels, payments, refunds, returns, history), Product 360 (offers with stock, sales, reviews). Internal staff notes on all five. Global search (press `/`) across orders, people, sellers, businesses, products/SKUs, tickets and coupons. |
| A3 Actions | Every action asks for a reason and is audited. Orders: cancel unpaid (single or bulk), pack/ship/cancel a parcel for the seller, same-state address change before shipping, message the customer (app + email), staff refund capped at what's still refundable, credit-terms payment, bank-transfer confirmation. People: edit, confirm email, unlock, sign out everywhere, suspend/restore (bulk too). Sellers: approve/reject/suspend (bulk), message or formal warning, commission override, payout hold (blocks payouts), bank verification, COD and handling days. Businesses: approve/reject/suspend (bulk), credit terms **and credit limit** (enforced at checkout). Catalogue: admin edits that stay live, photo order/removal, merge duplicate products, bulk approve/reject/pause/feature, offer price/status changes and stock corrections with seller notification, category create/edit/reorder/delete-when-empty, tax classes, brand create/rename/verify/merge/delete-when-empty, review hide/publish. Coupons: full edit (code locked once used), delete only if unused, usage and discount stats, bulk. Deals: edit and delete. **Permissions:** the Admin can switch each capability on or off for Operations, Finance and Support; managing staff stays Admin-only. |
| A4 Analytics | Any date range compared with the previous period of the same length; all / B2C / B2B; sales, orders, average order, units, new vs returning customers, cancellation rate, returns, refunds, commission; daily sales; sales by category and state; seller performance; top, most-returned, low-stock and never-sold products; top customers; payment mix, failed online attempts and never-paid online orders; GST summary by HSN; settlement statement; B2B funnel (RFQ → quote → accepted → PO → ordered). Download as an Excel workbook (one sheet per section), any section as CSV, or print to PDF. Demo and unpaid orders are always excluded. Visitor conversion is shown as unavailable: it needs storefront visit tracking and is never estimated. |

Database: migration `202611240001_admin_console` (additive: seller `commissionBps` / `payoutHold`, business
`creditLimitPaise`, `admin_notes` table, two CHECK constraints). Applied to the local dev database. **Not yet applied to
Aiven**: run `npm run db:migrate` with the Aiven `DATABASE_URL` before deploying this build there.

Verification: `npm test` 113/113 (20 new in `tests/admin-console.test.js`, migration drift check passes), lint clean,
typecheck clean, `npm run build` passes, `npm run test:e2e` 13/13 including a new console journey (URL-synced table state,
Order 360 drawer, analytics channel switch, global search, permission matrix, no console errors).

Not done in this step: the OpenAPI file (`docs/api/openapi.yaml`) doesn't list the new admin endpoints yet.

## 2026-11-23 (later) — sign-in fix and Admin model

- **Fixed:** signing in worked on the server but the browser then got 401s on `/api/auth/me`, `/api/notifications` and
  `/api/cart/merge`. Browsers that had used the old MVP still held an `ib_session` cookie with `Path=/api`; on `/api/*`
  requests it is sent before the new `Path=/` cookie and the server read only the first. The API now accepts the newest
  valid session among all `ib_session` values, clears the legacy cookie on sign-in/sign-out, and replaces any previous
  session on sign-in. Signed-out page loads use `/api/auth/session` (200 with `null`) so the console stays clean.
- **Admin:** created only by `npm run admin:create` from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`; exactly
  one account holds the role (the script removes it from any other). Signs in only at `/admin/login` (normal `/login`
  refuses it; the Admin page refuses everyone else with a generic error), 12-hour sessions, stricter rate limit, no
  email password reset. Registration never grants a role (bootstrap-by-email removed); the console can grant only
  Operations, Finance and Support, and can't change, suspend or re-role the Admin. `scripts/grant-admin.mjs` removed.
- Verification: 93/93 API tests (9 new), lint, typecheck, build; e2e 12/12 three runs in a row, including a browser with a
  stale `Path=/api` cookie signing in successfully, the Admin refused on `/login` and accepted on `/admin/login`,
  and a shopper sign-in with no console errors.

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
| Ops | `npm run dev:db` (local embedded PostgreSQL), Dockerfiles, production compose, CI (lint, tests, typecheck, build, e2e, audit), deployment guide, `scripts/create-admin.mjs` |

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
finance approves; last Admin can't be removed; CSV formula injection neutralised; CMS edits can't overwrite each other.

### Not verified

- Dockerfiles and `infra/compose.production.yaml` were written but not built (Docker isn't installed on this machine).
- Real Razorpay test payments (no keys yet) — the flow is covered with signed fake responses in tests.
- SMTP and S3 adapters (no credentials) — covered by interface, not exercised against a provider.
- CI has not run (no remote repository yet).

### Blockers needing the owner

1. **Sample data on Aiven** — the shared database currently holds realistic sample data for review. Remove it before going live
   (`npm run db:seed:sample -- --remove --allow-remote`). TLS follows `sslmode` in `DATABASE_URL`; no CA file is used.
2. Razorpay test keys + webhook secret.
3. SMTP provider (email verification and password reset need it in production).
4. S3-compatible bucket (+ CDN) for production uploads.
5. Brand artwork: only the hero exists; 15 scenes in `docs/ux/robotic-media.md`. Department tiles use icons until then.
6. Real product photography from sellers (demo items use illustrative placeholders and are labelled demo).
7. Courier partner for live shipping (sandbox adapter in place).
8. Hosting choice, legal review of the policy pages, GST/TCS review by a CA, approval for live payments and DNS.

### Next steps

1. Fill in Admin → Settings → Brand & site (contact details, address, GSTIN, socials) and upload final logo artwork.
2. Push to a private GitHub repository so CI runs.
3. Choose hosting and deploy a staging environment with Razorpay test keys.
4. Commission artwork and onboard first real sellers.

## Site branding, hero slider and premium homepage (2026-11-24)

- **One place for the brand**: Admin → Settings → *Brand & site* holds logo, logo mark, site name, tagline, about text,
  announcement bar, support email/phone/WhatsApp/hours, legal name, GSTIN, address and social links. Stored in the
  `site` setting, served publicly by `GET /api/site` (30 s cache) and provided to every page through `SiteProvider`.
  Header, footer, loading screen, sign-in pages, admin sidebar, page titles and emails all read it — no hard-coded brand.
- **Hero slider**: Admin → Homepage & content → *Homepage hero slides*. Add/edit in a drawer with a live preview, upload
  artwork, choose full-width photo or colour + side image, text theme, background colour, two buttons, schedule
  (show from / until — "until" adds a countdown), hide/show, reorder, delete. Storefront slider autoplays (5.5 s),
  pauses on hover/focus, respects reduced motion, has arrows, dots with progress, pause button, swipe and keyboard.
  Five slides are seeded. The first slide's headline is the page `h1`.
- The old CMS "Homepage hero" and "Announcement bar" text blocks are hidden in the admin (superseded by the above).
- **Homepage** rebuilt: category icon strip, hero, promise strip, coupon cards with copy-code, deal of the day with
  countdown, scrolling rails (best sellers, new arrivals, top rated, trending), personal/business cards, category
  tiles, top brands, wholesale hub, featured stores, sell CTA, verified reviews. No horizontal scroll at 390 px or 1440 px.
- Verified: lint, typecheck, 125 API tests, 13 browser tests (homepage test now also checks ≥4 slides and the Next control).


## Premium restyle of remaining customer pages (2026-11-24)

- Shared pieces: `PageBanner` (gradient page header with stats and actions) and `Panel` in `components/page-banner.tsx`;
  ticket-style `CouponCard` with copy button in `components/home-sections.tsx`.
- **Deals**: banner with live/coupon/max-discount stats and jump links, trust strip, coupon tickets, each deal as a
  card with a gradient header and countdown (live = red/gold, upcoming = blue), everyday-discounts rail, wholesale CTA.
- **Wholesale**: banner with CTAs, numbered "how it works", illustrative tier-pricing table (labelled as an example),
  feature grid, source-by-category chips, popular bulk products, request-a-quote band.
- **Stores**: banner with counts, category filter chips (`?category=`), store cards with coloured covers.
  **Store page**: cover, overlapping avatar, product/rating/since stats, trust row, products panel, breadcrumb.
- **Wishlist**: banner with saved count and saving vs MRP, go-to-cart, popular rail.
- **Account overview**: greeting hero with initials, verified and member-since, stat cards, quick actions, recent
  orders, business/seller cards. Account/business/seller side menu is now a card with the user's name.
- **Sign-in, register, reset password**: form in a card, segmented "sign in as" control, brand panel with benefits;
  brand name and tagline come from Brand & site.
- Verified: lint, typecheck, 125 API tests, 13 browser tests; no horizontal scroll at 390 px or 1440 px on all of these.

## Deal pricing audit (2026-11-24)

Checked the whole path a deal price takes: listing shape → deals/home/product pages → cart quote → checkout →
saved order → GST → seller earnings → refunds. One formula everywhere (`price − floor(price × bps / 10000)`),
coupon after the deal (shared across lines exactly), GST inside the final price, business buyers get the lower
of tier and deal, checkout refuses a total that changed and returns the new one, refunds use what was paid.

New `tests/deals-pricing.test.js` (9 tests): same price on deals page, product page and cart; checkout saves the
quoted deal price and every total adds up (goods, delivery, COD fee, GST incl. delivery/COD service tax); coupon
on top with cap; pausing a deal reverts the price at once and checkout refuses the stale total; scheduled and
ended deals never apply; overlapping deals use the bigger discount; invalid deals refused; business tier vs deal.

Price-carrying page caches capped at 30 s (home, deals, discount and wholesale lists, store products) so a
deal's start/end shows on listing cards within half a minute; cart and checkout are always live.

## Coupon and cart audit (2026-11-24)

Fixed:
- Cart line read "2 × ₹1,199 = ₹2,098" with a coupon (the amount after the coupon share); it now shows the plain
  product of quantity and price, with the coupon shown once in Price details.
- A coupon that stops qualifying (cart below its minimum, signing in uses a once-per-customer coupon already used,
  expired) left the cart/checkout showing the last good quote (old quantities). Coupon errors are now tagged
  (`fields.coupon`); the cart and checkout drop the coupon, say why, and re-price.
- Once-per-customer limit could be beaten by two simultaneous orders (verified by a failing test). It is now
  re-checked after the coupon row is locked in the order transaction.
- Free-delivery progress bar used the after-coupon value; it now uses the same rule as the server.

New `tests/coupons.test.js` (8 tests): exact split across items with GST per item, cap and ₹1 floor, lowercase
codes, every refusal reason marked as a coupon problem, once-per-customer with release on cancellation,
simultaneous orders (per customer and overall limit), saved order equals the coupon quote.

## Reviews with photos, all-reviews page, seller photo uploader (2026-11-25)

- Bug: a new review didn't show on the product page (30 s page cache, first visit after it still stale) and the
  "N reviews" figure was capped at 20. Reviews now load live from `GET /api/products/:id/reviews` (no-store).
- Product page: rating summary, customer-photo strip with viewer, the 5 most helpful reviews, "All N reviews".
- `/products/[slug]/reviews`: sort (most helpful, newest, highest, lowest), star and "with photos" filters,
  clickable star bars, infinite loading with a "Load more" fallback.
- Review form (order page and My reviews): stars with words, headline, text, up to 5 photos.
  `POST /api/reviews/media` — verified buyers only, 40/day, re-encoded; a review may only attach its author's uploads.
- "Helpful" votes (`POST /api/reviews/:id/helpful`, toggle, not on own review); sort by most helpful.
- Admin moderation and seller reviews show photos; Media library filters "Review photos"; removing one takes it
  off the review and tells the reviewer.
- Seller "Add product": shared uploader, max 4 photos (was 8) with guided slots (front/cover, back, side,
  close-up), drag & drop, multi-select, cover, reorder, preview. Validation enforces 4.
- Migration `202611270001_review_media` (additive) applied to Aiven. Tests: `tests/reviews.test.js` (5).
