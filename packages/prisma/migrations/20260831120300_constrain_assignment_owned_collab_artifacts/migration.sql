-- Phase 4: make assignment/group/document ownership a database contract.
SET lock_timeout = '5s';
SET statement_timeout = '5min';

ALTER TABLE "DocumentGroup"
  ALTER COLUMN "classAssignmentId" SET NOT NULL,
  ADD CONSTRAINT "DocumentGroup_assignment_only_check"
    CHECK ("kind" = 'assignment'),
  ADD CONSTRAINT "DocumentGroup_opened_artifact_check"
    CHECK (("openedAt" IS NULL) = ("documentId" IS NULL));

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

-- NOT VALID avoids holding an ACCESS EXCLUSIVE lock for the table scan. The
-- validation takes the lighter lock intended for online constraint rollout.
ALTER TABLE "Document"
  VALIDATE CONSTRAINT "Document_artifact_ownership_check";

ALTER TABLE "DocumentGroup"
  DROP CONSTRAINT "DocumentGroup_documentId_fkey",
  ADD CONSTRAINT "DocumentGroup_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_assignment_group_document()
RETURNS TRIGGER AS $$
DECLARE matching_graphs integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."artifactKind" = 'assignment-group'
     AND NEW."artifactKind" <> 'assignment-group'
     AND EXISTS (
       SELECT 1 FROM "DocumentGroup" WHERE "documentId" = OLD."id"
     ) THEN
    RAISE EXCEPTION
      'owned assignment-group document % cannot be retyped', OLD."id";
  END IF;

  IF NEW."artifactKind" <> 'assignment-group' THEN RETURN NEW; END IF;

  SELECT count(*) INTO matching_graphs
  FROM "DocumentGroup" AS group_row
  JOIN "ClassAssignment" AS deployment
    ON deployment."id" = group_row."classAssignmentId"
  JOIN "Assignment" AS assignment
    ON assignment."id" = deployment."assignmentId"
  WHERE group_row."documentId" = NEW."id"
    AND group_row."classAssignmentId" = NEW."classAssignmentId"
    AND deployment."assignmentId" = NEW."assignmentId"
    AND assignment."assignmentTypeId" = NEW."assignmentTypeId";

  IF matching_graphs <> 1 THEN
    RAISE EXCEPTION
      'assignment-group document % must have exactly one matching assignment group owner', NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Document_assignment_group_graph_check"
AFTER INSERT OR UPDATE OF "artifactKind", "assignmentId", "classAssignmentId", "assignmentTypeId"
ON "Document"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_assignment_group_document();

CREATE OR REPLACE FUNCTION validate_document_group_artifact()
RETURNS TRIGGER AS $$
DECLARE matching_graphs integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."documentId" IS NOT NULL
     AND NEW."documentId" IS DISTINCT FROM OLD."documentId" THEN
    RAISE EXCEPTION
      'document group % cannot detach or replace its owned artifact', OLD."id";
  END IF;

  IF NEW."documentId" IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO matching_graphs
  FROM "Document" AS document
  JOIN "ClassAssignment" AS deployment
    ON deployment."id" = NEW."classAssignmentId"
  JOIN "Assignment" AS assignment
    ON assignment."id" = deployment."assignmentId"
  WHERE document."id" = NEW."documentId"
    AND document."artifactKind" = 'assignment-group'
    AND document."classAssignmentId" = NEW."classAssignmentId"
    AND document."assignmentId" = deployment."assignmentId"
    AND document."assignmentTypeId" = assignment."assignmentTypeId";

  IF matching_graphs <> 1 THEN
    RAISE EXCEPTION
      'document group % must reference its matching assignment-group artifact', NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "DocumentGroup_assignment_group_graph_check"
AFTER INSERT OR UPDATE OF "documentId", "classAssignmentId"
ON "DocumentGroup"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_document_group_artifact();

CREATE OR REPLACE FUNCTION protect_assignment_group_assignment_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."assignmentTypeId" IS DISTINCT FROM OLD."assignmentTypeId"
     AND (
       OLD."collaborationEnabled" = true
       OR EXISTS (
       SELECT 1
       FROM "ClassAssignment" AS deployment
       JOIN "DocumentGroup" AS group_row
         ON group_row."classAssignmentId" = deployment."id"
       WHERE deployment."assignmentId" = OLD."id"
         AND group_row."documentId" IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION
      'assignment % cannot change type while collaboration is enabled or shared artifacts exist', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Assignment_protect_owned_artifact_type"
BEFORE UPDATE OF "assignmentTypeId" ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION protect_assignment_group_assignment_type();

CREATE OR REPLACE FUNCTION protect_document_group_deployment_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."assignmentId" IS DISTINCT FROM OLD."assignmentId"
      OR NEW."classId" IS DISTINCT FROM OLD."classId")
     AND EXISTS (
       SELECT 1 FROM "DocumentGroup"
       WHERE "classAssignmentId" = OLD."id" AND "documentId" IS NOT NULL
     ) THEN
    RAISE EXCEPTION
      'class assignment % cannot change owner after shared artifacts are created', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClassAssignment_protect_owned_artifact_owner"
BEFORE UPDATE OF "assignmentId", "classId" ON "ClassAssignment"
FOR EACH ROW EXECUTE FUNCTION protect_document_group_deployment_owner();

CREATE OR REPLACE FUNCTION delete_document_group_artifact()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."documentId" IS NOT NULL THEN
    DELETE FROM "Document"
    WHERE "id" = OLD."documentId" AND "artifactKind" = 'assignment-group';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DocumentGroup_delete_owned_artifact"
AFTER DELETE ON "DocumentGroup"
FOR EACH ROW EXECUTE FUNCTION delete_document_group_artifact();

CREATE OR REPLACE FUNCTION delete_class_assignment_group_artifacts()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "DocumentGroup" WHERE "classAssignmentId" = OLD."id";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClassAssignment_delete_owned_artifacts"
BEFORE DELETE ON "ClassAssignment"
FOR EACH ROW EXECUTE FUNCTION delete_class_assignment_group_artifacts();

CREATE OR REPLACE FUNCTION delete_assignment_group_artifacts()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "DocumentGroup"
  WHERE "classAssignmentId" IN (
    SELECT "id" FROM "ClassAssignment" WHERE "assignmentId" = OLD."id"
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Assignment_delete_owned_artifacts"
BEFORE DELETE ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION delete_assignment_group_artifacts();
