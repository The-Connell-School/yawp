BEGIN;

CREATE TABLE "AssignmentTypeAiEvaluationRun" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentTypeId" TEXT NOT NULL,
  "assignmentTypeAiVersionId" TEXT,
  "createdByUserId" TEXT,
  "agentKind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'saved',
  "label" TEXT,
  "notes" TEXT,
  "studentFirstName" TEXT,
  "strictnessLevel" TEXT,
  "sampleInput" TEXT NOT NULL,
  "promptSnapshotJson" JSONB NOT NULL,
  "resultJson" JSONB,

  CONSTRAINT "AssignmentTypeAiEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssignmentTypeAiEvaluationRun_assignmentTypeId_createdAt_idx"
  ON "AssignmentTypeAiEvaluationRun"("assignmentTypeId", "createdAt" DESC);

CREATE INDEX "AssignmentTypeAiEvaluationRun_assignmentTypeAiVersionId_idx"
  ON "AssignmentTypeAiEvaluationRun"("assignmentTypeAiVersionId");

CREATE INDEX "AssignmentTypeAiEvaluationRun_createdByUserId_idx"
  ON "AssignmentTypeAiEvaluationRun"("createdByUserId");

CREATE INDEX "AssignmentTypeAiEvaluationRun_agentKind_status_idx"
  ON "AssignmentTypeAiEvaluationRun"("agentKind", "status");

ALTER TABLE "AssignmentTypeAiEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeAiEvaluationRun_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeAiEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeAiEvaluationRun_assignmentTypeAiVersionId_fkey"
  FOREIGN KEY ("assignmentTypeAiVersionId") REFERENCES "AssignmentTypeAiVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeAiEvaluationRun"
  ADD CONSTRAINT "AssignmentTypeAiEvaluationRun_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
