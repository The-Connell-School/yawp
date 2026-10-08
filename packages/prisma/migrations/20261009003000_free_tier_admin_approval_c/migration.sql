-- #416: deploy after `20261007235900_free_classroom_assignment_kind_usage` (#414).
-- `20261007193000_user_handle_accounts` ships with #413 on main (not duplicated here).
SET lock_timeout = '5s';

DO $$ BEGIN
  CREATE TYPE "FreeTierAdminApprovalStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REDIRECTED',
    'SUPERSEDED',
    'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FreeTierSignedLinkPurpose" AS ENUM (
    'RELEASE',
    'ADMIN_APPROVE',
    'ADMIN_NOT_RIGHT_PERSON'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FreeTierSignedLink" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applicationId" TEXT NOT NULL,
  "purpose" "FreeTierSignedLinkPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "usedAt" TIMESTAMPTZ(6),
  CONSTRAINT "FreeTierSignedLink_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "FreeTierApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "FreeTierSignedLink_tokenHash_key" ON "FreeTierSignedLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "FreeTierSignedLink_applicationId_idx" ON "FreeTierSignedLink"("applicationId");

CREATE TABLE IF NOT EXISTS "FreeTierAdminApproval" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applicationId" TEXT NOT NULL,
  "adminName" TEXT NOT NULL,
  "adminEmail" TEXT NOT NULL,
  "adminRole" TEXT,
  "status" "FreeTierAdminApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "signedLinkId" TEXT,
  "emailCopyVersionHash" TEXT NOT NULL,
  "decidedAt" TIMESTAMPTZ(6),
  "clientIpHash" TEXT,
  "userAgentHash" TEXT,
  "redirectedFromId" TEXT,
  "personalNote" TEXT,
  CONSTRAINT "FreeTierAdminApproval_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "FreeTierApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FreeTierAdminApproval_signedLinkId_fkey"
    FOREIGN KEY ("signedLinkId") REFERENCES "FreeTierSignedLink"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FreeTierAdminApproval_redirectedFromId_fkey"
    FOREIGN KEY ("redirectedFromId") REFERENCES "FreeTierAdminApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FreeTierAdminApproval_applicationId_createdAt_idx"
  ON "FreeTierAdminApproval"("applicationId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "FreeTierEmailLog" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applicationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "error" TEXT,
  CONSTRAINT "FreeTierEmailLog_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "FreeTierApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FreeTierEmailLog_applicationId_createdAt_idx"
  ON "FreeTierEmailLog"("applicationId", "createdAt" DESC);

ALTER TABLE "FreeTierApplication"
  ADD COLUMN IF NOT EXISTS "teacherPersonalNote" TEXT,
  ADD COLUMN IF NOT EXISTS "adminRedirectCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FreeTierEmailLog"
  ADD COLUMN IF NOT EXISTS "payload" JSONB;

CREATE INDEX IF NOT EXISTS "FreeTierApplication_userId_idx" ON "FreeTierApplication"("userId");
CREATE INDEX IF NOT EXISTS "FreeTierApplication_organizationId_idx" ON "FreeTierApplication"("organizationId");

RESET lock_timeout;
