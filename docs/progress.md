# IBazzzar progress

## 2026-11-20 — Super Admin console

- Staff roles: Super Admin (`ADMIN`), Operations manager, Finance manager, Support agent. One capability matrix in `packages/shared/src/permissions.js` guards every admin route (`staff('capability')`) and decides which console sections appear.
- `/admin/<section>` console with 25 sections: Overview (live metrics, review queues, 30-day order and paid-GMV charts with table view), Customers (search, detail panel, suspend/restore with reason, unlock, role change), Business buyers, Sellers, Approvals, Categories (add/rename/reorder/hide; renames carry products and stores), Brands, Products (moderation, homepage featuring), Inventory, Media library (remove with reason, listings return to review), Orders (detail panel, staff cancel of unpaid orders), RFQs & quotations, Shipping, Returns, Promotions & coupons, Payments, Refunds, Commissions & settlements (seller balances, payout recording with Razorpay payout ID or bank UTR, never above payable), Homepage CMS (hero + announcement, now rendered on the homepage), Notifications (in-app broadcast by audience), Support, Reports (CSV with formula-injection protection), Audit log, Staff roles, Settings (commission, return window, payment window, low-stock threshold).
- Suspended accounts are signed out everywhere and cannot sign in. Return window and payment window now come from Settings (worker reads the setting).
- Categories are database-managed (launch list used until first edit); seller and product categories are validated against the active list.
- Fixed: generic `/api/admin/:kind/:id/status` swallowed `/api/admin/users/:id/status`; a duplicate `GET /api/admin/users` shadowed the new one.
- Migration `202611200002_admin_console` (additive). OpenAPI regenerated: 109 operations, staff routes list their capability.
- Verification: 88/88 Vitest/Supertest (14 new admin tests); lint, typecheck, build pass; isolated PostgreSQL passes with no schema drift; browser 30/30 in Edge including every one of the 25 sections opening without errors for a Super Admin, CMS hero publishing to the homepage, and the mobile console menu.

## 2026-11-20 — role-based sign-in and registration

- `/register`: choose Shopper, Business buyer or Seller. One transaction creates the account and, for business buyers and sellers, a PENDING organisation or store. Fields: name, email, Indian mobile (unique), password + confirm, terms consent, marketing opt-in; business: legal/trade name, constitution, GST status, GSTIN (format + checksum), PAN (auto-filled from GSTIN, must match), contact, registered address; seller: store name, category, description, tax identity, pickup address, seller agreement.
- Team roles (business buyer/approver, seller staff) join by invitation from an owner; Support/Admin are granted by an administrator. Both are explained on the register page; neither can be self-assigned.
- `/login`: Shopper / Business / Seller / Staff portals. The portal only chooses the landing page; the staff portal signs out accounts without Support/Admin roles. Five wrong passwords lock an account for 15 minutes; unknown emails get the same response as wrong passwords.
- Email verification (24-hour single-use link) with account banner and resend. In local demo mode links are logged; production does not claim delivery without a provider.
- Client and API use the same Zod schemas from `packages/validation`. Workspace onboarding (add a business/store later) uses the same fields.
- Security fix: public `/api/sellers` and product pages now return a whitelisted seller profile, so tax IDs, phone, pickup address and legal name are never exposed.
- Layout fix: form checkboxes were inheriting `width:100%` and pushing labels off-screen at 360px.
- Migration `202611200001_role_based_accounts` (additive). The database test now applies the checked-in migration history with `prisma migrate deploy` and fails on any schema drift.
- Verification: 71/71 Vitest/Supertest (12 new account tests); lint, typecheck, build pass; isolated PostgreSQL passes (migrations, no drift, registration fields, unique mobile); browser 26/26 in Edge, all auth pages without overflow at 360px.

## 2026-11-20 — larger typography and purchase-order checkout

- Raised existing desktop/mobile font sizes across the storefront and account, seller, business and admin screens. Body is 16px; form inputs are 16px; descriptive copy is generally 15–16px; small labels/navigation are 12–15px. Kept existing font families, logo and design. Adjusted wrapping and spacing for the larger text.
- Completed seller-confirmed PO → order → existing payment flow. Requester/organization-owner permissions enforced server-side. Negotiated prices and quantities come from the approved PO snapshot, never the browser or current catalogue pricing. Stock is rechecked/reserved atomically. Permanent PO-specific idempotency prevents duplicate orders, including after cancellation. Changed shipping details on retry produce a conflict.
- Added business PO address form, order status and a private order/payment link. Other organization members can see PO status without gaining access to another user's address/payment data.
- Database test now writes generated schema SQL only to its disposable test directory, never overwriting checked-in migration history.
- Verification: 59/59 Vitest/Supertest tests; lint and typecheck pass; production build passes. Isolated PostgreSQL check passes including concurrent negotiated PO checkout. Browser check passes for homepage at 360/390/430/768/1024/1440/1920px, eight secondary pages at three widths, and mobile PO checkout → demo payment → linked PO. No browser runtime errors observed.
- Evidence: `.local/readability-po-result.json`, `.local/database-test-result.json`, screenshots under `.local/screenshots/readability-*.png` and `po-checkout-mobile.png`.
- Independent reviewer could not run because its model usage allowance was exhausted. Performed a manual authorization/price/idempotency review and exercised the boundaries with the 10 new tests instead.
- No existing database was migrated, no live financial activity occurred and nothing was deployed. Other remaining features and provider setup below are still pending.

