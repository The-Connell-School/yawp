SET lock_timeout = '5s';

-- Additive: event-link codes, operator metadata, scan analytics, disable flag.
-- Rollback: prisma migrate resolve --rolled-back 20261012180000_acquisition_token_event_links
-- Forward recovery after lock timeout: same resolve rolled-back, then migrate deploy.

ALTER TABLE "AcquisitionToken"
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceName" TEXT,
  ADD COLUMN IF NOT EXISTS "eventLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "eventDate" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "scanCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "AcquisitionToken_code_key" ON "AcquisitionToken"("code");

CREATE TABLE IF NOT EXISTS "AcquisitionTokenScan" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tokenId" TEXT NOT NULL,
  "dedupeCookieHash" TEXT NOT NULL,
  "userAgentCoarse" TEXT,
  CONSTRAINT "AcquisitionTokenScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AcquisitionTokenScan_tokenId_createdAt_idx"
  ON "AcquisitionTokenScan"("tokenId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AcquisitionTokenScan_tokenId_dedupeCookieHash_createdAt_idx"
  ON "AcquisitionTokenScan"("tokenId", "dedupeCookieHash", "createdAt" DESC);

DO $$ BEGIN
  ALTER TABLE "AcquisitionTokenScan"
    ADD CONSTRAINT "AcquisitionTokenScan_tokenId_fkey"
    FOREIGN KEY ("tokenId") REFERENCES "AcquisitionToken"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FreeTierApplication"
    ADD CONSTRAINT "FreeTierApplication_acquisitionTokenId_fkey"
    FOREIGN KEY ("acquisitionTokenId") REFERENCES "AcquisitionToken"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

RESET lock_timeout;
