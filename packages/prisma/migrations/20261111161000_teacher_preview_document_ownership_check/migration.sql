-- Allow teacher assignment try-it previews in Document_artifact_ownership_check.
SET lock_timeout = '5s';
SET statement_timeout = '5min';

ALTER TABLE "Document" DROP CONSTRAINT "Document_artifact_ownership_check";

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_artifact_ownership_check"
  CHECK (
    ("artifactKind" = 'student' AND "membershipId" IS NOT NULL)
    OR
    (
      "artifactKind" = 'assignment-group'
      AND "membershipId" IS NULL
      AND "assignmentId" IS NOT NULL
      AND "classAssignmentId" IS NOT NULL
    )
    OR
    (
      "artifactKind" = 'teacher-assignment-preview'
      AND "membershipId" IS NOT NULL
      AND "teacherPreviewClassAssignmentId" IS NOT NULL
      AND "assignmentId" IS NOT NULL
      AND "classAssignmentId" IS NULL
    )
  ) NOT VALID;

ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_artifact_ownership_check";
