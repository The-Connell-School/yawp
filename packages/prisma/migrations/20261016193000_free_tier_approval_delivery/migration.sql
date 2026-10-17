ALTER TABLE "FreeTierAdminApproval"
  ADD COLUMN "firstSentAt" TIMESTAMPTZ(6),
  ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReminderAt" TIMESTAMPTZ(6),
  ADD COLUMN "lastReminderSource" TEXT,
  ADD COLUMN "nextAutoReminderAt" TIMESTAMPTZ(6),
  ADD COLUMN "autoRemindersStopped" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stopReason" TEXT,
  ADD COLUMN "needsManualFollowUp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "teacherFollowUpCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastTeacherFollowUpAt" TIMESTAMPTZ(6),
  ADD COLUMN "nextTeacherFollowUpAt" TIMESTAMPTZ(6),
  ADD COLUMN "forwardedByRole" TEXT;
CREATE TABLE "FreeTierApprovalDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvalId" TEXT NOT NULL REFERENCES "FreeTierAdminApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "source" TEXT,
  "actorEmail" TEXT,
  "idempotencyKey" TEXT,
  "state" TEXT NOT NULL DEFAULT 'QUEUED',
  "availableAt" TIMESTAMPTZ(6) NOT NULL,
  "attemptedAt" TIMESTAMPTZ(6),
  "sentAt" TIMESTAMPTZ(6),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "payload" TEXT NOT NULL,
  "error" TEXT
);
CREATE UNIQUE INDEX "FreeTierApprovalDelivery_idempotencyKey_key" ON "FreeTierApprovalDelivery"("idempotencyKey");
CREATE UNIQUE INDEX "FreeTierApprovalDelivery_approvalId_kind_sequence_key" ON "FreeTierApprovalDelivery"("approvalId", "kind", "sequence");
CREATE INDEX "FreeTierApprovalDelivery_state_availableAt_idx" ON "FreeTierApprovalDelivery"("state", "availableAt");
