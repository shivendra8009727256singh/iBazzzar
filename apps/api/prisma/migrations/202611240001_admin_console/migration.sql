-- Admin console: internal notes, per-store commission and payout hold, organisation credit limit. Additive only.
ALTER TABLE "organizations" ADD COLUMN "creditLimitPaise" DECIMAL(14,0) NOT NULL DEFAULT 0;

ALTER TABLE "seller_stores" ADD COLUMN "commissionBps" INTEGER,
ADD COLUMN "payoutHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "payoutHoldReason" TEXT;

CREATE TABLE "admin_notes" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" UUID NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_notes_entityType_entityId_createdAt_idx" ON "admin_notes"("entityType", "entityId", "createdAt");

ALTER TABLE "seller_stores" ADD CONSTRAINT "store_commission_range" CHECK ("commissionBps" IS NULL OR "commissionBps" BETWEEN 0 AND 5000);
ALTER TABLE "organizations" ADD CONSTRAINT "credit_limit_non_negative" CHECK ("creditLimitPaise" >= 0);
