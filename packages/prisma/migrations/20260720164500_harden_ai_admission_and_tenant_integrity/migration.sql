SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAssignment"
    WHERE "lessonSlugs" IS NULL OR CARDINALITY("lessonSlugs") = 0
  ) THEN
    RAISE EXCEPTION
      'WritingPracticeAssignment.lessonSlugs contains null or empty values';
  END IF;
END $$;

ALTER TABLE "WritingPracticeAssignment"
  ALTER COLUMN "lessonSlugs" SET NOT NULL;

CREATE TABLE "AiRequestReservation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "feature" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  CONSTRAINT "AiRequestReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRequestReservation_membershipId_feature_createdAt_idx"
  ON "AiRequestReservation"("membershipId", "feature", "createdAt" DESC);
CREATE INDEX "AiRequestReservation_organizationId_feature_createdAt_idx"
  ON "AiRequestReservation"("organizationId", "feature", "createdAt" DESC);

ALTER TABLE "AiRequestReservation"
  ADD CONSTRAINT "AiRequestReservation_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AiRequestReservation_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A deployment may only connect a writing assignment to a class in the
-- creator's organization. This remains enforced below the application layer.
CREATE OR REPLACE FUNCTION enforce_writing_deployment_tenant()
RETURNS trigger AS $$
DECLARE
  creator_org TEXT;
  class_org TEXT;
BEGIN
  SELECT membership."organizationId"
    INTO creator_org
  FROM "WritingPracticeAssignment" assignment
  LEFT JOIN "OrgMembership" membership
    ON membership."id" = assignment."createdByMembershipId"
  WHERE assignment."id" = NEW."assignmentId";

  SELECT school."organizationId"
    INTO class_org
  FROM "Class" class_row
  JOIN "School" school ON school."id" = class_row."schoolId"
  WHERE class_row."id" = NEW."classId";

  IF creator_org IS NOT NULL AND creator_org IS DISTINCT FROM class_org THEN
    RAISE EXCEPTION 'cross-organization writing-practice deployment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WritingPracticeClassAssignment_tenant_check"
BEFORE INSERT OR UPDATE OF "assignmentId", "classId"
ON "WritingPracticeClassAssignment"
FOR EACH ROW EXECUTE FUNCTION enforce_writing_deployment_tenant();

CREATE OR REPLACE FUNCTION enforce_writing_student_tenant()
RETURNS trigger AS $$
DECLARE
  member_org TEXT;
  class_org TEXT;
BEGIN
  SELECT "organizationId" INTO member_org
  FROM "OrgMembership" WHERE "id" = NEW."membershipId";

  SELECT school."organizationId"
    INTO class_org
  FROM "WritingPracticeClassAssignment" deployment
  JOIN "Class" class_row ON class_row."id" = deployment."classId"
  JOIN "School" school ON school."id" = class_row."schoolId"
  WHERE deployment."id" = NEW."classAssignmentId";

  IF member_org IS DISTINCT FROM class_org THEN
    RAISE EXCEPTION 'cross-organization writing-practice student record';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WritingPracticeAttempt_tenant_check"
BEFORE INSERT OR UPDATE OF "classAssignmentId", "membershipId"
ON "WritingPracticeAttempt"
FOR EACH ROW EXECUTE FUNCTION enforce_writing_student_tenant();

CREATE TRIGGER "WritingPracticePromptSet_tenant_check"
BEFORE INSERT OR UPDATE OF "classAssignmentId", "membershipId"
ON "WritingPracticePromptSet"
FOR EACH ROW EXECUTE FUNCTION enforce_writing_student_tenant();

CREATE OR REPLACE FUNCTION enforce_class_insight_tenant()
RETURNS trigger AS $$
DECLARE
  member_org TEXT;
  class_org TEXT;
BEGIN
  IF NEW."generatedByMembershipId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "organizationId" INTO member_org
  FROM "OrgMembership" WHERE "id" = NEW."generatedByMembershipId";

  SELECT school."organizationId"
    INTO class_org
  FROM "ClassAssignment" deployment
  JOIN "Class" class_row ON class_row."id" = deployment."classId"
  JOIN "School" school ON school."id" = class_row."schoolId"
  WHERE deployment."id" = NEW."classAssignmentId";

  IF member_org IS DISTINCT FROM class_org THEN
    RAISE EXCEPTION 'cross-organization class insight';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClassAssignmentInsight_tenant_check"
BEFORE INSERT OR UPDATE OF "classAssignmentId", "generatedByMembershipId"
ON "ClassAssignmentInsight"
FOR EACH ROW EXECUTE FUNCTION enforce_class_insight_tenant();
