# Readability and purchase-order checkout

User authorizes larger type and completing missing features on the latest Claude implementation. Preserve that implementation and official assets. Work in the selected workspace; no database migration/reset or deployment.

1. Raise existing CSS sizes: body 16px, normal descriptive copy 15–16px, labels/navigation 14px or more, form controls 16px; preserve heading hierarchy and responsive layouts. Raise inline small text too.
2. Complete the explicitly documented PO → order gap. Only seller-confirmed POs can be converted, by their requester or organization owner. Use immutable negotiated price/quantity, recheck approved seller/product and stock inside the existing transaction, and use a permanent PO-specific idempotency record. Repeated requests return the same order; changed address conflicts. Preserve stock on failure.
3. Add address form on the PO card and link to existing payment/order screen. Show created order state across team without granting another member access to a private order.
4. Run focused failing tests before implementation, full unit suite, lint/typecheck/build, isolated database checks and responsive browser verification. Record remaining scope honestly.

Existing PostgreSQL IdempotencyKey and JSON order history are sufficient: no schema change needed. No real payment keys are required; use existing test/demo payment flow. Other missing shipping, tax invoices, payout integration and email verification remain distinct work, not silently claimed complete.
