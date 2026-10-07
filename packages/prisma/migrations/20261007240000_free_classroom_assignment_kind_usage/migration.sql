SET lock_timeout = '5s';

CREATE TABLE "FreeClassroomAssignmentKindUsage" (
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "lifetimeCreatedCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FreeClassroomAssignmentKindUsage_pkey" PRIMARY KEY ("organizationId", "kind"),
  CONSTRAINT "FreeClassroomAssignmentKindUsage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill from assignments currently deployed in each free org (floor for existing data).
INSERT INTO "FreeClassroomAssignmentKindUsage" ("organizationId", "kind", "lifetimeCreatedCount")
SELECT
  s."organizationId",
  at."kind",
  COUNT(*)::integer
FROM "Assignment" a
JOIN "AssignmentType" at ON at."id" = a."assignmentTypeId"
JOIN "ClassAssignment" ca ON ca."assignmentId" = a."id"
JOIN "Class" c ON c."id" = ca."classId"
JOIN "School" s ON s."id" = c."schoolId"
JOIN "Organization" o ON o."id" = s."organizationId"
WHERE o."plan" = 'FREE_CLASSROOM'::"OrganizationPlan"
  AND at."kind" IN ('class_starter', 'prewriting', 'thesis_statement')
GROUP BY s."organizationId", at."kind"
ON CONFLICT ("organizationId", "kind") DO UPDATE
SET "lifetimeCreatedCount" = GREATEST(
  "FreeClassroomAssignmentKindUsage"."lifetimeCreatedCount",
  EXCLUDED."lifetimeCreatedCount"
);
