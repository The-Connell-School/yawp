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

