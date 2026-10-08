-- Allow Playwright free-tier handle-join teardown to remove submission activity
-- when yawp.submission_activity_cleanup is on and the submission belongs to a
-- disposable e2ehandle* test user (see auth.free-tier-handle-join.spec.ts).

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
        OR EXISTS (
          SELECT 1
          FROM "Submission" s
          INNER JOIN "Document" d ON d.id = s."documentId"
          INNER JOIN "OrgMembership" m ON m.id = d."membershipId"
          INNER JOIN "User" u ON u.id = m."userId"
          WHERE s.id = OLD."submissionId"
            AND u.username LIKE 'e2ehandle%'
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
