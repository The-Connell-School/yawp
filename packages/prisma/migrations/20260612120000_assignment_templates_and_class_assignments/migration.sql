-- Split Assignment into teacher templates and per-class deployments (ClassAssignment).
-- Backfill ClassAssignment from existing Assignment rows, link documents, drop classId/dueDate.

BEGIN;

-- Forensic preservation before dropping Assignment.classId / dueDate
CREATE TABLE "AssignmentClassIdForensic" (
  "assignmentId" TEXT PRIMARY KEY,
  "classId" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

INSERT INTO "AssignmentClassIdForensic" ("assignmentId", "classId")
SELECT "id", "classId"
FROM "Assignment";

CREATE TABLE "AssignmentDueDateForensic" (
  "assignmentId" TEXT PRIMARY KEY,
  "dueDate" TIMESTAMPTZ(6) NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

INSERT INTO "AssignmentDueDateForensic" ("assignmentId", "dueDate")
SELECT "id", "dueDate"
FROM "Assignment"
WHERE "dueDate" IS NOT NULL;

CREATE TABLE "ClassAssignment" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  CONSTRAINT "ClassAssignment_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ClassAssignment" ("id", "createdAt", "updatedAt", "assignmentId", "classId")
SELECT
  'ca_' || replace(gen_random_uuid()::text, '-', ''),
  "createdAt",
  "updatedAt",
  "id",
  "classId"
FROM "Assignment";

ALTER TABLE "ClassAssignment"
  ADD CONSTRAINT "ClassAssignment_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassAssignment"
  ADD CONSTRAINT "ClassAssignment_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Class"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ClassAssignment_assignmentId_classId_key"
  ON "ClassAssignment"("assignmentId", "classId");

CREATE INDEX "ClassAssignment_classId_createdAt_idx"
  ON "ClassAssignment"("classId", "createdAt" DESC);

ALTER TABLE "Document" ADD COLUMN "classAssignmentId" TEXT;

UPDATE "Document" d
SET "classAssignmentId" = ca."id"
FROM "ClassAssignment" ca
WHERE d."assignmentId" IS NOT NULL
  AND d."assignmentId" = ca."assignmentId";

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_classAssignmentId_fkey"
  FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Document_classAssignmentId_idx" ON "Document"("classAssignmentId");

ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_classId_fkey";
DROP INDEX IF EXISTS "Assignment_classId_createdAt_idx";
DROP INDEX IF EXISTS "Assignment_dueDate_idx";
ALTER TABLE "Assignment" DROP COLUMN "classId";
ALTER TABLE "Assignment" DROP COLUMN "dueDate";

COMMIT;
