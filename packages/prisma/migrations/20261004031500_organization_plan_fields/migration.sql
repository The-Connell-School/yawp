SET lock_timeout = '5s';

-- Runbook (lock_timeout recovery):
-- Organization is read on nearly every request. ADD COLUMN with a constant
-- DEFAULT is metadata-only on PG 11+ (no table rewrite), but still needs a brief
-- ACCESS EXCLUSIVE lock; lock_timeout makes it fail fast instead of queueing
-- every Organization query behind a long-running transaction.
-- If migrate deploy fails due to lock_timeout (the migration is one transaction,
-- so nothing is partially applied):
-- 1) prisma migrate resolve --rolled-back 20261004031500_organization_plan_fields
-- 2) prisma migrate deploy
-- Rollback of the code is a plain revert; the columns are additive and unread by old code.

-- Add OrganizationPlan enum and plan columns to Organization.
-- Additive only; defaults preserve existing behavior (SCHOOL).
CREATE TYPE "OrganizationPlan" AS ENUM (
  'SCHOOL',
  'FREE_CLASSROOM',
  'FOUNDING_FACULTY',
  'CLASSROOM_LICENSE'
);

ALTER TABLE "Organization"
  ADD COLUMN "plan" "OrganizationPlan" NOT NULL DEFAULT 'SCHOOL',
  ADD COLUMN "planActivatedAt" TIMESTAMPTZ(6),
  ADD COLUMN "planExpiresAt" TIMESTAMPTZ(6);
