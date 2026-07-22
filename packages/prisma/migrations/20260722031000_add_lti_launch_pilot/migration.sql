SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE "Organization"
  ADD COLUMN "ltiEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LtiRegistration" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "authorizationEndpoint" TEXT NOT NULL,
  "tokenEndpoint" TEXT NOT NULL,
  "jwksUrl" TEXT NOT NULL,
  "loginInitiationUrl" TEXT NOT NULL,
  "launchUrl" TEXT NOT NULL,
  "deepLinkingLaunchUrl" TEXT NOT NULL,
  "toolJwksUrl" TEXT NOT NULL,
  "allowedAudiences" TEXT[] NOT NULL,
  "allowedServiceOrigins" TEXT[] NOT NULL,
  "allowedTargetLinkUris" TEXT[] NOT NULL,
  "enabledScopes" TEXT[] NOT NULL,
  "jwksCacheTtlSeconds" INTEGER NOT NULL DEFAULT 300,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "disabledAt" TIMESTAMPTZ(6),
  "uninstalledAt" TIMESTAMPTZ(6),
  CONSTRAINT "LtiRegistration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LtiRegistration_nonempty_external_key_check"
    CHECK (LENGTH("issuer") > 0 AND LENGTH("clientId") > 0 AND LENGTH("deploymentId") > 0),
  CONSTRAINT "LtiRegistration_jwks_cache_ttl_check"
    CHECK ("jwksCacheTtlSeconds" BETWEEN 30 AND 3600)
);

CREATE TABLE "LtiLaunchTransaction" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "consumedAt" TIMESTAMPTZ(6),
  "stateHash" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "loginHintHash" TEXT NOT NULL,
  "messageHintHash" TEXT,
  "targetLinkUri" TEXT NOT NULL,
  "expectedMessageType" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  CONSTRAINT "LtiLaunchTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LtiLaunchTransaction_hash_lengths_check"
    CHECK (
      LENGTH("stateHash") = 64
      AND LENGTH("nonceHash") = 64
      AND LENGTH("loginHintHash") = 64
      AND ("messageHintHash" IS NULL OR LENGTH("messageHintHash") = 64)
    ),
  CONSTRAINT "LtiLaunchTransaction_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "LtiCourseMapping" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "contextId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "registrationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  CONSTRAINT "LtiCourseMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LtiCourseMapping_context_check"
    CHECK (LENGTH("contextId") BETWEEN 1 AND 255)
);

CREATE TABLE "LtiPendingLink" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "consumedAt" TIMESTAMPTZ(6),
  "secretHash" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "membershipRole" "MembershipRole" NOT NULL,
  "transactionId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseMappingId" TEXT NOT NULL,
  CONSTRAINT "LtiPendingLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LtiPendingLink_hash_lengths_check"
    CHECK (LENGTH("secretHash") = 64 AND LENGTH("subjectHash") = 64),
  CONSTRAINT "LtiPendingLink_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "LtiExternalIdentity" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "lastLaunchedAt" TIMESTAMPTZ(6),
  "subjectHash" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  CONSTRAINT "LtiExternalIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LtiExternalIdentity_subject_hash_check"
    CHECK (LENGTH("subjectHash") = 64)
);

CREATE TABLE "LtiAuditEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventType" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "subjectHash" TEXT,
  "contextId" TEXT,
  "requestId" TEXT,
  "details" JSONB,
  "registrationId" TEXT,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  CONSTRAINT "LtiAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LtiAuditEvent_bounded_fields_check"
    CHECK (
      LENGTH("eventType") BETWEEN 1 AND 80
      AND LENGTH("outcome") BETWEEN 1 AND 40
      AND ("subjectHash" IS NULL OR LENGTH("subjectHash") = 64)
      AND ("contextId" IS NULL OR LENGTH("contextId") <= 255)
      AND ("requestId" IS NULL OR LENGTH("requestId") <= 255)
    )
);

CREATE UNIQUE INDEX "LtiRegistration_issuer_clientId_deploymentId_key"
  ON "LtiRegistration"("issuer", "clientId", "deploymentId");
CREATE UNIQUE INDEX "LtiRegistration_id_organizationId_key"
  ON "LtiRegistration"("id", "organizationId");
CREATE INDEX "LtiRegistration_organizationId_enabled_idx"
  ON "LtiRegistration"("organizationId", "enabled");

