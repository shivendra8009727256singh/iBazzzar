# Purchase order checkout

`POST /api/business/purchase-orders/:id/checkout`

Requires an authenticated session, same-origin request and current organization membership. Only the PO requester or organization owner may convert a PO, and only after approval and seller confirmation (`CONFIRMED_BY_SELLER`).

Body: `{ "address": { "name", "line1", "city", "state", "pincode", "phone" } }`, validated with the same address schema as retail checkout. Client prices, quantities and coupon values cannot alter the agreed PO.

Returns HTTP 201 with `{ order, demo, paymentConfigured }`. The order begins `AWAITING_PAYMENT`, uses the accepted quote snapshot, reserves currently available stock and has the normal fulfillment/payment lifecycle. Navigate to `/account/orders/:id` to pay using the existing configured test integration or demo payment. Accepted and seller-confirmed commercial terms remain binding even if the original quote's acceptance deadline subsequently passes.

Within one transaction the service checks current permissions, seller/product approval, quantity, total consistency and stock, writes the order, saves a permanent PO-specific idempotency record, updates PO status to `ORDERED`, and records audit entries. No schema migration is needed.

Identical retries return the same order without reserving stock again. An attempt with changed shipping details, or by another team member after conversion, returns 409. A cancelled order remains linked; place a new PO instead of silently reusing the old authorization.

Business overview includes `orderedBy` and `orderStatus`. `orderId` is returned only to the user who placed the order, preserving the existing customer-order privacy boundary. Team-level shared invoice/order access is not introduced by this feature.
