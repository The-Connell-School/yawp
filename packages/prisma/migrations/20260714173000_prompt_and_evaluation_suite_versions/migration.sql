BEGIN;

CREATE TABLE "AssignmentTypePromptVersion" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promotedAt" TIMESTAMPTZ(6),
  "assignmentTypeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "systemMessageTemplate" TEXT NOT NULL,
  "userMessageTemplate" TEXT NOT NULL,
  "variableSchemaJson" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,

  CONSTRAINT "AssignmentTypePromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentTypeEvaluationSuiteVersion" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentTypeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,

  CONSTRAINT "AssignmentTypeEvaluationSuiteVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD COLUMN "promptVersionId" TEXT,
  ADD COLUMN "promptRevision" INTEGER,
  ADD COLUMN "evaluationSuiteVersionId" TEXT,
  ADD COLUMN "evaluationSuiteContentHash" TEXT,
  ADD COLUMN "evaluationSnapshotJson" JSONB;

ALTER TABLE "AssignmentTypeEvaluationResult"
  ADD COLUMN "requestSnapshotJson" JSONB;

CREATE UNIQUE INDEX "AssignmentTypePromptVersion_assignmentTypeId_version_key"
  ON "AssignmentTypePromptVersion"("assignmentTypeId", "version");

CREATE INDEX "AssignmentTypePromptVersion_assignmentTypeId_status_version_idx"
  ON "AssignmentTypePromptVersion"("assignmentTypeId", "status", "version" DESC);

CREATE UNIQUE INDEX "AssignmentTypePromptVersion_one_production_per_assignment_type_idx"
  ON "AssignmentTypePromptVersion"("assignmentTypeId")
  WHERE "status" = 'production';

CREATE UNIQUE INDEX "AssignmentTypeEvaluationSuiteVersion_assignmentTypeId_version_key"
  ON "AssignmentTypeEvaluationSuiteVersion"("assignmentTypeId", "version");

CREATE INDEX "AssignmentTypeEvaluationSuiteVersion_assignmentTypeId_version_idx"
  ON "AssignmentTypeEvaluationSuiteVersion"("assignmentTypeId", "version" DESC);

CREATE INDEX "AssignmentTypeEvaluationRun_promptVersionId_evaluationSuiteVersionId_createdAt_idx"
  ON "AssignmentTypeEvaluationRun"("promptVersionId", "evaluationSuiteVersionId", "createdAt" DESC);

ALTER TABLE "AssignmentTypePromptVersion"
  ADD CONSTRAINT "AssignmentTypePromptVersion_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationSuiteVersion"
  ADD CONSTRAINT "AssignmentTypeEvaluationSuiteVersion_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeEvaluationRun_promptVersionId_fkey"
  FOREIGN KEY ("promptVersionId") REFERENCES "AssignmentTypePromptVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeEvaluationRun_evaluationSuiteVersionId_fkey"
  FOREIGN KEY ("evaluationSuiteVersionId") REFERENCES "AssignmentTypeEvaluationSuiteVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
