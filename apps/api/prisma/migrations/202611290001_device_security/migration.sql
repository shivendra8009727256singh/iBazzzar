-- Signed-in devices: last-active time per session, and the browsers each account has signed in from (for new-sign-in alerts).
-- Additive only.
ALTER TABLE "sessions" ADD COLUMN "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sessions" ADD COLUMN "deviceId" TEXT;
UPDATE "sessions" SET "lastSeenAt" = "createdAt";

CREATE TABLE "known_devices" (
    "userId" UUID NOT NULL,
    "id" TEXT NOT NULL,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "known_devices_pkey" PRIMARY KEY ("userId", "id")
);
ALTER TABLE "known_devices" ADD CONSTRAINT "known_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
