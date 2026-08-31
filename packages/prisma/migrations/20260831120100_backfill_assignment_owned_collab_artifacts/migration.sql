-- Phase 2: validate and backfill without holding a schema lock.
SET lock_timeout = '5s';
SET statement_timeout = '15min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "DocumentGroup"
    WHERE "kind" <> 'assignment' OR "classAssignmentId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate student-started or assignmentless document groups to assignment-owned artifacts';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AssignmentModuleSession"
    WHERE "membershipId" IS NOT NULL
    GROUP BY "documentId", "membershipId", "assignmentModuleId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce private tutor sessions while duplicate member sessions exist';
  END IF;
END $$;

UPDATE "AssignmentModuleSession" AS session
SET "membershipId" = document."membershipId"
FROM "Document" AS document
JOIN "DocumentGroup" AS group_row
  ON group_row."documentId" = document."id"
WHERE session."documentId" = document."id"
  AND session."membershipId" IS NULL
  AND document."membershipId" IS NOT NULL;

UPDATE "Document" AS document
SET "artifactKind" = 'assignment-group',
    "membershipId" = NULL,
    "assignmentId" = deployment."assignmentId",
    "classAssignmentId" = group_row."classAssignmentId",
    "assignmentTypeId" = assignment."assignmentTypeId"
FROM "DocumentGroup" AS group_row
JOIN "ClassAssignment" AS deployment
  ON deployment."id" = group_row."classAssignmentId"
JOIN "Assignment" AS assignment
  ON assignment."id" = deployment."assignmentId"
WHERE group_row."documentId" = document."id";

UPDATE "DocumentGroup"
SET "openedAt" = COALESCE("openedAt", "createdAt")
WHERE "documentId" IS NOT NULL;

UPDATE "DocumentGroup"
SET "openedAt" = NULL
WHERE "documentId" IS NULL;
