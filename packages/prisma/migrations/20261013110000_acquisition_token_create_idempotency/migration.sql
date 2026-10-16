SET lock_timeout = '5s';

-- Additive: remember explicit create idempotency keys so only the same keyed
-- request can replay a token; matching unkeyed payloads still mint new links.
-- Rollback: prisma migrate resolve --rolled-back 20261013110000_acquisition_token_create_idempotency
-- Forward recovery after lock timeout: same resolve rolled-back, then migrate deploy.

ALTER TABLE "AcquisitionToken"
  ADD COLUMN IF NOT EXISTS "createIdempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AcquisitionToken_createIdempotencyKey_key"
  ON "AcquisitionToken"("createIdempotencyKey");

RESET lock_timeout;
