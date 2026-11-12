ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_artifact_ownership_check";

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
  ) NOT VALID;

ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_artifact_ownership_check";
