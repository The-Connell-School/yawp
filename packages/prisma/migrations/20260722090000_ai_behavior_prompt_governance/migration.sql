BEGIN;

ALTER TABLE "Assignment"
  ADD COLUMN "aiContextSnapshot" JSONB;

ALTER TABLE "AssignmentModuleSessionMessage"
  ADD COLUMN "aiMeta" JSONB;

CREATE TABLE "AssignmentTypePromptVersion" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promotedAt" TIMESTAMPTZ(6),
  "assignmentTypeId" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "source" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "systemMessageTemplate" TEXT NOT NULL,
  "userMessageTemplate" TEXT NOT NULL,
  "variableSchemaJson" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "rollbackTargetId" TEXT,
  "promotionRunId" TEXT,
  CONSTRAINT "AssignmentTypePromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentTypeEvaluationRun" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  "assignmentTypeId" TEXT NOT NULL,
  "promptVersionId" TEXT NOT NULL,
  "promptContentHash" TEXT NOT NULL,
  "pairedPromptSnapshotJson" JSONB NOT NULL,
  "suiteVersion" TEXT NOT NULL,
  "suiteSnapshotJson" JSONB NOT NULL,
  "resultJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'running',
  "totalCases" INTEGER NOT NULL DEFAULT 0,
  "passedCases" INTEGER NOT NULL DEFAULT 0,
  "failedCases" INTEGER NOT NULL DEFAULT 0,
  "needsReviewCases" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT,
  "provider" TEXT,
  "durationMs" INTEGER,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "runByUserId" TEXT NOT NULL,
  "calibrationReviewedAt" TIMESTAMPTZ(6),
  "calibrationReviewedByUserId" TEXT,
  CONSTRAINT "AssignmentTypeEvaluationRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SubmissionGradingAssistantRun"
  ADD COLUMN "promptVersionId" TEXT,
  ADD COLUMN "promptSnapshotJson" JSONB;

CREATE UNIQUE INDEX "AssignmentTypePromptVersion_assignmentTypeId_surface_version_key"
  ON "AssignmentTypePromptVersion"("assignmentTypeId", "surface", "version");
CREATE UNIQUE INDEX "AssignmentTypePromptVersion_one_production_per_surface_idx"
  ON "AssignmentTypePromptVersion"("assignmentTypeId", "surface")
  WHERE "status" = 'production';
CREATE UNIQUE INDEX "AssignmentTypePromptVersion_promotionRunId_key"
  ON "AssignmentTypePromptVersion"("promotionRunId");
CREATE INDEX "AssignmentTypePromptVersion_assignmentTypeId_surface_status_version_idx"
  ON "AssignmentTypePromptVersion"("assignmentTypeId", "surface", "status", "version" DESC);
CREATE INDEX "AssignmentTypePromptVersion_authorUserId_createdAt_idx"
  ON "AssignmentTypePromptVersion"("authorUserId", "createdAt" DESC);
CREATE INDEX "AssignmentTypePromptVersion_rollbackTargetId_idx"
  ON "AssignmentTypePromptVersion"("rollbackTargetId");

CREATE INDEX "AssignmentTypeEvaluationRun_assignmentTypeId_createdAt_idx"
  ON "AssignmentTypeEvaluationRun"("assignmentTypeId", "createdAt" DESC);
CREATE INDEX "AssignmentTypeEvaluationRun_promptVersionId_createdAt_idx"
  ON "AssignmentTypeEvaluationRun"("promptVersionId", "createdAt" DESC);
CREATE INDEX "AssignmentTypeEvaluationRun_runByUserId_createdAt_idx"
  ON "AssignmentTypeEvaluationRun"("runByUserId", "createdAt" DESC);
CREATE INDEX "AssignmentTypeEvaluationRun_status_idx"
  ON "AssignmentTypeEvaluationRun"("status");
CREATE INDEX "SubmissionGradingAssistantRun_promptVersionId_idx"
  ON "SubmissionGradingAssistantRun"("promptVersionId");

ALTER TABLE "AssignmentTypePromptVersion"
  ADD CONSTRAINT "AssignmentTypePromptVersion_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentTypePromptVersion"
  ADD CONSTRAINT "AssignmentTypePromptVersion_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentTypePromptVersion"
  ADD CONSTRAINT "AssignmentTypePromptVersion_rollbackTargetId_fkey"
  FOREIGN KEY ("rollbackTargetId") REFERENCES "AssignmentTypePromptVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeEvaluationRun_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeEvaluationRun_promptVersionId_fkey"
  FOREIGN KEY ("promptVersionId") REFERENCES "AssignmentTypePromptVersion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeEvaluationRun_runByUserId_fkey"
  FOREIGN KEY ("runByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeEvaluationRun_calibrationReviewedByUserId_fkey"
  FOREIGN KEY ("calibrationReviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypePromptVersion"
  ADD CONSTRAINT "AssignmentTypePromptVersion_promotionRunId_fkey"
  FOREIGN KEY ("promotionRunId") REFERENCES "AssignmentTypeEvaluationRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubmissionGradingAssistantRun"
  ADD CONSTRAINT "SubmissionGradingAssistantRun_promptVersionId_fkey"
  FOREIGN KEY ("promptVersionId") REFERENCES "AssignmentTypePromptVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
