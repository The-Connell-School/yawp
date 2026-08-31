-- Make collaborative drafts assignment-owned artifacts instead of pretending
-- that the lowest-id student owns the group's document.
--
-- This is deliberately forward-only and data preserving. Existing documents
-- remain student artifacts. Documents already attached to assignment groups are
-- reclassified in place; their previous nominal owner is copied onto legacy
-- tutor sessions before Document.membershipId is cleared.

BEGIN;

CREATE TYPE "DocumentArtifactKind" AS ENUM ('student', 'assignment-group');

ALTER TABLE "Document"
  ADD COLUMN "artifactKind" "DocumentArtifactKind" NOT NULL DEFAULT 'student';

-- The dormant student-started sharing path was never enabled. Stop rather than
-- silently reinterpret any unexpected durable rows from that experiment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DocumentGroup"
    WHERE "kind" <> 'assignment' OR "classAssignmentId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate student-started or assignmentless document groups to assignment-owned artifacts';
  END IF;
END $$;

-- A null session member historically meant the document owner. Preserve that
-- identity before removing the nominal owner from shared artifacts.
UPDATE "AssignmentModuleSession" AS session
SET "membershipId" = document."membershipId"
FROM "Document" AS document
JOIN "DocumentGroup" AS group_row
  ON group_row."documentId" = document."id"
WHERE session."documentId" = document."id"
  AND session."membershipId" IS NULL
  AND document."membershipId" IS NOT NULL;

UPDATE "Document" AS document
SET "artifactKind" = 'assignment-group',
    "membershipId" = NULL
FROM "DocumentGroup" AS group_row
WHERE group_row."documentId" = document."id";

ALTER TABLE "Document"
  ALTER COLUMN "membershipId" DROP NOT NULL;

ALTER TABLE "DocumentGroup"
  ALTER COLUMN "classAssignmentId" SET NOT NULL;

ALTER TABLE "DocumentGroup"
  ADD CONSTRAINT "DocumentGroup_assignment_only_check"
  CHECK ("kind" = 'assignment');

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
  );

-- One member gets at most one live historical row per assignment module on a
-- document. PostgreSQL permits multiple NULLs, preserving solo compatibility.
CREATE UNIQUE INDEX "AssignmentModuleSession_documentId_membershipId_assignmentModuleId_key"
  ON "AssignmentModuleSession"("documentId", "membershipId", "assignmentModuleId");

-- The assignment/group is the lifecycle owner. A membership deletion can no
-- longer reach these documents because membershipId is null. Deleting a group
-- or its ClassAssignment intentionally removes the owned artifact instead of
-- leaving an assignmentless document behind.
CREATE OR REPLACE FUNCTION delete_document_group_artifact()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."documentId" IS NOT NULL THEN
    DELETE FROM "Document"
    WHERE "id" = OLD."documentId"
      AND "artifactKind" = 'assignment-group';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DocumentGroup_delete_owned_artifact"
AFTER DELETE ON "DocumentGroup"
FOR EACH ROW EXECUTE FUNCTION delete_document_group_artifact();

-- Delete assignment-owned artifacts before the existing SetNull relations can
-- detach them from their lifecycle owner. Solo student documents keep their
-- current SetNull behavior.
CREATE OR REPLACE FUNCTION delete_class_assignment_group_artifacts()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "Document"
  WHERE "classAssignmentId" = OLD.id
    AND "artifactKind" = 'assignment-group';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClassAssignment_delete_owned_artifacts"
BEFORE DELETE ON "ClassAssignment"
FOR EACH ROW EXECUTE FUNCTION delete_class_assignment_group_artifacts();

CREATE OR REPLACE FUNCTION delete_assignment_group_artifacts()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "Document"
  WHERE "assignmentId" = OLD.id
    AND "artifactKind" = 'assignment-group';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Assignment_delete_owned_artifacts"
BEFORE DELETE ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION delete_assignment_group_artifacts();

COMMIT;
