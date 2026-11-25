-- Review photos and "helpful" votes. Additive only: existing reviews get no photos and zero votes.
ALTER TYPE "MediaOwner" ADD VALUE IF NOT EXISTS 'REVIEW';

ALTER TABLE "reviews" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "reviews" ADD COLUMN "helpfulCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_images_max" CHECK (cardinality("images") <= 5);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_helpful_nonneg" CHECK ("helpfulCount" >= 0);
CREATE INDEX "reviews_catalogProductId_status_helpfulCount_idx" ON "reviews" ("catalogProductId", "status", "helpfulCount" DESC);

CREATE TABLE "review_votes" (
  "reviewId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_votes_pkey" PRIMARY KEY ("reviewId", "userId"),
  CONSTRAINT "review_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "review_votes_userId_idx" ON "review_votes" ("userId");
