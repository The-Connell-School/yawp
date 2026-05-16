-- Unify assignment model: rename StudentCourse*/TeacherCourse* to
-- AssignmentType*/TeacherTraining*, attach Documents directly to AssignmentType,
-- drop ClassStudentCourse.
--
-- Entire migration runs in a single transaction.

BEGIN;

-- =========================================================================
-- Step 1: Rename tables
-- =========================================================================

ALTER TABLE "StudentCourse"                         RENAME TO "AssignmentType";
ALTER TABLE "StudentCourseImage"                    RENAME TO "AssignmentTypeImage";
ALTER TABLE "StudentCourseModule"                   RENAME TO "AssignmentModule";
ALTER TABLE "StudentCourseModuleInstruction"        RENAME TO "AssignmentModuleInstruction";
ALTER TABLE "StudentCourseModuleInstructionButton"  RENAME TO "AssignmentModuleInstructionButton";
ALTER TABLE "StudentCourseModuleSession"            RENAME TO "AssignmentModuleSession";
ALTER TABLE "StudentCourseModuleSessionMessage"     RENAME TO "AssignmentModuleSessionMessage";

ALTER TABLE "TeacherCourse"                         RENAME TO "TeacherTraining";
ALTER TABLE "TeacherCourseImage"                    RENAME TO "TeacherTrainingImage";
ALTER TABLE "TeacherCourseModule"                   RENAME TO "TeacherTrainingModule";
ALTER TABLE "TeacherCourseModuleResource"           RENAME TO "TeacherTrainingModuleResource";
ALTER TABLE "TeacherCourseResource"                 RENAME TO "TeacherTrainingResource";
ALTER TABLE "TeacherCourseModuleSession"            RENAME TO "TeacherTrainingModuleSession";

-- =========================================================================
-- Step 2: Rename FK columns on the renamed tables
-- =========================================================================

-- Assignment-side
ALTER TABLE "Assignment"                         RENAME COLUMN "studentCourseId"                  TO "assignmentTypeId";
ALTER TABLE "AssignmentTypeImage"                RENAME COLUMN "studentCourseId"                  TO "assignmentTypeId";
ALTER TABLE "AssignmentModule"                   RENAME COLUMN "studentCourseId"                  TO "assignmentTypeId";
ALTER TABLE "AssignmentModuleInstruction"        RENAME COLUMN "studentCourseModuleId"            TO "assignmentModuleId";
ALTER TABLE "AssignmentModuleInstructionButton"  RENAME COLUMN "studentCourseModuleInstructionId" TO "assignmentModuleInstructionId";
ALTER TABLE "AssignmentModuleSession"            RENAME COLUMN "studentCourseModuleId"            TO "assignmentModuleId";
ALTER TABLE "AssignmentModuleSessionMessage"     RENAME COLUMN "studentCourseModuleSessionId"    TO "assignmentModuleSessionId";

-- TeacherTraining-side
ALTER TABLE "TeacherTrainingImage"               RENAME COLUMN "teacherCourseId"        TO "teacherTrainingId";
ALTER TABLE "TeacherTrainingModule"              RENAME COLUMN "teacherCourseId"        TO "teacherTrainingId";
ALTER TABLE "TeacherTrainingModuleResource"      RENAME COLUMN "teacherCourseModuleId"  TO "teacherTrainingModuleId";
ALTER TABLE "TeacherTrainingModuleSession"       RENAME COLUMN "teacherCourseModuleId"  TO "teacherTrainingModuleId";
ALTER TABLE "TeacherTrainingResource"            RENAME COLUMN "teacherCourseId"        TO "teacherTrainingId";

-- =========================================================================
-- Step 3: Forensic preservation before removing live legacy relationships
-- =========================================================================