## Previous delivery — 2026-11-19

Spec: MASTER_PROMPT.md. Environment: Node v24.14.1, npm 11.11.0, Windows. No Git repository yet.

## Verification (run 2026-11-19, all passing)

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm test` | 49/49 (Vitest + Supertest, 4 files) |
| `npm run typecheck` | clean |
| `npm run build` | passes, 25 routes |
| `npm run test:db` | pass — isolated embedded PostgreSQL 18 (UTF-8): migration, concurrent checkout, cancellation, coupon → payment → fulfilment → ledger → return → refund, media, variants, staff roles, reset tokens |
| `npm run test:browser` | 22/22 in Edge against production build + demo API: official logo loads, 7 widths without overflow, suggestions, typo search, JSON-LD, cart persistence, save for later, register, checkout, demo payment, receipt, RFQ, admin denial, seller application → admin approval, real photo upload + product submission, password reset request, mobile sticky bar / filter drawer / bottom nav |
| CI workflow | written (`.github/workflows/ci.yml`), not yet run — no remote repository |

## Phase status

| Phase | Status |
| --- | --- |
| 0 Repository & monorepo | Done |
| 1 Brand & design system | Done: official logo in header, footer, login (ivory plate), favicon, Apple icon, Open Graph image |
| 2 Storefront | Done: home, catalogue filters, suggestions + recent searches, product page (gallery, variants, Buy now, reviews, related, JSON-LD), deals, brands, sitemap |
| 3 Backend & database | Done: Prisma schema (24 models), repository, auth, RBAC (CUSTOMER/SUPPORT/ADMIN + seller owner/staff + org roles) |
| 4 B2C | Done: coupons, saved addresses, save for later, checkout, order page, receipt, Razorpay test checkout + signature verify, demo payment, per-seller returns, refunds, notifications, support tickets, password change and reset |
| 5 B2B | Done: RFQ, quote revisions/decline, PO with approval threshold, separation of duties, reject with reason, team members, seller PO confirmation |
| 6 Seller | Done: photo upload (byte-checked, re-encoded WebP), variants, staff accounts, fulfilment, returns decisions, price/stock edits, tier validation, settlements ledger |
| 7 Admin | Done: calculated metrics (demo excluded from GMV), moderation, coupons, commission rate, returns, refund recording, staff roles, support queue, CMS, audit |
| 8 Refinement | Done for this preview: accessibility & mobile pass, hero entrance motion (reduced-motion aware), robotic media brief. Robot scene images themselves still to be produced |
| 9 Release prep | Docs + CI written; nothing deployed |

## Fixed defects found while building

- Seller stock/price edits silently erased wholesale tiers (`productSchema.partial()` re-applied defaults). Split into `productUpdateSchema`; regression test added.
- Test database was created in WIN1252 and could not store `₹`. Test cluster now UTF-8; deployment guide requires UTF-8.
- Utility bar claimed "Delivering across India" with no courier connected. Replaced.

## Blockers needing the owner

1. Razorpay test keys + webhook secret to verify real test-mode checkout.
2. Email/SMS provider (reset links currently go to the API log in non-production).
3. S3-compatible object storage for production uploads (local disk adapter today).
4. The 16 robotic scene images (brief in `docs/ux/robotic-media.md`).
5. Hosting choice, legal review, live-mode approval, DNS.

## Not yet built

Multi-seller offers on one catalogue product, GST tax invoices (receipt exists, clearly not a tax invoice), shipping-provider adapter (carrier entered manually), payout provider integration, email verification, AI assistant backend (guided non-AI assistant exists), S3 storage adapter.

## Notes

- A stale embedded Postgres from an earlier run listens on 127.0.0.1:55439 (data dir `.local/postgres-test-322b3b1c…`). It is harmless; `test:db` picks a free port. End it with Task Manager or a reboot.
- `scripts/database-test.mjs` regenerates `migrations/202611190001_initial` from the schema. Acceptable while no database has been deployed; switch to `prisma migrate dev` incremental migrations before the first staging deploy.
- Uploaded images are stored in `.local/uploads` by default (`config.mediaDir`).
