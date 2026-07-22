SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- AlterTable
ALTER TABLE "LtiCourseMapping" ADD COLUMN     "agsLineItemsUrl" TEXT,
ADD COLUMN     "agsScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastServiceLaunchAt" TIMESTAMPTZ(6),
ADD COLUMN     "nrpsMembershipsUrl" TEXT,
ADD COLUMN     "nrpsVersions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "LtiDeepLinkRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "browserSecretHash" TEXT NOT NULL,
    "responseNonce" TEXT NOT NULL,
    "returnUrl" TEXT NOT NULL,
    "data" TEXT,
    "acceptTypes" TEXT[],
    "documentTargets" TEXT[],
    "acceptsMultiple" BOOLEAN NOT NULL,
    "acceptLineItem" BOOLEAN,
    "transactionId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseMappingId" TEXT NOT NULL,
    "teacherMembershipId" TEXT NOT NULL,

    CONSTRAINT "LtiDeepLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiPlacement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceLinkId" TEXT,
    "lineItemUrl" TEXT,
    "scoreMaximum" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "registrationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseMappingId" TEXT NOT NULL,
    "classAssignmentId" TEXT NOT NULL,

    CONSTRAINT "LtiPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiRosterEnrollment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "subjectHashKeyId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "lmsStatus" TEXT NOT NULL,
    "reconciliationState" TEXT NOT NULL,
    "managedByLti" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL,
    "registrationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseMappingId" TEXT NOT NULL,
    "externalIdentityId" TEXT,
    "membershipId" TEXT,

    CONSTRAINT "LtiRosterEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiWorkflowRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "nextAttemptAt" TIMESTAMPTZ(6),
    "deadLetteredAt" TIMESTAMPTZ(6),
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "summary" JSONB,
    "registrationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseMappingId" TEXT NOT NULL,

    CONSTRAINT "LtiWorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiGradePassback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "releasedAt" TIMESTAMPTZ(6) NOT NULL,
    "scoreTimestamp" TIMESTAMPTZ(6) NOT NULL,
    "scoreGiven" DOUBLE PRECISION NOT NULL,
    "scoreMaximum" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "deadLetteredAt" TIMESTAMPTZ(6),
    "lastErrorCode" TEXT,
    "registrationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseMappingId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "externalIdentityId" TEXT NOT NULL,

    CONSTRAINT "LtiGradePassback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LtiDeepLinkRequest_browserSecretHash_key" ON "LtiDeepLinkRequest"("browserSecretHash");

-- CreateIndex
CREATE UNIQUE INDEX "LtiDeepLinkRequest_transactionId_key" ON "LtiDeepLinkRequest"("transactionId");

-- CreateIndex
CREATE INDEX "LtiDeepLinkRequest_organizationId_expiresAt_idx" ON "LtiDeepLinkRequest"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "LtiDeepLinkRequest_courseMappingId_consumedAt_idx" ON "LtiDeepLinkRequest"("courseMappingId", "consumedAt");

-- CreateIndex
CREATE INDEX "LtiPlacement_organizationId_enabled_idx" ON "LtiPlacement"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlacement_registrationId_resourceId_key" ON "LtiPlacement"("registrationId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlacement_registrationId_resourceLinkId_key" ON "LtiPlacement"("registrationId", "resourceLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlacement_courseMappingId_classAssignmentId_key" ON "LtiPlacement"("courseMappingId", "classAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlacement_id_organizationId_key" ON "LtiPlacement"("id", "organizationId");

-- CreateIndex
CREATE INDEX "LtiRosterEnrollment_organizationId_reconciliationState_idx" ON "LtiRosterEnrollment"("organizationId", "reconciliationState");

