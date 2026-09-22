CREATE TABLE "AssignmentTypeEvaluation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentTypeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMPTZ(6),

  CONSTRAINT "AssignmentTypeEvaluation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AssignmentTypeEvaluationCase"
  ADD COLUMN "evaluationId" TEXT,
  ADD COLUMN "expectedOutputJson" JSONB;

ALTER TABLE "AssignmentTypeEvaluationResult"
  ADD COLUMN "expectedOutputJson" JSONB;

CREATE INDEX "AssignmentTypeEvaluation_assignmentTypeId_archivedAt_position_idx"
  ON "AssignmentTypeEvaluation"("assignmentTypeId", "archivedAt", "position");

CREATE INDEX "AssignmentTypeEvaluationCase_evaluationId_archivedAt_position_idx"
  ON "AssignmentTypeEvaluationCase"("evaluationId", "archivedAt", "position");

ALTER TABLE "AssignmentTypeEvaluation"
  ADD CONSTRAINT "AssignmentTypeEvaluation_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeEvaluationCase"
  ADD CONSTRAINT "AssignmentTypeEvaluationCase_evaluationId_fkey"
  FOREIGN KEY ("evaluationId") REFERENCES "AssignmentTypeEvaluation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
