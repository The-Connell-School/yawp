BEGIN;

ALTER TABLE "Document"
  ADD COLUMN "isAiSandbox" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiSandboxRunId" TEXT;

ALTER TABLE "Submission"
  ADD COLUMN "isAiSandbox" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiSandboxRunId" TEXT;

CREATE UNIQUE INDEX "Document_aiSandboxRunId_key"
  ON "Document"("aiSandboxRunId");

CREATE INDEX "Document_isAiSandbox_idx"
  ON "Document"("isAiSandbox");

CREATE UNIQUE INDEX "Submission_aiSandboxRunId_key"
  ON "Submission"("aiSandboxRunId");

CREATE INDEX "Submission_isAiSandbox_idx"
  ON "Submission"("isAiSandbox");

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_aiSandboxRunId_fkey"
  FOREIGN KEY ("aiSandboxRunId") REFERENCES "AssignmentTypeAiEvaluationRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Submission"
  ADD CONSTRAINT "Submission_aiSandboxRunId_fkey"
  FOREIGN KEY ("aiSandboxRunId") REFERENCES "AssignmentTypeAiEvaluationRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