CREATE UNIQUE INDEX "LtiLaunchTransaction_stateHash_key"
  ON "LtiLaunchTransaction"("stateHash");
CREATE UNIQUE INDEX "LtiLaunchTransaction_nonceHash_key"
  ON "LtiLaunchTransaction"("nonceHash");
CREATE INDEX "LtiLaunchTransaction_registrationId_expiresAt_idx"
  ON "LtiLaunchTransaction"("registrationId", "expiresAt");
CREATE INDEX "LtiLaunchTransaction_organizationId_consumedAt_idx"
  ON "LtiLaunchTransaction"("organizationId", "consumedAt");

CREATE UNIQUE INDEX "LtiCourseMapping_registrationId_contextId_key"
  ON "LtiCourseMapping"("registrationId", "contextId");
CREATE UNIQUE INDEX "LtiCourseMapping_registrationId_classId_key"
  ON "LtiCourseMapping"("registrationId", "classId");
CREATE UNIQUE INDEX "LtiCourseMapping_id_organizationId_key"
  ON "LtiCourseMapping"("id", "organizationId");
CREATE INDEX "LtiCourseMapping_organizationId_enabled_idx"
  ON "LtiCourseMapping"("organizationId", "enabled");
CREATE INDEX "LtiCourseMapping_classId_idx"
  ON "LtiCourseMapping"("classId");

CREATE UNIQUE INDEX "LtiPendingLink_secretHash_key"
  ON "LtiPendingLink"("secretHash");
CREATE UNIQUE INDEX "LtiPendingLink_transactionId_key"
  ON "LtiPendingLink"("transactionId");
CREATE INDEX "LtiPendingLink_registrationId_subjectHash_idx"
  ON "LtiPendingLink"("registrationId", "subjectHash");
CREATE INDEX "LtiPendingLink_organizationId_expiresAt_idx"
  ON "LtiPendingLink"("organizationId", "expiresAt");

CREATE UNIQUE INDEX "LtiExternalIdentity_registrationId_subjectHash_key"
  ON "LtiExternalIdentity"("registrationId", "subjectHash");
CREATE UNIQUE INDEX "LtiExternalIdentity_registrationId_membershipId_key"
  ON "LtiExternalIdentity"("registrationId", "membershipId");
CREATE INDEX "LtiExternalIdentity_organizationId_membershipId_idx"
  ON "LtiExternalIdentity"("organizationId", "membershipId");

CREATE INDEX "LtiAuditEvent_organizationId_createdAt_idx"
  ON "LtiAuditEvent"("organizationId", "createdAt" DESC);
CREATE INDEX "LtiAuditEvent_registrationId_createdAt_idx"
  ON "LtiAuditEvent"("registrationId", "createdAt" DESC);
CREATE INDEX "LtiAuditEvent_eventType_outcome_createdAt_idx"
  ON "LtiAuditEvent"("eventType", "outcome", "createdAt" DESC);

ALTER TABLE "LtiRegistration"
  ADD CONSTRAINT "LtiRegistration_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LtiLaunchTransaction"
  ADD CONSTRAINT "LtiLaunchTransaction_registrationId_organizationId_fkey"
  FOREIGN KEY ("registrationId", "organizationId")
  REFERENCES "LtiRegistration"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiLaunchTransaction_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LtiCourseMapping"
  ADD CONSTRAINT "LtiCourseMapping_registrationId_organizationId_fkey"
  FOREIGN KEY ("registrationId", "organizationId")
  REFERENCES "LtiRegistration"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiCourseMapping_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiCourseMapping_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Class"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LtiPendingLink"
  ADD CONSTRAINT "LtiPendingLink_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "LtiLaunchTransaction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiPendingLink_registrationId_organizationId_fkey"
  FOREIGN KEY ("registrationId", "organizationId")
  REFERENCES "LtiRegistration"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiPendingLink_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiPendingLink_courseMappingId_organizationId_fkey"
  FOREIGN KEY ("courseMappingId", "organizationId")
  REFERENCES "LtiCourseMapping"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LtiExternalIdentity"
  ADD CONSTRAINT "LtiExternalIdentity_registrationId_organizationId_fkey"
  FOREIGN KEY ("registrationId", "organizationId")
  REFERENCES "LtiRegistration"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiExternalIdentity_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiExternalIdentity_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LtiAuditEvent"
  ADD CONSTRAINT "LtiAuditEvent_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "LtiRegistration"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiAuditEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LtiAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_lti_registration_tenant_reassignment()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    RAISE EXCEPTION 'cannot reassign an LTI registration to another organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LtiRegistration_tenant_reassignment_check"
