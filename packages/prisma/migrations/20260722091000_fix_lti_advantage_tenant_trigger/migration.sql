SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- PL/pgSQL records expose only the columns of the table that fired the
-- trigger. Keep table-specific NEW fields inside nested branches so Postgres
-- never resolves (for example) classAssignmentId on a Deep Link row.
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

  IF TG_TABLE_NAME = 'LtiPlacement' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "ClassAssignment"
      WHERE "id" = NEW."classAssignmentId" AND "classId" = mapping_class
    ) THEN
      RAISE EXCEPTION 'LTI placement assignment is outside the mapped course';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'LtiDeepLinkRequest' THEN
    IF NOT EXISTS (
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
  END IF;

  IF TG_TABLE_NAME = 'LtiRosterEnrollment' THEN
    IF NEW."externalIdentityId" IS NOT NULL AND NOT EXISTS (
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
  END IF;

  IF TG_TABLE_NAME = 'LtiGradePassback' THEN
    IF NOT EXISTS (
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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
