-- Safe additive migration for Free Tier approval audit table
-- Keep deploys resilient to transient locks.
SET lock_timeout = '5s';

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FreeTierApprovalDecisionType') THEN
    CREATE TYPE "FreeTierApprovalDecisionType" AS ENUM ('APPROVED', 'REJECTED', 'MANUAL_REVIEW', 'REOPENED');
  END IF;
END$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "FreeTierApprovalDecision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT NOT NULL,
    "decision" "FreeTierApprovalDecisionType" NOT NULL,
    "reason" TEXT,
    "decidedByEmail" TEXT NOT NULL,
    CONSTRAINT "FreeTierApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FreeTierApprovalDecision_applicationId_createdAt_idx" ON "FreeTierApprovalDecision"("applicationId", "createdAt" DESC);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FreeTierApprovalDecision_applicationId_fkey'
  ) THEN
    ALTER TABLE "FreeTierApprovalDecision"
      ADD CONSTRAINT "FreeTierApprovalDecision_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "FreeTierApplication"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
