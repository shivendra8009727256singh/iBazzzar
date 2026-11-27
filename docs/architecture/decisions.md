# Architecture decisions

## Shape: a modular monolith

```
apps/web      Next.js 16 (App Router, React 19, Tailwind 4). Server-renders public pages; client components for signed-in areas.
apps/api      Express 5, native ESM JavaScript, Prisma 7 + PostgreSQL. The only writer to the database. Also runs the scheduled
              jobs (unpaid orders, business reminders, clean-up) — no separate worker or Redis queue; see services/jobs.js.
packages/shared      Pure commerce rules (GST split, pricing, coupons, shipping, status flows, permissions, GSTIN/PAN/IFSC checks).
packages/validation  Zod request schemas shared by API and web forms (same messages everywhere).
```

The browser only talks to the web origin. `apps/web/proxy.ts` forwards `/api/*` to `API_ORIGIN` at request time, so the
session cookie is first-party and one build can be deployed against any API address.

## API layout

```
src/config.js            validated env; refuses unsafe production combinations (live Razorpay keys, demo payments, console mail, http origin)
src/lib/                 db client + transactions, security (scrypt, HMAC, AES-256-GCM), audit/notify, document numbers, HTTP helpers
src/integrations/        mailer (console/SMTP), storage (local/S3), payments (Razorpay test), shipping (sandbox/manual)
src/services/            domain logic: catalog, pricing, inventory, orders, b2b, products, media, settings
src/modules/             route modules: auth, catalog, cart, orders (+payments), business, seller, community, admin/*
src/http/middleware.js   session loading, guards (auth, staff capability, seller store, business membership), origin check, errors
```

Routes validate input with shared Zod schemas, then call services inside a transaction. Services never trust the browser
for prices, quantities, ownership or roles.

## Data integrity

- **Money** is `NUMERIC(14,0)` paise in the database and integer paise in code. Discounts are allocated across lines by the
  largest-remainder method so totals always add up exactly.
- **Concurrency**: each change locks only the rows it touches (`SELECT … FOR UPDATE`, in id order). There is no global lock.
  The test suite proves 6 concurrent buyers for 3 units yield exactly 3 orders.
- **Database CHECK constraints** (`apps/api/prisma/integrity-checks.sql`, appended to the migration) keep stock
  `0 ≤ reserved ≤ onHand`, prices positive, MRP ≥ price, ratings 1–5 and coupons sane even if application code has a bug.
- **Snapshots**: order items store name, SKU, HSN, unit price, MRP, discount, taxable value and CGST/SGST/IGST. Purchase orders
  freeze the accepted quote. Later catalogue edits never rewrite history.
- **Idempotency**: checkout requires an `Idempotency-Key`; the same key with different details is rejected. PO checkout is
  idempotent per PO. Payment confirmation is idempotent per order; webhook events are de-duplicated by event id.

## Commerce rules

- **Catalogue**: `catalog_products` (the shared product page) → `product_variants` → `seller_listings` (each seller's price,
  MRP, MOQ, pack size, tiers, COD, returnability). Several sellers can offer one variant; the product page shows all offers
  and a buy box (in stock, then lowest effective price).
- **GST**: prices are GST-inclusive. Rate comes from the product's tax class, else its category's, else 18%. Sellers not
  registered under GST charge 0% and issue a bill of supply. Intra-state supply (seller state = delivery state) splits into
  CGST + SGST; otherwise IGST. Shipping and the COD fee carry 18% GST as services.
- **Shipping**: per seller parcel — free above the threshold, else base fee plus a per-kg surcharge. Delivery estimates use
  PIN-code geography (sorting district / circle / zone) plus the seller's handling days, and are labelled as estimates.
- **Inventory**: online and bank-transfer orders reserve stock until paid or expired (scheduled job in the API); COD and credit-terms orders
  deduct immediately. Every change writes a `stock_movements` row.
- **Payments**: Razorpay test mode only. An order becomes paid only through a verified checkout signature, a verified
  webhook (amount and currency re-checked), finance confirming a bank-transfer UTR, or — in local demo mode only — a clearly
  labelled simulation. Payments arriving after cancellation are flagged for refund, never applied.
- **Marketplace money**: a seller's earnings are booked in an append-only ledger when a parcel is delivered (sale + delivery
  charge − commission). Refunds reverse proportionally. Payouts are recorded only after they happen, need a verified bank
  account, and can never exceed the payable balance. Coupons are platform-funded.
- **B2B**: RFQ (multi-item, attachments) → sent to every approved wholesale seller of the products → quotations with revisions
  and a negotiation thread → acceptance freezes a PO → auto-approved under the organisation's limit, otherwise an approver
  (never the requester, unless owner) decides → seller confirms → buyer orders at the negotiated price (online, bank transfer,
  or credit terms only if finance approved them for the organisation).

## Security

scrypt password hashing with timing-safe comparison and a dummy hash for unknown emails; HTTP-only `SameSite=Lax` session
cookie (hashed in the DB); per-account lockout after 5 failures; per-IP rate limits (Redis-backed when configured); Origin
check on every state-changing request; staff capabilities checked on every admin route; object-level checks for every
order, parcel, listing, RFQ, quote and PO; seller bank numbers AES-256-GCM encrypted; uploads identified by bytes and
re-encoded (PDFs with active content rejected); CSV exports neutralise formulas; Helmet headers on the API and security
headers on the web; CMS text is rendered as text, never as HTML.

## Deliberate limits

- Search uses PostgreSQL `pg_trgm` (typo tolerance) and SQL filters/pagination. A dedicated search engine can replace
  `services/catalog.searchCatalog` later without touching callers.
- The guided assistant is rule-based and says so. No AI provider is connected.
- Shipping uses a sandbox adapter (test tracking numbers) or the seller's own courier; no live courier is integrated.
