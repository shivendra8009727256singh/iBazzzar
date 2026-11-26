-- Business buying: payment dates for statements, departments with budgets, and a log of reminders already sent.
-- Additive only.

ALTER TABLE "orders" ADD COLUMN "paidAt" TIMESTAMPTZ(3);
ALTER TABLE "orders" ADD COLUMN "departmentId" UUID;

CREATE TABLE "org_departments" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "monthlyBudgetPaise" DECIMAL(14,0) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_departments_budget_nonneg" CHECK ("monthlyBudgetPaise" >= 0)
);
CREATE UNIQUE INDEX "org_departments_organizationId_name_key" ON "org_departments" ("organizationId", "name");

ALTER TABLE "organization_members" ADD COLUMN "departmentId" UUID;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "org_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "org_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "orders_organizationId_paymentStatus_paymentDueAt_idx" ON "orders" ("organizationId", "paymentStatus", "paymentDueAt");

CREATE TABLE "sent_reminders" (
  "kind" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sent_reminders_pkey" PRIMARY KEY ("kind", "entityId")
);

-- Payment dates for existing orders: credit-terms settlements from their history entry, other received payments
-- from the confirmation entry (falling back to the order date).
UPDATE "orders" o SET "paidAt" = h."createdAt"
FROM (SELECT "orderId", MAX("createdAt") AS "createdAt" FROM "order_status_history" WHERE "status" = 'TERMS_PAID' GROUP BY "orderId") h
WHERE h."orderId" = o."id" AND o."paidAt" IS NULL;
UPDATE "orders" o SET "paidAt" = COALESCE(
  (SELECT MIN(h."createdAt") FROM "order_status_history" h WHERE h."orderId" = o."id" AND h."status" = 'CONFIRMED'), o."createdAt")
WHERE o."paidAt" IS NULL AND o."paymentStatus" IN ('PAID', 'DEMO_SIMULATED', 'COD_COLLECTED', 'REFUNDED', 'PARTIALLY_REFUNDED');
