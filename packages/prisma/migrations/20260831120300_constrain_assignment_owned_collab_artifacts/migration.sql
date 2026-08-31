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
  );

ALTER TABLE "DocumentGroup"
  DROP CONSTRAINT "DocumentGroup_documentId_fkey",
  ADD CONSTRAINT "DocumentGroup_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_assignment_group_document()
RETURNS TRIGGER AS $$
DECLARE matching_graphs integer;
BEGIN
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
