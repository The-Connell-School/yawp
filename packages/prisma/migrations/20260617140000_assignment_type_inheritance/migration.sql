-- Assignment type inheritance: replace FeatureAccessTarget overrides with
-- SchoolAssignmentType / TeacherAssignmentType join tables.

ALTER TABLE "School"
ADD COLUMN "assignmentTypesCustomized" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrgMembership"
ADD COLUMN "assignmentTypesCustomized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SchoolAssignmentType" (
  "schoolId" TEXT NOT NULL,
  "assignmentTypeId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolAssignmentType_pkey" PRIMARY KEY ("schoolId", "assignmentTypeId")
);

CREATE TABLE "TeacherAssignmentType" (
  "membershipId" TEXT NOT NULL,
  "assignmentTypeId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherAssignmentType_pkey" PRIMARY KEY ("membershipId", "assignmentTypeId")
);

CREATE INDEX "SchoolAssignmentType_assignmentTypeId_idx"
ON "SchoolAssignmentType"("assignmentTypeId");

CREATE INDEX "TeacherAssignmentType_assignmentTypeId_idx"
ON "TeacherAssignmentType"("assignmentTypeId");

ALTER TABLE "SchoolAssignmentType"
ADD CONSTRAINT "SchoolAssignmentType_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolAssignmentType"
ADD CONSTRAINT "SchoolAssignmentType_assignmentTypeId_fkey"
FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherAssignmentType"
ADD CONSTRAINT "TeacherAssignmentType_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherAssignmentType"
ADD CONSTRAINT "TeacherAssignmentType_assignmentTypeId_fkey"
FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mark schools that had assignment-type overrides as customized.
UPDATE "School" AS s
SET "assignmentTypesCustomized" = true
WHERE EXISTS (
  SELECT 1
  FROM "FeatureAccessTarget" AS fat
  WHERE fat."targetKind" = 'school'
    AND fat."targetId" = s."id"
    AND fat."featureKey" LIKE 'assignment_type:%'
    AND (fat."expiresAt" IS NULL OR fat."expiresAt" > NOW())
);

-- Mark teachers that had assignment-type overrides as customized.
UPDATE "OrgMembership" AS om
SET "assignmentTypesCustomized" = true
WHERE EXISTS (
  SELECT 1
  FROM "FeatureAccessTarget" AS fat
  WHERE fat."targetKind" = 'teacher'
    AND fat."targetId" = om."id"
    AND fat."featureKey" LIKE 'assignment_type:%'
    AND (fat."expiresAt" IS NULL OR fat."expiresAt" > NOW())
);

-- Backfill school effective sets from org defaults + school overrides.
INSERT INTO "SchoolAssignmentType" ("schoolId", "assignmentTypeId")
SELECT DISTINCT school_effective."schoolId", school_effective."assignmentTypeId"
FROM (
  SELECT s."id" AS "schoolId", oa."assignmentTypeId"
  FROM "School" AS s
  INNER JOIN "OrganizationAssignmentType" AS oa
    ON oa."organizationId" = s."organizationId"
  WHERE s."assignmentTypesCustomized" = true
    AND NOT EXISTS (
      SELECT 1
      FROM "FeatureAccessTarget" AS fat
      WHERE fat."targetKind" = 'school'
        AND fat."targetId" = s."id"
        AND fat."enabled" = false
        AND fat."featureKey" = 'assignment_type:' || oa."assignmentTypeId"
        AND (fat."expiresAt" IS NULL OR fat."expiresAt" > NOW())
    )

  UNION

  SELECT fat."targetId" AS "schoolId",
         REPLACE(fat."featureKey", 'assignment_type:', '') AS "assignmentTypeId"
  FROM "FeatureAccessTarget" AS fat
  INNER JOIN "School" AS s ON s."id" = fat."targetId"
  WHERE fat."targetKind" = 'school'
    AND fat."enabled" = true
    AND fat."featureKey" LIKE 'assignment_type:%'
    AND s."assignmentTypesCustomized" = true
    AND (fat."expiresAt" IS NULL OR fat."expiresAt" > NOW())
) AS school_effective;

-- Backfill teacher effective sets from org defaults + teacher overrides.
INSERT INTO "TeacherAssignmentType" ("membershipId", "assignmentTypeId")
SELECT DISTINCT teacher_effective."membershipId", teacher_effective."assignmentTypeId"
FROM (
  SELECT om."id" AS "membershipId", oa."assignmentTypeId"
  FROM "OrgMembership" AS om
  INNER JOIN "OrganizationAssignmentType" AS oa
    ON oa."organizationId" = om."organizationId"
  WHERE om."assignmentTypesCustomized" = true
    AND NOT EXISTS (
      SELECT 1
      FROM "FeatureAccessTarget" AS fat
      WHERE fat."targetKind" = 'teacher'
        AND fat."targetId" = om."id"
        AND fat."enabled" = false
        AND fat."featureKey" = 'assignment_type:' || oa."assignmentTypeId"
        AND (fat."expiresAt" IS NULL OR fat."expiresAt" > NOW())
    )

  UNION

  SELECT fat."targetId" AS "membershipId",
         REPLACE(fat."featureKey", 'assignment_type:', '') AS "assignmentTypeId"
  FROM "FeatureAccessTarget" AS fat
  INNER JOIN "OrgMembership" AS om ON om."id" = fat."targetId"
  WHERE fat."targetKind" = 'teacher'
    AND fat."enabled" = true
    AND fat."featureKey" LIKE 'assignment_type:%'
    AND om."assignmentTypesCustomized" = true
    AND (fat."expiresAt" IS NULL OR fat."expiresAt" > NOW())
) AS teacher_effective;

DROP TABLE IF EXISTS "FeatureAccessTarget";