-- CreateIndex
CREATE INDEX "LtiRosterEnrollment_membershipId_courseMappingId_idx" ON "LtiRosterEnrollment"("membershipId", "courseMappingId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiRosterEnrollment_courseMappingId_subjectHash_key" ON "LtiRosterEnrollment"("courseMappingId", "subjectHash");

-- CreateIndex
CREATE INDEX "LtiWorkflowRun_organizationId_kind_createdAt_idx" ON "LtiWorkflowRun"("organizationId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LtiWorkflowRun_status_nextAttemptAt_idx" ON "LtiWorkflowRun"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "LtiWorkflowRun_registrationId_idempotencyKey_key" ON "LtiWorkflowRun"("registrationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LtiGradePassback_organizationId_status_nextAttemptAt_idx" ON "LtiGradePassback"("organizationId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "LtiGradePassback_submissionId_idx" ON "LtiGradePassback"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiGradePassback_placementId_submissionId_key" ON "LtiGradePassback"("placementId", "submissionId");

-- AddForeignKey
ALTER TABLE "LtiDeepLinkRequest" ADD CONSTRAINT "LtiDeepLinkRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LtiLaunchTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiDeepLinkRequest" ADD CONSTRAINT "LtiDeepLinkRequest_registrationId_organizationId_fkey" FOREIGN KEY ("registrationId", "organizationId") REFERENCES "LtiRegistration"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiDeepLinkRequest" ADD CONSTRAINT "LtiDeepLinkRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiDeepLinkRequest" ADD CONSTRAINT "LtiDeepLinkRequest_courseMappingId_organizationId_fkey" FOREIGN KEY ("courseMappingId", "organizationId") REFERENCES "LtiCourseMapping"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiDeepLinkRequest" ADD CONSTRAINT "LtiDeepLinkRequest_teacherMembershipId_organizationId_fkey" FOREIGN KEY ("teacherMembershipId", "organizationId") REFERENCES "OrgMembership"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiPlacement" ADD CONSTRAINT "LtiPlacement_registrationId_organizationId_fkey" FOREIGN KEY ("registrationId", "organizationId") REFERENCES "LtiRegistration"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiPlacement" ADD CONSTRAINT "LtiPlacement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiPlacement" ADD CONSTRAINT "LtiPlacement_courseMappingId_organizationId_fkey" FOREIGN KEY ("courseMappingId", "organizationId") REFERENCES "LtiCourseMapping"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiPlacement" ADD CONSTRAINT "LtiPlacement_classAssignmentId_fkey" FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiRosterEnrollment" ADD CONSTRAINT "LtiRosterEnrollment_registrationId_organizationId_fkey" FOREIGN KEY ("registrationId", "organizationId") REFERENCES "LtiRegistration"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiRosterEnrollment" ADD CONSTRAINT "LtiRosterEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiRosterEnrollment" ADD CONSTRAINT "LtiRosterEnrollment_courseMappingId_organizationId_fkey" FOREIGN KEY ("courseMappingId", "organizationId") REFERENCES "LtiCourseMapping"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiRosterEnrollment" ADD CONSTRAINT "LtiRosterEnrollment_externalIdentityId_organizationId_fkey" FOREIGN KEY ("externalIdentityId", "organizationId") REFERENCES "LtiExternalIdentity"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiRosterEnrollment" ADD CONSTRAINT "LtiRosterEnrollment_membershipId_organizationId_fkey" FOREIGN KEY ("membershipId", "organizationId") REFERENCES "OrgMembership"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiWorkflowRun" ADD CONSTRAINT "LtiWorkflowRun_registrationId_organizationId_fkey" FOREIGN KEY ("registrationId", "organizationId") REFERENCES "LtiRegistration"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiWorkflowRun" ADD CONSTRAINT "LtiWorkflowRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiWorkflowRun" ADD CONSTRAINT "LtiWorkflowRun_courseMappingId_organizationId_fkey" FOREIGN KEY ("courseMappingId", "organizationId") REFERENCES "LtiCourseMapping"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiGradePassback" ADD CONSTRAINT "LtiGradePassback_registrationId_organizationId_fkey" FOREIGN KEY ("registrationId", "organizationId") REFERENCES "LtiRegistration"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiGradePassback" ADD CONSTRAINT "LtiGradePassback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiGradePassback" ADD CONSTRAINT "LtiGradePassback_courseMappingId_organizationId_fkey" FOREIGN KEY ("courseMappingId", "organizationId") REFERENCES "LtiCourseMapping"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiGradePassback" ADD CONSTRAINT "LtiGradePassback_placementId_organizationId_fkey" FOREIGN KEY ("placementId", "organizationId") REFERENCES "LtiPlacement"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiGradePassback" ADD CONSTRAINT "LtiGradePassback_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiGradePassback" ADD CONSTRAINT "LtiGradePassback_externalIdentityId_organizationId_fkey" FOREIGN KEY ("externalIdentityId", "organizationId") REFERENCES "LtiExternalIdentity"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LtiDeepLinkRequest"
  ADD CONSTRAINT "LtiDeepLinkRequest_browser_hash_check" CHECK (LENGTH("browserSecretHash") = 64),
  ADD CONSTRAINT "LtiDeepLinkRequest_nonce_check" CHECK (LENGTH("responseNonce") BETWEEN 32 AND 512),
  ADD CONSTRAINT "LtiDeepLinkRequest_return_url_check" CHECK (LENGTH("returnUrl") BETWEEN 1 AND 2048),
  ADD CONSTRAINT "LtiDeepLinkRequest_expiry_check" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "LtiPlacement"
  ADD CONSTRAINT "LtiPlacement_resource_id_check" CHECK (LENGTH("resourceId") BETWEEN 1 AND 255),
  ADD CONSTRAINT "LtiPlacement_score_maximum_check" CHECK ("scoreMaximum" > 0 AND "scoreMaximum" <= 10000);

ALTER TABLE "LtiRosterEnrollment"
  ADD CONSTRAINT "LtiRosterEnrollment_subject_hash_check" CHECK (LENGTH("subjectHash") = 64),
  ADD CONSTRAINT "LtiRosterEnrollment_subject_key_check" CHECK (LENGTH("subjectHashKeyId") BETWEEN 1 AND 40),
  ADD CONSTRAINT "LtiRosterEnrollment_status_check" CHECK ("lmsStatus" IN ('Active', 'Inactive', 'Deleted')),
  ADD CONSTRAINT "LtiRosterEnrollment_state_check" CHECK ("reconciliationState" IN ('linked', 'unmatched', 'conflict', 'dropped')),
  ADD CONSTRAINT "LtiRosterEnrollment_link_check" CHECK (
    ("externalIdentityId" IS NULL AND "membershipId" IS NULL AND "managedByLti" = false)
    OR ("externalIdentityId" IS NOT NULL AND "membershipId" IS NOT NULL)
  );

ALTER TABLE "LtiWorkflowRun"
  ADD CONSTRAINT "LtiWorkflowRun_kind_check" CHECK ("kind" IN ('roster_sync', 'line_item', 'grade_delivery')),
  ADD CONSTRAINT "LtiWorkflowRun_status_check" CHECK ("status" IN ('running', 'succeeded', 'retry', 'dead_letter')),
  ADD CONSTRAINT "LtiWorkflowRun_attempts_check" CHECK ("attemptCount" BETWEEN 0 AND 10),
  ADD CONSTRAINT "LtiWorkflowRun_key_check" CHECK (LENGTH("idempotencyKey") BETWEEN 1 AND 255);

ALTER TABLE "LtiGradePassback"
  ADD CONSTRAINT "LtiGradePassback_status_check" CHECK ("status" IN ('pending', 'delivering', 'retry', 'delivered', 'dead_letter')),
  ADD CONSTRAINT "LtiGradePassback_attempts_check" CHECK ("attemptCount" BETWEEN 0 AND 10),
  ADD CONSTRAINT "LtiGradePassback_score_check" CHECK (
    "scoreMaximum" > 0 AND "scoreMaximum" <= 10000
    AND "scoreGiven" >= 0 AND "scoreGiven" <= "scoreMaximum"
  );

CREATE OR REPLACE FUNCTION enforce_lti_advantage_tenant_binding()
RETURNS trigger AS $$
DECLARE
  mapping_registration TEXT;
  mapping_class TEXT;
BEGIN
  SELECT "registrationId", "classId"
    INTO mapping_registration, mapping_class
    FROM "LtiCourseMapping"
    WHERE "id" = NEW."courseMappingId" AND "organizationId" = NEW."organizationId";
  IF mapping_registration IS NULL OR mapping_registration <> NEW."registrationId" THEN
    RAISE EXCEPTION 'LTI Advantage registration/course tenant mismatch';
  END IF;

  IF TG_TABLE_NAME = 'LtiPlacement' AND NOT EXISTS (
    SELECT 1 FROM "ClassAssignment"
    WHERE "id" = NEW."classAssignmentId" AND "classId" = mapping_class
  ) THEN
    RAISE EXCEPTION 'LTI placement assignment is outside the mapped course';
  END IF;

  IF TG_TABLE_NAME = 'LtiDeepLinkRequest' AND NOT EXISTS (
    SELECT 1
    FROM "OrgMembership" m
    JOIN "_ClassTeachers" ct ON ct."B" = m."id"
    WHERE m."id" = NEW."teacherMembershipId"
      AND m."organizationId" = NEW."organizationId"
      AND m."role" = 'TEACHER'
      AND m."isActive" = true
      AND ct."A" = mapping_class
  ) THEN
    RAISE EXCEPTION 'LTI Deep Linking actor is not a mapped-course teacher';
  END IF;

  IF TG_TABLE_NAME = 'LtiRosterEnrollment' AND NEW."externalIdentityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "LtiExternalIdentity" i
    JOIN "OrgMembership" m ON m."id" = i."membershipId" AND m."organizationId" = i."organizationId"
    WHERE i."id" = NEW."externalIdentityId"
      AND i."registrationId" = NEW."registrationId"
      AND i."organizationId" = NEW."organizationId"
      AND m."id" = NEW."membershipId"
      AND m."role" = NEW."role"
  ) THEN
    RAISE EXCEPTION 'LTI roster identity does not match tenant membership';
  END IF;

  IF TG_TABLE_NAME = 'LtiGradePassback' AND NOT EXISTS (
    SELECT 1
    FROM "LtiPlacement" p
    JOIN "Submission" s ON s."id" = NEW."submissionId"
    JOIN "Document" d ON d."id" = s."documentId"
    JOIN "LtiExternalIdentity" i ON i."id" = NEW."externalIdentityId"
    WHERE p."id" = NEW."placementId"
      AND p."registrationId" = NEW."registrationId"
      AND p."organizationId" = NEW."organizationId"
      AND p."courseMappingId" = NEW."courseMappingId"
      AND d."classAssignmentId" = p."classAssignmentId"
      AND d."membershipId" = i."membershipId"
      AND i."registrationId" = NEW."registrationId"
      AND s."releasedAt" IS NOT NULL
      AND s."releasedAt" = NEW."releasedAt"
  ) THEN
    RAISE EXCEPTION 'LTI grade event is not a released, tenant-bound placement submission';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LtiDeepLinkRequest_tenant_guard"
  BEFORE INSERT OR UPDATE ON "LtiDeepLinkRequest"
  FOR EACH ROW EXECUTE FUNCTION enforce_lti_advantage_tenant_binding();
CREATE TRIGGER "LtiPlacement_tenant_guard"
  BEFORE INSERT OR UPDATE ON "LtiPlacement"
  FOR EACH ROW EXECUTE FUNCTION enforce_lti_advantage_tenant_binding();
CREATE TRIGGER "LtiRosterEnrollment_tenant_guard"
  BEFORE INSERT OR UPDATE ON "LtiRosterEnrollment"
  FOR EACH ROW EXECUTE FUNCTION enforce_lti_advantage_tenant_binding();
CREATE TRIGGER "LtiWorkflowRun_tenant_guard"
  BEFORE INSERT OR UPDATE ON "LtiWorkflowRun"
  FOR EACH ROW EXECUTE FUNCTION enforce_lti_advantage_tenant_binding();
CREATE TRIGGER "LtiGradePassback_tenant_guard"
  BEFORE INSERT OR UPDATE ON "LtiGradePassback"
  FOR EACH ROW EXECUTE FUNCTION enforce_lti_advantage_tenant_binding();
