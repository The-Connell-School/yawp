BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- SubmissionActivity predates assignment-owned collaborative artifacts. Its
-- tenant guard originally resolved every submission through Document.membershipId,
-- but an assignment-group document is intentionally ownerless. Resolve those
-- documents through their ClassAssignment instead, while retaining the existing
-- student-owner path and rejecting a caller-provided tenant that does not match.
CREATE OR REPLACE FUNCTION "enforceSubmissionActivityTenant"()
RETURNS TRIGGER AS $$
DECLARE
  submission_organization_id TEXT;
  submission_document_id TEXT;
  submission_artifact_kind TEXT;
  submission_owner_membership_id TEXT;
  submission_class_assignment_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(81204, hashtext(NEW."submissionId"));

  SELECT submission."documentId"
  INTO submission_document_id
  FROM "Submission" submission
  WHERE submission.id = NEW."submissionId";

  IF submission_document_id IS NULL THEN
    RAISE EXCEPTION 'SubmissionActivity submission does not exist'
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(81203, hashtext(submission_document_id));

  SELECT document."artifactKind"::TEXT,
         document."membershipId",
         document."classAssignmentId"
  INTO submission_artifact_kind,
       submission_owner_membership_id,
       submission_class_assignment_id
  FROM "Document" document
  WHERE document.id = submission_document_id;

  IF submission_artifact_kind = 'student' THEN
    IF submission_owner_membership_id IS NULL THEN
      RAISE EXCEPTION 'SubmissionActivity document owner does not exist'
        USING ERRCODE = '23503';
    END IF;

    PERFORM pg_advisory_xact_lock(
      81202,
      hashtext(submission_owner_membership_id)
    );

    SELECT membership."organizationId"
    INTO submission_organization_id
    FROM "OrgMembership" membership
    WHERE membership.id = submission_owner_membership_id;
  ELSIF submission_artifact_kind = 'assignment-group' THEN
    IF submission_class_assignment_id IS NULL THEN
      RAISE EXCEPTION 'SubmissionActivity class assignment does not exist'
        USING ERRCODE = '23503';
    END IF;

    -- Use a separate namespace from submission/document/membership locks. The
    -- row locks keep the assignment-to-school tenant chain stable for the write.
    PERFORM pg_advisory_xact_lock(
      81205,
      hashtext(submission_class_assignment_id)
    );

    SELECT school."organizationId"
    INTO submission_organization_id
    FROM "ClassAssignment" class_assignment
    JOIN "Class" class ON class.id = class_assignment."classId"
    JOIN "School" school ON school.id = class."schoolId"
    WHERE class_assignment.id = submission_class_assignment_id
    FOR SHARE OF class_assignment, class, school;
  ELSE
    RAISE EXCEPTION 'SubmissionActivity document artifact kind is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF submission_organization_id IS NULL
     OR submission_organization_id <> NEW."organizationId" THEN
    RAISE EXCEPTION 'SubmissionActivity organization must match submission tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
