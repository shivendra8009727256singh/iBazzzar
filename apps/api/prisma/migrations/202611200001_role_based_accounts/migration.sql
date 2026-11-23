-- Role-based registration: contact, consent and lockout fields on users; tax and address details for
-- business buyers and sellers; single-use email verification tokens. Additive only.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT,
ADD COLUMN "emailVerifiedAt" TEXT,
ADD COLUMN "termsAcceptedAt" TEXT,
ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TEXT;

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN "legalName" TEXT,
ADD COLUMN "businessType" TEXT,
ADD COLUMN "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "gstin" TEXT,
ADD COLUMN "pan" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "pickupAddress" JSONB,
ADD COLUMN "primaryCategory" TEXT,
ADD COLUMN "termsAcceptedAt" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "tradeName" TEXT,
ADD COLUMN "businessType" TEXT,
ADD COLUMN "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pan" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "address" JSONB;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
