SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE "LtiLaunchTransaction"
  ADD COLUMN "browserBindingHash" TEXT,
  ADD COLUMN "requesterHash" TEXT,
  ADD COLUMN "verificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- Existing pre-binding rows are intentionally made uncompletable after this
-- migration. Their existing one-time digests are safe unique tombstones.
UPDATE "LtiLaunchTransaction"
SET "browserBindingHash" = "stateHash",
    "requesterHash" = "loginHintHash"
WHERE "browserBindingHash" IS NULL OR "requesterHash" IS NULL;

ALTER TABLE "LtiLaunchTransaction"
  ALTER COLUMN "browserBindingHash" SET NOT NULL,
  ALTER COLUMN "requesterHash" SET NOT NULL,
  ADD CONSTRAINT "LtiLaunchTransaction_browser_binding_hash_check"
    CHECK (LENGTH("browserBindingHash") = 64),
  ADD CONSTRAINT "LtiLaunchTransaction_requester_hash_check"
    CHECK (LENGTH("requesterHash") = 64),
  ADD CONSTRAINT "LtiLaunchTransaction_verification_attempts_check"
    CHECK ("verificationAttempts" BETWEEN 0 AND 8);

CREATE UNIQUE INDEX "LtiLaunchTransaction_browserBindingHash_key"
  ON "LtiLaunchTransaction"("browserBindingHash");
CREATE INDEX "LtiLaunchTransaction_requesterHash_createdAt_idx"
  ON "LtiLaunchTransaction"("requesterHash", "createdAt" DESC);

ALTER TABLE "LtiPendingLink"
  ADD COLUMN "subjectHashKeyId" TEXT NOT NULL DEFAULT 'legacy-session-v1';
ALTER TABLE "LtiExternalIdentity"
  ADD COLUMN "subjectHashKeyId" TEXT NOT NULL DEFAULT 'legacy-session-v1';

ALTER TABLE "LtiPendingLink"
  ADD CONSTRAINT "LtiPendingLink_subject_hash_key_id_check"
    CHECK (LENGTH("subjectHashKeyId") BETWEEN 1 AND 40);
ALTER TABLE "LtiExternalIdentity"
  ADD CONSTRAINT "LtiExternalIdentity_subject_hash_key_id_check"
    CHECK (LENGTH("subjectHashKeyId") BETWEEN 1 AND 40);

CREATE UNIQUE INDEX "LtiExternalIdentity_id_organizationId_key"
  ON "LtiExternalIdentity"("id", "organizationId");

ALTER TABLE "LtiExternalIdentity"
  DROP CONSTRAINT "LtiExternalIdentity_membershipId_organizationId_fkey",
  ADD CONSTRAINT "LtiExternalIdentity_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD COLUMN "ltiRegistrationId" TEXT,
  ADD COLUMN "ltiOrganizationId" TEXT,
  ADD COLUMN "ltiExternalIdentityId" TEXT,
  ADD CONSTRAINT "Session_lti_provenance_check"
    CHECK (
      ("ltiRegistrationId" IS NULL AND "ltiOrganizationId" IS NULL AND "ltiExternalIdentityId" IS NULL)
      OR
      ("ltiRegistrationId" IS NOT NULL AND "ltiOrganizationId" IS NOT NULL AND "ltiExternalIdentityId" IS NOT NULL)
    );

CREATE INDEX "Session_ltiRegistrationId_expirationDate_idx"
  ON "Session"("ltiRegistrationId", "expirationDate");
CREATE INDEX "Session_ltiExternalIdentityId_idx"
  ON "Session"("ltiExternalIdentityId");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_ltiRegistrationId_ltiOrganizationId_fkey"
  FOREIGN KEY ("ltiRegistrationId", "ltiOrganizationId")
  REFERENCES "LtiRegistration"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Session_ltiExternalIdentityId_ltiOrganizationId_fkey"
  FOREIGN KEY ("ltiExternalIdentityId", "ltiOrganizationId")
  REFERENCES "LtiExternalIdentity"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Permit only database-owned parent deletion nulling while preserving all
-- other append-only audit fields byte-for-byte.
CREATE OR REPLACE FUNCTION prevent_lti_audit_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW."id" = OLD."id"
    AND NEW."createdAt" = OLD."createdAt"
    AND NEW."eventType" = OLD."eventType"
    AND NEW."outcome" = OLD."outcome"
    AND NEW."subjectHash" IS NOT DISTINCT FROM OLD."subjectHash"
    AND NEW."contextId" IS NOT DISTINCT FROM OLD."contextId"
    AND NEW."requestId" IS NOT DISTINCT FROM OLD."requestId"
    AND NEW."details" IS NOT DISTINCT FROM OLD."details"
    AND NEW."organizationId" = OLD."organizationId"
    AND (
      (
        OLD."registrationId" IS NOT NULL
        AND NEW."registrationId" IS NULL
        AND NEW."actorUserId" IS NOT DISTINCT FROM OLD."actorUserId"
        AND NOT EXISTS (
          SELECT 1 FROM "LtiRegistration" WHERE "id" = OLD."registrationId"
        )
      )
      OR
      (
        OLD."actorUserId" IS NOT NULL
        AND NEW."actorUserId" IS NULL
        AND NEW."registrationId" IS NOT DISTINCT FROM OLD."registrationId"
        AND NOT EXISTS (
          SELECT 1 FROM "User" WHERE "id" = OLD."actorUserId"
        )
      )
    )
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    AND NOT EXISTS (
      SELECT 1 FROM "Organization" WHERE "id" = OLD."organizationId"
    )
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'LTI audit events are append-only';
END;
$$ LANGUAGE plpgsql;
