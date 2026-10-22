-- Admin deny: terminal approval row + audit decision (reason is team-only).
ALTER TYPE "FreeTierAdminApprovalStatus" ADD VALUE IF NOT EXISTS 'DENIED';

ALTER TYPE "FreeTierApprovalDecisionType" ADD VALUE IF NOT EXISTS 'DENIED';

ALTER TABLE "FreeTierAdminApproval" ADD COLUMN IF NOT EXISTS "denyReason" TEXT;
