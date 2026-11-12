DROP INDEX IF EXISTS "Document_teacherPreviewClassAssignmentId_idx";

ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_teacherPreviewClassAssignmentId_fkey";

ALTER TABLE "Document" DROP COLUMN IF EXISTS "teacherPreviewClassAssignmentId";

-- Enum value cannot be removed in Postgres without recreating the type.
