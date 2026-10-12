-- Independent tester grant; existing privileges are unchanged.
ALTER TABLE "User" ADD COLUMN "mockAdminGranted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InternalPlatformApiAudit"
  ADD COLUMN "actorUserId" TEXT,
  ADD COLUMN "action" TEXT,
  ADD COLUMN "targetId" TEXT,
  ADD COLUMN "environment" TEXT,
  ADD COLUMN "metadata" JSONB;
