# Database

PostgreSQL 16+ (tested on 18), UTF-8, extension `pg_trgm`. Schema: `apps/api/prisma/schema.prisma` (79 tables).
Migrations: `apps/api/prisma/migrations`. Integrity CHECK constraints: `apps/api/prisma/integrity-checks.sql`.

## Core relationships

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--o{ user_roles : "staff roles"
  users ||--o{ organization_members : "belongs to"
  organizations ||--o{ organization_members : has
  organizations ||--|| business_approval_policies : has
  users ||--o{ seller_members : "works in"
  seller_stores ||--o{ seller_members : has
  seller_stores ||--o| seller_payout_accounts : "bank (encrypted)"
  seller_stores ||--o{ warehouses : has

  categories ||--o{ catalog_products : groups
  tax_classes ||--o{ categories : "default GST"
  brands ||--o{ catalog_products : makes
  catalog_products ||--o{ product_variants : has
  catalog_products ||--o{ product_media : shows
  product_variants ||--o{ seller_listings : "offered by"
  seller_stores ||--o{ seller_listings : sells
  seller_listings ||--o{ price_tiers : "wholesale tiers"
  seller_listings ||--o{ inventory_balances : "stock per warehouse"
  seller_listings ||--o{ stock_movements : history
  promotions ||--o{ promotion_items : includes

  users ||--|| carts : owns
  carts ||--o{ cart_items : holds
  users ||--o{ orders : places
  orders ||--o{ seller_orders : "split per seller"
  seller_orders ||--o{ order_items : contains
  order_items ||--o| inventory_reservations : holds
  orders ||--o{ order_status_history : logs
  seller_orders ||--o| invoices : "GST invoice"
  seller_orders ||--o{ shipments : ships
  shipments ||--o{ tracking_events : tracks
  seller_orders ||--o{ returns : "returns"
  returns ||--o{ return_items : covers
  orders ||--o{ payment_intents : "Razorpay orders"
  payment_intents ||--o{ payment_transactions : captures
  orders ||--o{ refunds : "refunds"
  seller_stores ||--o{ settlement_entries : ledger
  seller_stores ||--o{ payout_records : payouts

  organizations ||--o{ rfqs : raises
  rfqs ||--o{ rfq_items : lists
  rfqs ||--o{ quotation_requests : "sent to sellers"
  quotation_requests ||--o| quotations : answered
  quotations ||--o{ quote_revisions : revisions
  quote_revisions ||--o{ quotation_items : lines
  organizations ||--o{ purchase_orders : issues
  purchase_orders ||--o| orders : "ordered as"
```

## Status flows

| Entity | Flow |
| --- | --- |
| Order | AWAITING_PAYMENT → CONFIRMED → PARTIALLY_SHIPPED / SHIPPED → DELIVERED; CANCELLED (unpaid, expired, or every parcel cancelled) |
| Seller order (parcel) | PENDING → PACKED → SHIPPED → DELIVERED; PENDING/PACKED → CANCELLED |
| Shipment | CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED; FAILED_DELIVERY → OUT_FOR_DELIVERY / RETURNED |
| Return | REQUESTED → APPROVED / REJECTED → RECEIVED → REFUNDED (when the refund is actually paid) |
| Purchase order | PENDING_APPROVAL → APPROVED / REJECTED → CONFIRMED_BY_SELLER → ORDERED |
| Listing / product | PENDING → APPROVED / REJECTED / CHANGES_REQUESTED; APPROVED ↔ PAUSED |

## Safety rules

- Never run `prisma migrate reset` or `db push` against a shared or production database.
- Apply migrations with `npm run db:migrate` (`prisma migrate deploy`) as a release step, after a backup.
- Tests never touch `.env` databases: each test file gets its own database cloned from a migrated template in a
  disposable embedded PostgreSQL cluster, and the suite fails if `schema.prisma` drifts from the migrations.