BEFORE UPDATE OF "organizationId" ON "LtiRegistration"
FOR EACH ROW EXECUTE FUNCTION prevent_lti_registration_tenant_reassignment();

CREATE OR REPLACE FUNCTION enforce_lti_course_mapping_tenant()
RETURNS trigger AS $$
DECLARE
  class_org TEXT;
BEGIN
  SELECT school."organizationId" INTO class_org
  FROM "Class" class_row
  JOIN "School" school ON school."id" = class_row."schoolId"
  WHERE class_row."id" = NEW."classId";

  IF class_org IS DISTINCT FROM NEW."organizationId" THEN
    RAISE EXCEPTION 'cross-organization LTI course mapping';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LtiCourseMapping_tenant_check"
BEFORE INSERT OR UPDATE OF "organizationId", "classId"
ON "LtiCourseMapping"
FOR EACH ROW EXECUTE FUNCTION enforce_lti_course_mapping_tenant();

CREATE OR REPLACE FUNCTION enforce_lti_pending_registration()
RETURNS trigger AS $$
DECLARE
  mapping_registration TEXT;
BEGIN
  SELECT "registrationId" INTO mapping_registration
  FROM "LtiCourseMapping" WHERE "id" = NEW."courseMappingId";

  IF mapping_registration IS DISTINCT FROM NEW."registrationId" THEN
    RAISE EXCEPTION 'cross-registration LTI pending link';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LtiPendingLink_registration_check"
BEFORE INSERT OR UPDATE OF "registrationId", "courseMappingId"
ON "LtiPendingLink"
FOR EACH ROW EXECUTE FUNCTION enforce_lti_pending_registration();

CREATE OR REPLACE FUNCTION prevent_lti_identity_membership_reassignment()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    AND EXISTS (
      SELECT 1 FROM "LtiExternalIdentity"
      WHERE "membershipId" = OLD."id"
    )
  THEN
    RAISE EXCEPTION 'cannot reassign a membership with an LTI identity';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrgMembership_lti_tenant_check"
BEFORE UPDATE OF "organizationId" ON "OrgMembership"
FOR EACH ROW EXECUTE FUNCTION prevent_lti_identity_membership_reassignment();

CREATE OR REPLACE FUNCTION enforce_lti_audit_registration_tenant()
RETURNS trigger AS $$
DECLARE
  registration_org TEXT;
BEGIN
  IF NEW."registrationId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "organizationId" INTO registration_org
  FROM "LtiRegistration" WHERE "id" = NEW."registrationId";
  IF registration_org IS DISTINCT FROM NEW."organizationId" THEN
    RAISE EXCEPTION 'cross-organization LTI audit event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LtiAuditEvent_tenant_check"
BEFORE INSERT ON "LtiAuditEvent"
FOR EACH ROW EXECUTE FUNCTION enforce_lti_audit_registration_tenant();

CREATE OR REPLACE FUNCTION prevent_lti_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LTI audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LtiAuditEvent_append_only_update"
BEFORE UPDATE ON "LtiAuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_lti_audit_mutation();

CREATE TRIGGER "LtiAuditEvent_append_only_delete"
BEFORE DELETE ON "LtiAuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_lti_audit_mutation();

-- A class with an LTI mapping cannot move across tenants even before ordinary
-- assignments are deployed.
CREATE OR REPLACE FUNCTION prevent_deployed_class_tenant_reassignment()
RETURNS trigger AS $$
DECLARE
  old_org TEXT;
  new_org TEXT;
BEGIN
  SELECT "organizationId" INTO old_org
  FROM "School" WHERE "id" = OLD."schoolId";
  SELECT "organizationId" INTO new_org
  FROM "School" WHERE "id" = NEW."schoolId";

  IF new_org IS DISTINCT FROM old_org
    AND (
      EXISTS (SELECT 1 FROM "ClassAssignment" WHERE "classId" = OLD."id")
      OR EXISTS (
        SELECT 1 FROM "WritingPracticeClassAssignment"
        WHERE "classId" = OLD."id"
      )
      OR EXISTS (
        SELECT 1 FROM "LtiCourseMapping" WHERE "classId" = OLD."id"
      )
    )
  THEN
    RAISE EXCEPTION 'cannot reassign a class with tenant-anchored work';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
