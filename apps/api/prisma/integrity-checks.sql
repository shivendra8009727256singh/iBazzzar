-- ───────────── Integrity rules the database enforces even if application code has a bug ─────────────
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_non_negative" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "reservation_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "seller_listings" ADD CONSTRAINT "listing_prices_valid" CHECK ("pricePaise" >= 100 AND "mrpPaise" >= "pricePaise" AND "moq" >= 1 AND "bulkPackUnits" >= 1);
ALTER TABLE "price_tiers" ADD CONSTRAINT "tier_valid" CHECK ("minQty" >= 1 AND "pricePaise" >= 1);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_quantity_valid" CHECK ("quantity" BETWEEN 1 AND 10000);
ALTER TABLE "order_items" ADD CONSTRAINT "order_item_valid" CHECK ("quantity" > 0 AND "unitPaise" >= 0 AND "discountPaise" >= 0 AND "totalPaise" >= 0 AND "taxablePaise" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "order_amounts_valid" CHECK ("subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "shippingPaise" >= 0 AND "codFeePaise" >= 0 AND "taxPaise" >= 0 AND "totalPaise" >= 100);
ALTER TABLE "seller_orders" ADD CONSTRAINT "seller_order_amounts_valid" CHECK ("subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "shippingPaise" >= 0 AND "taxPaise" >= 0 AND "totalPaise" >= 0);
ALTER TABLE "reviews" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "coupons" ADD CONSTRAINT "coupon_valid" CHECK ("value" > 0 AND "used" >= 0 AND ("kind" <> 'PERCENT' OR "value" <= 90) AND "endsAt" > "startsAt");
ALTER TABLE "promotions" ADD CONSTRAINT "promotion_valid" CHECK ("discountBps" BETWEEN 100 AND 9000 AND "endsAt" > "startsAt");
ALTER TABLE "refunds" ADD CONSTRAINT "refund_positive" CHECK ("amountPaise" >= 0);
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_positive" CHECK ("amountPaise" >= 100);
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_item_quantity" CHECK ("quantity" BETWEEN 1 AND 1000000);
ALTER TABLE "quotation_items" ADD CONSTRAINT "quote_item_valid" CHECK ("quantity" >= 1 AND "unitPaise" >= 1);
ALTER TABLE "tax_classes" ADD CONSTRAINT "tax_rate_range" CHECK ("gstRateBps" BETWEEN 0 AND 4000 AND "cessRateBps" >= 0);
