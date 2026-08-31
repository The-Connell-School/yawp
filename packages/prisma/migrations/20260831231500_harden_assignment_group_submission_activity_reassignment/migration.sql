BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Expand the document guard from nominal-owner changes to every column that
-- can move an assignment-owned artifact's tenant anchor. Both insertion and
-- reparenting serialize on the same document advisory lock.
CREATE OR REPLACE FUNCTION "preventSubmissionActivityDocumentTenantReassignment"()
RETURNS TRIGGER AS $$
DECLARE
  old_organization_id TEXT;
  new_organization_id TEXT;
  parent_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(81203, hashtext(OLD.id));

  IF NEW."artifactKind" IS NOT DISTINCT FROM OLD."artifactKind"
     AND NEW."membershipId" IS NOT DISTINCT FROM OLD."membershipId"
     AND NEW."classAssignmentId" IS NOT DISTINCT FROM OLD."classAssignmentId"
     AND NEW."assignmentId" IS NOT DISTINCT FROM OLD."assignmentId"
     AND NEW."assignmentTypeId" IS NOT DISTINCT FROM OLD."assignmentTypeId" THEN
    RETURN NEW;
  END IF;

  FOR parent_id IN
    SELECT id
    FROM (VALUES (OLD."membershipId"), (NEW."membershipId")) AS ids(id)
    WHERE id IS NOT NULL
    GROUP BY id
    ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(81202, hashtext(parent_id));
  END LOOP;

  FOR parent_id IN
    SELECT id
    FROM (
      VALUES (OLD."classAssignmentId"), (NEW."classAssignmentId")
    ) AS ids(id)
    WHERE id IS NOT NULL
    GROUP BY id
    ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(81205, hashtext(parent_id));
  END LOOP;

  IF OLD."artifactKind"::TEXT = 'student' THEN
    SELECT membership."organizationId"
    INTO old_organization_id
    FROM "OrgMembership" membership
    WHERE membership.id = OLD."membershipId"
    FOR SHARE OF membership;
  ELSE
    SELECT school."organizationId"
    INTO old_organization_id
    FROM "ClassAssignment" class_assignment
    JOIN "Class" class_row ON class_row.id = class_assignment."classId"
    JOIN "School" school ON school.id = class_row."schoolId"
    WHERE class_assignment.id = OLD."classAssignmentId"
    FOR SHARE OF class_assignment, class_row, school;
  END IF;

  IF NEW."artifactKind"::TEXT = 'student' THEN
    SELECT membership."organizationId"
    INTO new_organization_id
    FROM "OrgMembership" membership
    WHERE membership.id = NEW."membershipId"
    FOR SHARE OF membership;
  ELSE
    SELECT school."organizationId"
    INTO new_organization_id
    FROM "ClassAssignment" class_assignment
    JOIN "Class" class_row ON class_row.id = class_assignment."classId"
    JOIN "School" school ON school.id = class_row."schoolId"
    WHERE class_assignment.id = NEW."classAssignmentId"
    FOR SHARE OF class_assignment, class_row, school;
  END IF;

  IF new_organization_id IS DISTINCT FROM old_organization_id
     AND EXISTS (
       SELECT 1
       FROM "Submission" submission
       JOIN "SubmissionActivity" activity
         ON activity."submissionId" = submission.id
       WHERE submission."documentId" = OLD.id
     ) THEN
    RAISE EXCEPTION 'Cannot move a document with durable submission activity to another organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "Document_submission_activity_tenant_guard" ON "Document";
CREATE TRIGGER "Document_submission_activity_tenant_guard"
BEFORE UPDATE OF "artifactKind", "membershipId", "classAssignmentId", "assignmentId", "assignmentTypeId"
ON "Document"
FOR EACH ROW EXECUTE FUNCTION "preventSubmissionActivityDocumentTenantReassignment"();

-- The original submission handoff guard also resolved tenants only through a
-- nominal document owner. Resolve and lock both artifact kinds so an immutable
-- activity row cannot be stranded under its old organization.
CREATE OR REPLACE FUNCTION "preventSubmissionActivitySubmissionDocumentReassignment"()
RETURNS TRIGGER AS $$
DECLARE
  old_organization_id TEXT;
  new_organization_id TEXT;
  old_artifact_kind TEXT;
  new_artifact_kind TEXT;
  old_membership_id TEXT;
  new_membership_id TEXT;
  old_class_assignment_id TEXT;
  new_class_assignment_id TEXT;
  first_document_id TEXT;
  second_document_id TEXT;
  parent_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(81204, hashtext(OLD.id));

  IF NEW."documentId" IS NOT DISTINCT FROM OLD."documentId" THEN
    RETURN NEW;
  END IF;

  first_document_id := LEAST(OLD."documentId", NEW."documentId");
  second_document_id := GREATEST(OLD."documentId", NEW."documentId");
  PERFORM pg_advisory_xact_lock(81203, hashtext(first_document_id));
  IF second_document_id IS DISTINCT FROM first_document_id THEN
    PERFORM pg_advisory_xact_lock(81203, hashtext(second_document_id));
  END IF;

  SELECT "artifactKind"::TEXT, "membershipId", "classAssignmentId"
  INTO old_artifact_kind, old_membership_id, old_class_assignment_id
  FROM "Document" WHERE id = OLD."documentId";
  SELECT "artifactKind"::TEXT, "membershipId", "classAssignmentId"
  INTO new_artifact_kind, new_membership_id, new_class_assignment_id
  FROM "Document" WHERE id = NEW."documentId";

  FOR parent_id IN
    SELECT id
    FROM (VALUES (old_membership_id), (new_membership_id)) AS ids(id)
    WHERE id IS NOT NULL
    GROUP BY id
    ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(81202, hashtext(parent_id));
  END LOOP;

  FOR parent_id IN
    SELECT id
    FROM (
      VALUES (old_class_assignment_id), (new_class_assignment_id)
    ) AS ids(id)
    WHERE id IS NOT NULL
    GROUP BY id
    ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(81205, hashtext(parent_id));
  END LOOP;

  IF old_artifact_kind = 'student' THEN
    SELECT membership."organizationId"
    INTO old_organization_id
    FROM "OrgMembership" membership
    WHERE membership.id = old_membership_id
    FOR SHARE OF membership;
  ELSE
    SELECT school."organizationId"
    INTO old_organization_id
    FROM "ClassAssignment" class_assignment
    JOIN "Class" class_row ON class_row.id = class_assignment."classId"
    JOIN "School" school ON school.id = class_row."schoolId"
    WHERE class_assignment.id = old_class_assignment_id
    FOR SHARE OF class_assignment, class_row, school;
  END IF;

  IF new_artifact_kind = 'student' THEN
    SELECT membership."organizationId"
    INTO new_organization_id
    FROM "OrgMembership" membership
    WHERE membership.id = new_membership_id
    FOR SHARE OF membership;
  ELSE
    SELECT school."organizationId"
    INTO new_organization_id
    FROM "ClassAssignment" class_assignment
    JOIN "Class" class_row ON class_row.id = class_assignment."classId"
    JOIN "School" school ON school.id = class_row."schoolId"
    WHERE class_assignment.id = new_class_assignment_id
    FOR SHARE OF class_assignment, class_row, school;
  END IF;

  IF new_organization_id IS DISTINCT FROM old_organization_id
     AND EXISTS (
       SELECT 1
       FROM "SubmissionActivity" activity
       WHERE activity."submissionId" = OLD.id
     ) THEN
    RAISE EXCEPTION 'Cannot move an audited submission to a document in another organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
