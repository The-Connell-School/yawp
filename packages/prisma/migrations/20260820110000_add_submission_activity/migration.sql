BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Additive rollout gate. Recording begins immediately; released-grade editing
-- and staff-facing activity UI remain disabled until this flag is enabled.
ALTER TABLE "Organization"
ADD COLUMN "submissionActivityEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Durable, append-only submission audit history. No historical rows are
-- backfilled because doing so would invent actors and timestamps.
CREATE TABLE "SubmissionActivity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "occurredAfterRelease" BOOLEAN NOT NULL DEFAULT false,
    "changes" JSONB NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "SubmissionActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionActivity_submissionId_createdAt_idx"
ON "SubmissionActivity"("submissionId", "createdAt" DESC);

CREATE INDEX "SubmissionActivity_organizationId_createdAt_idx"
ON "SubmissionActivity"("organizationId", "createdAt" DESC);

CREATE INDEX "SubmissionActivity_actorMembershipId_createdAt_idx"
ON "SubmissionActivity"("actorMembershipId", "createdAt" DESC);

CREATE INDEX "SubmissionActivity_eventType_createdAt_idx"
ON "SubmissionActivity"("eventType", "createdAt" DESC);

ALTER TABLE "SubmissionActivity"
ADD CONSTRAINT "SubmissionActivity_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubmissionActivity"
ADD CONSTRAINT "SubmissionActivity_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubmissionActivity"
ADD CONSTRAINT "SubmissionActivity_actorMembershipId_organizationId_fkey"
FOREIGN KEY ("actorMembershipId", "organizationId")
REFERENCES "OrgMembership"("id", "organizationId")
ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Prisma cannot express column-specific SET NULL for a composite relation.
-- Detach only the optional actor link before membership deletion while keeping
-- the immutable tenant id and actor snapshot on the audit row.
CREATE FUNCTION "detachSubmissionActivityActor"()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "SubmissionActivity"
  SET "actorMembershipId" = NULL
  WHERE "actorMembershipId" = OLD.id
    AND "organizationId" = OLD."organizationId";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrgMembership_detach_submission_activity_actor"
BEFORE DELETE ON "OrgMembership"
FOR EACH ROW EXECUTE FUNCTION "detachSubmissionActivityActor"();

-- Submission does not duplicate organizationId. Enforce the immutable
-- submission-to-tenant anchor against its document owner's membership.
CREATE FUNCTION "enforceSubmissionActivityTenant"()
RETURNS TRIGGER AS $$
DECLARE
  submission_organization_id TEXT;
BEGIN
  SELECT membership."organizationId"
  INTO submission_organization_id
  FROM "Submission" submission
  JOIN "Document" document ON document.id = submission."documentId"
  JOIN "OrgMembership" membership ON membership.id = document."membershipId"
  WHERE submission.id = NEW."submissionId";

  IF submission_organization_id IS NULL
     OR submission_organization_id <> NEW."organizationId" THEN
    RAISE EXCEPTION 'SubmissionActivity organization must match submission tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SubmissionActivity_tenant_guard"
BEFORE INSERT OR UPDATE OF "submissionId", "organizationId"
ON "SubmissionActivity"
FOR EACH ROW EXECUTE FUNCTION "enforceSubmissionActivityTenant"();

-- The activity row guard cannot observe later changes to the parent chain.
-- Reject cross-tenant moves of either the owner membership or document once a
-- submission has durable activity, keeping historical rows reachable forever.
CREATE FUNCTION "preventSubmissionActivityOwnerTenantReassignment"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     AND EXISTS (
       SELECT 1
       FROM "Document" document
       JOIN "Submission" submission ON submission."documentId" = document.id
       JOIN "SubmissionActivity" activity
         ON activity."submissionId" = submission.id
       WHERE document."membershipId" = OLD.id
     ) THEN
    RAISE EXCEPTION 'Cannot move a submission owner with durable activity to another organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrgMembership_submission_activity_owner_tenant_guard"
BEFORE UPDATE OF "organizationId" ON "OrgMembership"
FOR EACH ROW EXECUTE FUNCTION "preventSubmissionActivityOwnerTenantReassignment"();

CREATE FUNCTION "preventSubmissionActivityDocumentTenantReassignment"()
RETURNS TRIGGER AS $$
DECLARE
  old_organization_id TEXT;
  new_organization_id TEXT;
BEGIN
  IF NEW."membershipId" IS NOT DISTINCT FROM OLD."membershipId" THEN
    RETURN NEW;
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

CREATE TRIGGER "Document_submission_activity_tenant_guard"
BEFORE UPDATE OF "membershipId" ON "Document"
FOR EACH ROW EXECUTE FUNCTION "preventSubmissionActivityDocumentTenantReassignment"();

COMMIT;
