BEGIN;

CREATE TABLE "AssignmentTypeEvaluationCase" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentTypeId" TEXT NOT NULL,
  "rubricCategoryKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentText" TEXT NOT NULL,
  "criterion" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMPTZ(6),

  CONSTRAINT "AssignmentTypeEvaluationCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentTypeEvaluationRun" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  "assignmentTypeId" TEXT NOT NULL,
  "promptVersion" INTEGER NOT NULL,
  "promptSnapshotJson" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "totalCases" INTEGER NOT NULL DEFAULT 0,
  "passedCases" INTEGER NOT NULL DEFAULT 0,
  "failedCases" INTEGER NOT NULL DEFAULT 0,
  "needsReviewCases" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "AssignmentTypeEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentTypeEvaluationResult" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  "caseId" TEXT,
  "caseTitle" TEXT NOT NULL,
  "rubricCategoryKey" TEXT NOT NULL,
  "criterion" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "gradingOutputJson" JSONB,
  "responseContractJson" JSONB,

  CONSTRAINT "AssignmentTypeEvaluationResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssignmentTypeEvaluationCase_assignmentTypeId_archivedAt_rubricCategoryKey_position_idx"
  ON "AssignmentTypeEvaluationCase"("assignmentTypeId", "archivedAt", "rubricCategoryKey", "position");

CREATE INDEX "AssignmentTypeEvaluationRun_assignmentTypeId_createdAt_idx"
  ON "AssignmentTypeEvaluationRun"("assignmentTypeId", "createdAt" DESC);

CREATE INDEX "AssignmentTypeEvaluationRun_status_idx"
  ON "AssignmentTypeEvaluationRun"("status");

CREATE UNIQUE INDEX "AssignmentTypeEvaluationRun_one_running_per_assignment_type_idx"
  ON "AssignmentTypeEvaluationRun"("assignmentTypeId")
  WHERE "status" = 'running';

CREATE UNIQUE INDEX "AssignmentTypeEvaluationResult_runId_caseId_key"
  ON "AssignmentTypeEvaluationResult"("runId", "caseId");

CREATE INDEX "AssignmentTypeEvaluationResult_runId_idx"
  ON "AssignmentTypeEvaluationResult"("runId");

CREATE INDEX "AssignmentTypeEvaluationResult_caseId_idx"
  ON "AssignmentTypeEvaluationResult"("caseId");

CREATE INDEX "AssignmentTypeEvaluationResult_status_idx"
  ON "AssignmentTypeEvaluationResult"("status");

ALTER TABLE "AssignmentTypeEvaluationCase"
  ADD CONSTRAINT "AssignmentTypeEvaluationCase_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeEvaluationRun_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationResult"
  ADD CONSTRAINT "AssignmentTypeEvaluationResult_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AssignmentTypeEvaluationRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationResult"
  ADD CONSTRAINT "AssignmentTypeEvaluationResult_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "AssignmentTypeEvaluationCase"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
