SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- Class-insight generator identity is an audit reference. Preserve the insight
-- if the membership is deleted, but reject orphaned ids during deployment.
ALTER TABLE "ClassAssignmentInsight"
  ADD CONSTRAINT "ClassAssignmentInsight_generatedByMembershipId_fkey"
  FOREIGN KEY ("generatedByMembershipId")
  REFERENCES "OrgMembership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ClassAssignmentInsight_generatedByMembershipId_idx"
  ON "ClassAssignmentInsight"("generatedByMembershipId");

-- Moving a populated school to another organization would silently move every
-- class and feature row without touching the guarded child foreign keys.
CREATE OR REPLACE FUNCTION prevent_populated_school_tenant_reassignment()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    AND EXISTS (
      SELECT 1 FROM "Class" WHERE "schoolId" = OLD."id"
    )
  THEN
    RAISE EXCEPTION
      'cannot reassign a populated school to another organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "School_parent_tenant_check"
BEFORE UPDATE OF "organizationId"
ON "School"
FOR EACH ROW EXECUTE FUNCTION prevent_populated_school_tenant_reassignment();

-- Moving a class with deployed work would bypass tenant checks because the
-- deployment rows themselves are unchanged.
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
      EXISTS (
        SELECT 1 FROM "ClassAssignment" WHERE "classId" = OLD."id"
      )
      OR EXISTS (
        SELECT 1
        FROM "WritingPracticeClassAssignment"
        WHERE "classId" = OLD."id"
      )
    )
  THEN
    RAISE EXCEPTION
      'cannot reassign a class with deployed work to another organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Class_parent_tenant_check"
BEFORE UPDATE OF "schoolId"
ON "Class"
FOR EACH ROW EXECUTE FUNCTION prevent_deployed_class_tenant_reassignment();

-- Feature rows are tenant-anchored audit data. Reassigning their membership
-- parent would either rewrite history via cascade or leave child rows
-- cross-tenant.
CREATE OR REPLACE FUNCTION prevent_feature_membership_tenant_reassignment()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS NOT DISTINCT FROM OLD."organizationId" THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ReporterConversation"
    WHERE "membershipId" = OLD."id"
  ) OR EXISTS (
    SELECT 1 FROM "ReporterGrowthPlan"
    WHERE "membershipId" = OLD."id"
       OR "studentMembershipId" = OLD."id"
  ) OR EXISTS (
    SELECT 1 FROM "AiRequestReservation"
    WHERE "membershipId" = OLD."id"
  ) OR EXISTS (
    SELECT 1 FROM "WritingPracticeAssignment"
    WHERE "createdByMembershipId" = OLD."id"
  ) OR EXISTS (
    SELECT 1 FROM "WritingPracticeAttempt"
    WHERE "membershipId" = OLD."id"
  ) OR EXISTS (
    SELECT 1 FROM "WritingPracticePromptSet"
    WHERE "membershipId" = OLD."id"
  ) OR EXISTS (
    SELECT 1 FROM "ClassAssignmentInsight"
    WHERE "generatedByMembershipId" = OLD."id"
  ) THEN
    RAISE EXCEPTION
      'cannot reassign a membership with tenant-anchored feature data';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrgMembership_parent_tenant_check"
BEFORE UPDATE OF "organizationId"
ON "OrgMembership"
FOR EACH ROW EXECUTE FUNCTION prevent_feature_membership_tenant_reassignment();
