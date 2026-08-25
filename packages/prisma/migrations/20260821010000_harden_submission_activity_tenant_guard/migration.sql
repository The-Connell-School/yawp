BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Lock each mutable parent in root-to-leaf order, then re-resolve the next
-- parent only after its child is stable. This closes the document-owner
-- handoff race where the destination membership changes tenants concurrently.
CREATE OR REPLACE FUNCTION "enforceSubmissionActivityTenant"()
RETURNS TRIGGER AS $$
DECLARE
  submission_organization_id TEXT;
  submission_document_id TEXT;
  submission_owner_membership_id TEXT;
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

  SELECT document."membershipId"
  INTO submission_owner_membership_id
  FROM "Document" document
  WHERE document.id = submission_document_id;

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

  IF submission_organization_id IS NULL
     OR submission_organization_id <> NEW."organizationId" THEN
    RAISE EXCEPTION 'SubmissionActivity organization must match submission tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A document handoff and a destination-membership tenant move must serialize
-- on both memberships. Lock first, then compare freshly resolved tenants.
CREATE OR REPLACE FUNCTION "preventSubmissionActivityDocumentTenantReassignment"()
RETURNS TRIGGER AS $$
DECLARE
  old_organization_id TEXT;
  new_organization_id TEXT;
  first_membership_id TEXT;
  second_membership_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(81203, hashtext(OLD.id));

  IF NEW."membershipId" IS NOT DISTINCT FROM OLD."membershipId" THEN
    RETURN NEW;
  END IF;

  first_membership_id := LEAST(OLD."membershipId", NEW."membershipId");
  second_membership_id := GREATEST(OLD."membershipId", NEW."membershipId");
  PERFORM pg_advisory_xact_lock(81202, hashtext(first_membership_id));
  IF second_membership_id IS DISTINCT FROM first_membership_id THEN
    PERFORM pg_advisory_xact_lock(81202, hashtext(second_membership_id));
  END IF;

  SELECT "organizationId" INTO old_organization_id
  FROM "OrgMembership" WHERE id = OLD."membershipId";
  SELECT "organizationId" INTO new_organization_id
  FROM "OrgMembership" WHERE id = NEW."membershipId";

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

-- A submission-to-document handoff must lock both documents, then both current
-- owner memberships, before comparing the final parent chain.
CREATE OR REPLACE FUNCTION "preventSubmissionActivitySubmissionDocumentReassignment"()
RETURNS TRIGGER AS $$
DECLARE
  old_organization_id TEXT;
  new_organization_id TEXT;
  old_membership_id TEXT;
  new_membership_id TEXT;
  first_document_id TEXT;
  second_document_id TEXT;
  first_membership_id TEXT;
  second_membership_id TEXT;
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

  SELECT "membershipId" INTO old_membership_id
  FROM "Document" WHERE id = OLD."documentId";
  SELECT "membershipId" INTO new_membership_id
  FROM "Document" WHERE id = NEW."documentId";

  first_membership_id := LEAST(old_membership_id, new_membership_id);
  second_membership_id := GREATEST(old_membership_id, new_membership_id);
  PERFORM pg_advisory_xact_lock(81202, hashtext(first_membership_id));
  IF second_membership_id IS DISTINCT FROM first_membership_id THEN
    PERFORM pg_advisory_xact_lock(81202, hashtext(second_membership_id));
  END IF;

  SELECT "organizationId" INTO old_organization_id
  FROM "OrgMembership" WHERE id = old_membership_id;
  SELECT "organizationId" INTO new_organization_id
  FROM "OrgMembership" WHERE id = new_membership_id;

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

-- Keep direct cleanup scoped to deterministic proof and production-QA rows.
-- v1 and v3 fixture rows are both explicit; no wildcard organization access.
CREATE OR REPLACE FUNCTION "enforceSubmissionActivityImmutability"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() > 1
     AND NEW."actorMembershipId" IS NULL
     AND OLD."actorMembershipId" IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW."createdAt" = OLD."createdAt"
     AND NEW."submissionId" = OLD."submissionId"
     AND NEW."organizationId" = OLD."organizationId"
     AND NEW."actorType" = OLD."actorType"
     AND NEW."actorName" IS NOT DISTINCT FROM OLD."actorName"
     AND NEW."actorEmail" IS NOT DISTINCT FROM OLD."actorEmail"
     AND NEW."eventType" = OLD."eventType"
     AND NEW.source = OLD.source
     AND NEW."occurredAfterRelease" = OLD."occurredAfterRelease"
     AND NEW.changes = OLD.changes
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND (
    pg_trigger_depth() > 1
    OR (
      current_setting('yawp.submission_activity_cleanup', true) = 'on'
      AND (
        (OLD.source = 'db-proof' AND OLD.id LIKE 'submission-activity-%')
        OR OLD."submissionId" LIKE 'e2e-released-grade-audit-%'
        OR (
          OLD."submissionId" = 'prod-qa-released-submission'
          AND OLD."organizationId" = 'prod-qa-org'
        )
        OR (
          OLD."submissionId" = 'prod-qa-v3-released-submission'
          AND OLD."organizationId" = 'prod-qa-v3-org'
        )
      )
    )
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'SubmissionActivity rows are immutable'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

COMMIT;
