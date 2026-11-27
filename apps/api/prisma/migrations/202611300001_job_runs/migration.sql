-- Scheduled maintenance now runs inside the API (the separate worker and its Redis queue are gone).
-- Each row is a lease so a job runs once per slot however many timers, crons or API instances ask. Additive only.
CREATE TABLE "job_runs" (
    "name" TEXT NOT NULL,
    "lockedUntil" TIMESTAMPTZ(3) NOT NULL,
    "lastStartedAt" TIMESTAMPTZ(3),
    "lastFinishedAt" TIMESTAMPTZ(3),
    "lastStatus" TEXT,
    "lastResult" JSONB,
    "lastError" TEXT,
    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("name")
);
