SET lock_timeout = '5s';

-- Additive migration: free-tier waitlist applications and acquisition tokens
-- Runbook (lock_timeout recovery):
-- If migrate deploy fails due to lock_timeout during this migration:
-- 1) prisma migrate resolve --rolled-back 20261005145000_add_free_tier_waitlist_and_tokens
-- 2) prisma migrate deploy

DO $$ BEGIN
  CREATE TYPE "FreeTierApplicationStatus" AS ENUM (
    'LEAD','INVITED','ACCOUNT_CREATED','ADMIN_SUBMITTED','SENT','MANUAL_REVIEW','APPROVED','REJECTED','EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FreeTierApplication" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "FreeTierApplicationStatus" NOT NULL DEFAULT 'LEAD',
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "schoolName" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "gradeLevel" TEXT NOT NULL,
  "acquisitionTokenId" TEXT,
  "userId" TEXT,
  "organizationId" TEXT,
  "releasedAt" TIMESTAMPTZ(6),
  "notes" TEXT
);

-- Store only hashed tokens. Plaintext is never stored.
CREATE TABLE IF NOT EXISTS "AcquisitionToken" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "bypassWaitlist" BOOLEAN NOT NULL DEFAULT FALSE,
  "maxUses" INTEGER,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(6),
  "createdBy" TEXT
);

-- Enforce idempotency by normalized email uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "FreeTierApplication_email_key" ON "FreeTierApplication"("email");
CREATE INDEX IF NOT EXISTS "AcquisitionToken_expiresAt_idx" ON "AcquisitionToken"("expiresAt");

RESET lock_timeout;

