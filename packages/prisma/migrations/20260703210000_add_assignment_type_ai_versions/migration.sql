BEGIN;

CREATE TABLE "AssignmentTypeAiVersion" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentTypeId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "changeSource" TEXT NOT NULL,
  "changeSummary" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "snapshotJson" JSONB NOT NULL,

  CONSTRAINT "AssignmentTypeAiVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentTypeAiVersion_assignmentTypeId_versionNumber_key"
  ON "AssignmentTypeAiVersion"("assignmentTypeId", "versionNumber");

CREATE INDEX "AssignmentTypeAiVersion_assignmentTypeId_createdAt_idx"
  ON "AssignmentTypeAiVersion"("assignmentTypeId", "createdAt" DESC);

CREATE INDEX "AssignmentTypeAiVersion_createdByUserId_idx"
  ON "AssignmentTypeAiVersion"("createdByUserId");

ALTER TABLE "AssignmentTypeAiVersion"
  ADD CONSTRAINT "AssignmentTypeAiVersion_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTypeAiVersion"
  ADD CONSTRAINT "AssignmentTypeAiVersion_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
