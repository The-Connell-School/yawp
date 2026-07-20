SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE "WritingPracticeAssignment"
  ADD COLUMN "organizationId" TEXT;

-- Every assignment must have one durable tenant independent of whether its
-- creator membership is later deleted. Stop before mutation when the tenant
-- cannot be derived unambiguously.
DO $$
BEGIN
  IF EXISTS (
    SELECT assignment."id"
    FROM "WritingPracticeAssignment" assignment
    LEFT JOIN "OrgMembership" creator
      ON creator."id" = assignment."createdByMembershipId"
    LEFT JOIN "WritingPracticeClassAssignment" deployment
      ON deployment."assignmentId" = assignment."id"
    LEFT JOIN "Class" class_row ON class_row."id" = deployment."classId"
    LEFT JOIN "School" school ON school."id" = class_row."schoolId"
    GROUP BY assignment."id", creator."organizationId"
    HAVING creator."organizationId" IS NULL
      AND COUNT(DISTINCT school."organizationId") = 0
  ) THEN
    RAISE EXCEPTION
      'ownerless writing-practice assignment has no class tenant to backfill';
  END IF;

  IF EXISTS (
    SELECT assignment."id"
    FROM "WritingPracticeAssignment" assignment
    JOIN "WritingPracticeClassAssignment" deployment
      ON deployment."assignmentId" = assignment."id"
    JOIN "Class" class_row ON class_row."id" = deployment."classId"
    JOIN "School" school ON school."id" = class_row."schoolId"
    GROUP BY assignment."id"
    HAVING COUNT(DISTINCT school."organizationId") > 1
  ) THEN
    RAISE EXCEPTION
      'writing-practice assignment is deployed across organizations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAssignment" assignment
    JOIN "OrgMembership" creator
      ON creator."id" = assignment."createdByMembershipId"
    JOIN "WritingPracticeClassAssignment" deployment
      ON deployment."assignmentId" = assignment."id"
    JOIN "Class" class_row ON class_row."id" = deployment."classId"
    JOIN "School" school ON school."id" = class_row."schoolId"
    WHERE creator."organizationId" <> school."organizationId"
  ) THEN
    RAISE EXCEPTION
      'writing-practice assignment creator and deployment tenants disagree';
  END IF;
END $$;

UPDATE "WritingPracticeAssignment" assignment
SET "organizationId" = creator."organizationId"
FROM "OrgMembership" creator
WHERE creator."id" = assignment."createdByMembershipId";

UPDATE "WritingPracticeAssignment" assignment
SET "organizationId" = tenant."organizationId"
FROM (
  SELECT
    deployment."assignmentId",
    MIN(school."organizationId") AS "organizationId"
  FROM "WritingPracticeClassAssignment" deployment
  JOIN "Class" class_row ON class_row."id" = deployment."classId"
  JOIN "School" school ON school."id" = class_row."schoolId"
  GROUP BY deployment."assignmentId"
  HAVING COUNT(DISTINCT school."organizationId") = 1
) tenant
WHERE assignment."id" = tenant."assignmentId"
  AND assignment."organizationId" IS NULL;

ALTER TABLE "WritingPracticeAssignment"
  ALTER COLUMN "organizationId" SET NOT NULL,
  ADD CONSTRAINT "WritingPracticeAssignment_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "WritingPracticeAssignment_organizationId_idx"
  ON "WritingPracticeAssignment"("organizationId");

CREATE OR REPLACE FUNCTION enforce_writing_assignment_creator_tenant()
RETURNS trigger AS $$
DECLARE
  creator_org TEXT;
BEGIN
  IF NEW."createdByMembershipId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "organizationId" INTO creator_org
  FROM "OrgMembership"
  WHERE "id" = NEW."createdByMembershipId";

  IF creator_org IS DISTINCT FROM NEW."organizationId" THEN
    RAISE EXCEPTION
      'cross-organization writing-practice assignment creator';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WritingPracticeAssignment_creator_tenant_check"
BEFORE INSERT OR UPDATE OF "organizationId", "createdByMembershipId"
ON "WritingPracticeAssignment"
FOR EACH ROW EXECUTE FUNCTION enforce_writing_assignment_creator_tenant();

-- Replace the creator-derived deployment check with the assignment's durable
-- tenant anchor. The existing trigger calls this function by name.
CREATE OR REPLACE FUNCTION enforce_writing_deployment_tenant()
RETURNS trigger AS $$
DECLARE
  assignment_org TEXT;
  class_org TEXT;
BEGIN
  SELECT "organizationId" INTO assignment_org
  FROM "WritingPracticeAssignment"
  WHERE "id" = NEW."assignmentId";

  SELECT school."organizationId"
    INTO class_org
  FROM "Class" class_row
  JOIN "School" school ON school."id" = class_row."schoolId"
  WHERE class_row."id" = NEW."classId";

  IF assignment_org IS DISTINCT FROM class_org THEN
    RAISE EXCEPTION 'cross-organization writing-practice deployment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