CREATE TABLE "DocumentClassForensic" (
  "documentId" TEXT PRIMARY KEY,
  "oldClassId" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE "AssignmentModuleSessionStudentForensic" (
  "sessionId" TEXT PRIMARY KEY,
  "oldStudentProfileId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "AssignmentModuleSessionStudentForensic_documentId_idx"
  ON "AssignmentModuleSessionStudentForensic"("documentId");

CREATE INDEX "AssignmentModuleSessionStudentForensic_oldStudentProfileId_idx"
  ON "AssignmentModuleSessionStudentForensic"("oldStudentProfileId");

CREATE TABLE "ClassStudentCourseForensic" (
  "classId" TEXT NOT NULL,
  "studentCourseId" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("classId", "studentCourseId")
);

INSERT INTO "DocumentClassForensic" ("documentId", "oldClassId")
SELECT "id", "classId"
FROM "Document"
WHERE "classId" IS NOT NULL;

INSERT INTO "AssignmentModuleSessionStudentForensic" (
  "sessionId", "oldStudentProfileId", "documentId"
)
SELECT "id", "studentProfileId", "documentId"
FROM "AssignmentModuleSession"
WHERE "studentProfileId" IS NOT NULL;

INSERT INTO "ClassStudentCourseForensic" ("classId", "studentCourseId")
SELECT "classId", "studentCourseId"
FROM "ClassStudentCourse";

-- =========================================================================
-- Step 4: Canonical Document.studentProfileId ownership
-- =========================================================================

ALTER TABLE "Document"
  ADD COLUMN "studentProfileId" TEXT NULL;

UPDATE "Document" d
SET "studentProfileId" = sp."id"
FROM "StudentProfile" sp
WHERE sp."profileId" = d."profileId"
  AND d."studentProfileId" IS NULL;

DO $$
DECLARE
  unmapped_count INTEGER;
  any_unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped_count
  FROM "Document"
  WHERE "deletedAt" IS NULL
    AND "studentProfileId" IS NULL;

  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Assignments unification blocked: % non-deleted Document rows could not map to StudentProfile', unmapped_count;
  END IF;

  SELECT COUNT(*) INTO any_unmapped_count
  FROM "Document"
  WHERE "studentProfileId" IS NULL;

  IF any_unmapped_count > 0 THEN
    RAISE EXCEPTION 'Assignments unification blocked: % total Document rows could not map to StudentProfile; required Document.studentProfileId cannot be set', any_unmapped_count;
  END IF;
END $$;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_studentProfileId_fkey"
  FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ALTER COLUMN "studentProfileId" SET NOT NULL;

CREATE INDEX "Document_studentProfileId_idx" ON "Document"("studentProfileId");

-- =========================================================================
-- Step 5: Owner columns on AssignmentType
-- =========================================================================

ALTER TABLE "AssignmentType"
  ADD COLUMN "ownerOrgId"     TEXT NULL,
  ADD COLUMN "ownerTeacherId" TEXT NULL;

ALTER TABLE "AssignmentType"
  ADD CONSTRAINT "AssignmentType_ownerOrgId_fkey"
  FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentType"
  ADD CONSTRAINT "AssignmentType_ownerTeacherId_fkey"
  FOREIGN KEY ("ownerTeacherId") REFERENCES "Profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentType"
  ADD CONSTRAINT "AssignmentType_owner_single_check"
  CHECK ("ownerOrgId" IS NULL OR "ownerTeacherId" IS NULL);

CREATE INDEX "AssignmentType_ownerOrgId_idx"     ON "AssignmentType"("ownerOrgId");
CREATE INDEX "AssignmentType_ownerTeacherId_idx" ON "AssignmentType"("ownerTeacherId");

-- =========================================================================
-- Step 6: Seed Free Write AssignmentType
-- =========================================================================

INSERT INTO "AssignmentType" (
  "id", "createdAt", "updatedAt", "title", "description", "position",
  "ownerOrgId", "ownerTeacherId"
) VALUES (
  'cfreewrite0000000000000000',
  NOW(),
  NOW(),
  'Free Write',
  'An open-ended writing space. No prompt, no structure — just write.',
  0,
  NULL,
  NULL
)
ON CONFLICT ("id") DO NOTHING;

-- =========================================================================
-- Step 7: Delete orphan AssignmentModule rows; enforce NOT NULL
-- =========================================================================

DELETE FROM "AssignmentModule" WHERE "assignmentTypeId" IS NULL;

ALTER TABLE "AssignmentModule"
  ALTER COLUMN "assignmentTypeId" SET NOT NULL;

-- =========================================================================
-- Step 8: Add Document.assignmentTypeId (nullable for backfill)
-- =========================================================================

ALTER TABLE "Document"
  ADD COLUMN "assignmentTypeId" TEXT NULL;

-- =========================================================================
-- Step 9: Three-pass backfill of Document.assignmentTypeId
-- =========================================================================

-- 7a: docs with an Assignment → copy from Assignment.assignmentTypeId
UPDATE "Document" d
SET "assignmentTypeId" = a."assignmentTypeId"
FROM "Assignment" a
WHERE d."assignmentId" = a."id"
  AND d."assignmentTypeId" IS NULL;

-- 7b: remaining docs with AT LEAST ONE AssignmentModuleSession →
--     earliest-by-createdAt session's module's type
UPDATE "Document" d
SET "assignmentTypeId" = sub."assignmentTypeId"
FROM (
  SELECT DISTINCT ON (s."documentId")
    s."documentId",
    m."assignmentTypeId"
  FROM "AssignmentModuleSession" s
  JOIN "AssignmentModule" m ON m."id" = s."assignmentModuleId"
  ORDER BY s."documentId", s."createdAt" ASC
) sub
WHERE d."id" = sub."documentId"
  AND d."assignmentTypeId" IS NULL;

-- 7c: remaining docs → Free Write
UPDATE "Document"
SET "assignmentTypeId" = 'cfreewrite0000000000000000'
WHERE "assignmentTypeId" IS NULL;

-- =========================================================================
-- Step 10: Add FK + NOT NULL + index on Document.assignmentTypeId
-- =========================================================================

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Document"
  ALTER COLUMN "assignmentTypeId" SET NOT NULL;

CREATE INDEX "Document_assignmentTypeId_idx" ON "Document"("assignmentTypeId");

-- =========================================================================
-- Step 11: Drop live legacy relationships
-- =========================================================================

ALTER TABLE "Document" DROP CONSTRAINT "Document_classId_fkey";
DROP INDEX IF EXISTS "Document_classId_idx";
ALTER TABLE "Document" DROP COLUMN "classId";

ALTER TABLE "AssignmentModuleSession"
  DROP CONSTRAINT "StudentCourseModuleSession_studentProfileId_fkey";
ALTER TABLE "AssignmentModuleSession" DROP COLUMN "studentProfileId";

DROP TABLE "ClassStudentCourse";

-- =========================================================================
-- Step 12: Rename indexes and constraints to match new table/column names
-- =========================================================================

-- ---- Primary key indexes ----
ALTER INDEX "StudentCourse_pkey"                         RENAME TO "AssignmentType_pkey";
ALTER INDEX "StudentCourseImage_pkey"                    RENAME TO "AssignmentTypeImage_pkey";
ALTER INDEX "StudentCourseModule_pkey"                   RENAME TO "AssignmentModule_pkey";
ALTER INDEX "StudentCourseModuleInstruction_pkey"        RENAME TO "AssignmentModuleInstruction_pkey";
ALTER INDEX "StudentCourseModuleInstructionButton_pkey"  RENAME TO "AssignmentModuleInstructionButton_pkey";
ALTER INDEX "StudentCourseModuleSession_pkey"            RENAME TO "AssignmentModuleSession_pkey";
ALTER INDEX "StudentCourseModuleSessionMessage_pkey"     RENAME TO "AssignmentModuleSessionMessage_pkey";

ALTER INDEX "TeacherCourse_pkey"                         RENAME TO "TeacherTraining_pkey";
ALTER INDEX "TeacherCourseImage_pkey"                    RENAME TO "TeacherTrainingImage_pkey";
ALTER INDEX "TeacherCourseModule_pkey"                   RENAME TO "TeacherTrainingModule_pkey";
ALTER INDEX "TeacherCourseModuleResource_pkey"           RENAME TO "TeacherTrainingModuleResource_pkey";
ALTER INDEX "TeacherCourseModuleSession_pkey"            RENAME TO "TeacherTrainingModuleSession_pkey";
ALTER INDEX "TeacherCourseResource_pkey"                 RENAME TO "TeacherTrainingResource_pkey";

-- ---- Unique indexes ----
ALTER INDEX "StudentCourseImage_studentCourseId_key"
  RENAME TO "AssignmentTypeImage_assignmentTypeId_key";
ALTER INDEX "TeacherCourseImage_teacherCourseId_key"
  RENAME TO "TeacherTrainingImage_teacherTrainingId_key";
-- Old truncated: TeacherCourseModuleSession_teacherCourseModuleId_teacherPro_key (63)
-- New truncated: TeacherTrainingModuleSession_teacherTrainingModuleId_teache_key (63)
ALTER INDEX "TeacherCourseModuleSession_teacherCourseModuleId_teacherPro_key"
  RENAME TO "TeacherTrainingModuleSession_teacherTrainingModuleId_teache_key";

-- ---- Non-unique indexes on Assignment ----
ALTER INDEX "Assignment_studentCourseId_idx"
  RENAME TO "Assignment_assignmentTypeId_idx";

-- ---- Foreign-key constraints ----
ALTER TABLE "Assignment"
  RENAME CONSTRAINT "Assignment_studentCourseId_fkey"
  TO "Assignment_assignmentTypeId_fkey";

ALTER TABLE "AssignmentTypeImage"
  RENAME CONSTRAINT "StudentCourseImage_studentCourseId_fkey"
  TO "AssignmentTypeImage_assignmentTypeId_fkey";

ALTER TABLE "AssignmentModule"
  RENAME CONSTRAINT "StudentCourseModule_studentCourseId_fkey"
  TO "AssignmentModule_assignmentTypeId_fkey";

ALTER TABLE "AssignmentModuleInstruction"
  RENAME CONSTRAINT "StudentCourseModuleInstruction_studentCourseModuleId_fkey"
  TO "AssignmentModuleInstruction_assignmentModuleId_fkey";

-- Old truncated: StudentCourseModuleInstructionButton_studentCourseModuleIn_fkey (63)
-- New truncated: AssignmentModuleInstructionButton_assignmentModuleInstruc_fkey (63)
ALTER TABLE "AssignmentModuleInstructionButton"
  RENAME CONSTRAINT "StudentCourseModuleInstructionButton_studentCourseModuleIn_fkey"
  TO "AssignmentModuleInstructionButton_assignmentModuleInstruc_fkey";

ALTER TABLE "AssignmentModuleSession"
  RENAME CONSTRAINT "StudentCourseModuleSession_documentId_fkey"
  TO "AssignmentModuleSession_documentId_fkey";

ALTER TABLE "AssignmentModuleSession"
  RENAME CONSTRAINT "StudentCourseModuleSession_studentCourseModuleId_fkey"
  TO "AssignmentModuleSession_assignmentModuleId_fkey";

-- Old truncated: StudentCourseModuleSessionMessage_studentCourseModuleSessi_fkey (63)
-- New full (fits in 61): AssignmentModuleSessionMessage_assignmentModuleSessionId_fkey
ALTER TABLE "AssignmentModuleSessionMessage"
  RENAME CONSTRAINT "StudentCourseModuleSessionMessage_studentCourseModuleSessi_fkey"
  TO "AssignmentModuleSessionMessage_assignmentModuleSessionId_fkey";

ALTER TABLE "TeacherTrainingImage"
  RENAME CONSTRAINT "TeacherCourseImage_teacherCourseId_fkey"
  TO "TeacherTrainingImage_teacherTrainingId_fkey";

ALTER TABLE "TeacherTrainingModule"
  RENAME CONSTRAINT "TeacherCourseModule_teacherCourseId_fkey"
  TO "TeacherTrainingModule_teacherTrainingId_fkey";

ALTER TABLE "TeacherTrainingModuleResource"
  RENAME CONSTRAINT "TeacherCourseModuleResource_teacherCourseModuleId_fkey"
  TO "TeacherTrainingModuleResource_teacherTrainingModuleId_fkey";

ALTER TABLE "TeacherTrainingModuleSession"
  RENAME CONSTRAINT "TeacherCourseModuleSession_teacherCourseModuleId_fkey"
  TO "TeacherTrainingModuleSession_teacherTrainingModuleId_fkey";

ALTER TABLE "TeacherTrainingModuleSession"
  RENAME CONSTRAINT "TeacherCourseModuleSession_teacherProfileId_fkey"
  TO "TeacherTrainingModuleSession_teacherProfileId_fkey";

ALTER TABLE "TeacherTrainingResource"
  RENAME CONSTRAINT "TeacherCourseResource_teacherCourseId_fkey"
  TO "TeacherTrainingResource_teacherTrainingId_fkey";

-- ---- Implicit M:N join table for @relation("TeacherCourseAssignments") ----
-- Connects TeacherCourse (A) <-> TeacherProfile (B); renamed to TeacherTrainingAssignments.
ALTER TABLE "_TeacherCourseAssignments" RENAME TO "_TeacherTrainingAssignments";

ALTER INDEX "_TeacherCourseAssignments_AB_pkey"
  RENAME TO "_TeacherTrainingAssignments_AB_pkey";
ALTER INDEX "_TeacherCourseAssignments_B_index"
  RENAME TO "_TeacherTrainingAssignments_B_index";

ALTER TABLE "_TeacherTrainingAssignments"
  RENAME CONSTRAINT "_TeacherCourseAssignments_A_fkey"
  TO "_TeacherTrainingAssignments_A_fkey";
ALTER TABLE "_TeacherTrainingAssignments"
  RENAME CONSTRAINT "_TeacherCourseAssignments_B_fkey"
  TO "_TeacherTrainingAssignments_B_fkey";

COMMIT;
