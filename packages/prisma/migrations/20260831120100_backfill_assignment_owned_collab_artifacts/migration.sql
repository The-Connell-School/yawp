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

  -- Validate the key as it will look *after* the owner backfill below. Two
  -- legacy NULL sessions may otherwise collapse onto the same student key and
  -- make the later concurrent unique index fail after this migration commits.
  IF EXISTS (
    SELECT 1
    FROM "AssignmentModuleSession" AS session
    LEFT JOIN "Document" AS document ON document."id" = session."documentId"
    LEFT JOIN "DocumentGroup" AS group_row
      ON group_row."documentId" = document."id"
    WHERE COALESCE(
      session."membershipId",
      CASE WHEN group_row."id" IS NOT NULL THEN document."membershipId" END
    ) IS NOT NULL
    GROUP BY
      session."documentId",
      COALESCE(
        session."membershipId",
        CASE WHEN group_row."id" IS NOT NULL THEN document."membershipId" END
      ),
      session."assignmentModuleId"
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DocumentGroup" AS group_row
    JOIN "ClassAssignment" AS deployment
      ON deployment."id" = group_row."classAssignmentId"
    JOIN "Assignment" AS assignment
      ON assignment."id" = deployment."assignmentId"
    JOIN "Document" AS document
      ON document."id" = group_row."documentId"
    WHERE document."artifactKind" <> 'assignment-group'
       OR document."membershipId" IS NOT NULL
       OR document."classAssignmentId" <> group_row."classAssignmentId"
       OR document."assignmentId" <> deployment."assignmentId"
       OR document."assignmentTypeId" <> assignment."assignmentTypeId"
  ) THEN
    RAISE EXCEPTION 'Assignment-owned artifact backfill left an invalid ownership graph';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AssignmentModuleSession"
    WHERE "membershipId" IS NOT NULL
    GROUP BY "documentId", "membershipId", "assignmentModuleId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tutor-session backfill produced duplicate private session keys';
  END IF;
END $$;

-- These compatibility triggers close the live-write window while the next
-- migration builds its concurrent index. They are replaced by the complete
-- graph contract in phase 4.
CREATE OR REPLACE FUNCTION validate_assignment_group_compat_write()
RETURNS TRIGGER AS $$
DECLARE valid_graph integer;
BEGIN
  IF NEW."kind" IS DISTINCT FROM 'assignment'
     OR NEW."classAssignmentId" IS NULL THEN
    RAISE EXCEPTION 'document groups must belong to an assignment deployment';
  END IF;
  IF (NEW."openedAt" IS NULL) <> (NEW."documentId" IS NULL) THEN
    RAISE EXCEPTION 'an opened document group must own an artifact';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD."documentId" IS NOT NULL
     AND NEW."documentId" IS DISTINCT FROM OLD."documentId" THEN
    RAISE EXCEPTION 'finalized assignment group cannot detach its artifact';
  END IF;
  IF NEW."documentId" IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO valid_graph
  FROM "Document" AS document
  JOIN "ClassAssignment" AS deployment
    ON deployment."id" = NEW."classAssignmentId"
  JOIN "Assignment" AS assignment
    ON assignment."id" = deployment."assignmentId"
  WHERE document."id" = NEW."documentId"
    AND document."artifactKind" = 'assignment-group'
    AND document."membershipId" IS NULL
    AND document."classAssignmentId" = NEW."classAssignmentId"
    AND document."assignmentId" = deployment."assignmentId"
    AND document."assignmentTypeId" = assignment."assignmentTypeId";

  IF valid_graph <> 1 THEN
    RAISE EXCEPTION 'assignment group must reference an assignment-owned artifact';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "DocumentGroup_compat_graph_check"
AFTER INSERT OR UPDATE OF "documentId", "classAssignmentId", "kind", "openedAt"
ON "DocumentGroup"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_assignment_group_compat_write();

CREATE OR REPLACE FUNCTION validate_assignment_document_compat_write()
RETURNS TRIGGER AS $$
DECLARE valid_graph integer;
BEGIN
  IF NEW."artifactKind" = 'student' AND NEW."membershipId" IS NULL THEN
    RAISE EXCEPTION 'student artifacts must have a student owner';
  END IF;
  IF NEW."artifactKind" <> 'assignment-group'
     AND NOT EXISTS (SELECT 1 FROM "DocumentGroup" WHERE "documentId" = NEW."id") THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO valid_graph
  FROM "DocumentGroup" AS group_row
  JOIN "ClassAssignment" AS deployment
    ON deployment."id" = group_row."classAssignmentId"
  JOIN "Assignment" AS assignment
    ON assignment."id" = deployment."assignmentId"
  WHERE group_row."documentId" = NEW."id"
    AND NEW."artifactKind" = 'assignment-group'
    AND NEW."membershipId" IS NULL
    AND NEW."classAssignmentId" = group_row."classAssignmentId"
    AND NEW."assignmentId" = deployment."assignmentId"
    AND NEW."assignmentTypeId" = assignment."assignmentTypeId";

  IF valid_graph <> 1 THEN
    RAISE EXCEPTION 'owned assignment artifact cannot change its ownership graph';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Document_compat_graph_check"
AFTER INSERT OR UPDATE OF "artifactKind", "membershipId", "assignmentId", "classAssignmentId", "assignmentTypeId"
ON "Document"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_assignment_document_compat_write();

CREATE OR REPLACE FUNCTION protect_assignment_type_compat_write()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."assignmentTypeId" IS DISTINCT FROM OLD."assignmentTypeId"
     AND (
       OLD."collaborationEnabled" = true
       OR EXISTS (
         SELECT 1
         FROM "ClassAssignment" AS deployment
         JOIN "DocumentGroup" AS group_row
           ON group_row."classAssignmentId" = deployment."id"
         WHERE deployment."assignmentId" = OLD."id"
           AND group_row."documentId" IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION 'collaborative assignment cannot change artifact type';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Assignment_compat_type_check"
BEFORE UPDATE OF "assignmentTypeId" ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION protect_assignment_type_compat_write();

CREATE OR REPLACE FUNCTION protect_deployment_owner_compat_write()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."assignmentId" IS DISTINCT FROM OLD."assignmentId"
      OR NEW."classId" IS DISTINCT FROM OLD."classId")
     AND EXISTS (
       SELECT 1 FROM "DocumentGroup"
       WHERE "classAssignmentId" = OLD."id" AND "documentId" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'assignment deployment cannot change shared-artifact owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClassAssignment_compat_owner_check"
BEFORE UPDATE OF "assignmentId", "classId" ON "ClassAssignment"
FOR EACH ROW EXECUTE FUNCTION protect_deployment_owner_compat_write();

-- Reconcile once more *after* every compatibility guard is active. Any legacy
-- write that committed between the first backfill and trigger installation is
-- now either transformed here or rejected by the final assertions; later writes
-- are protected until phase 4 atomically replaces these guards.
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DocumentGroup" AS group_row
    LEFT JOIN "ClassAssignment" AS deployment
      ON deployment."id" = group_row."classAssignmentId"
    LEFT JOIN "Assignment" AS assignment
      ON assignment."id" = deployment."assignmentId"
    LEFT JOIN "Document" AS document
      ON document."id" = group_row."documentId"
    WHERE group_row."kind" <> 'assignment'
       OR group_row."classAssignmentId" IS NULL
       OR ((group_row."openedAt" IS NULL) <> (group_row."documentId" IS NULL))
       OR (
         group_row."documentId" IS NOT NULL
         AND (
           document."id" IS NULL
           OR document."artifactKind" <> 'assignment-group'
           OR document."membershipId" IS NOT NULL
           OR document."classAssignmentId" <> group_row."classAssignmentId"
           OR document."assignmentId" <> deployment."assignmentId"
           OR document."assignmentTypeId" <> assignment."assignmentTypeId"
         )
       )
  ) THEN
    RAISE EXCEPTION 'Protected assignment-owned artifact reconciliation failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Document" AS document
    WHERE (document."artifactKind" = 'student' AND document."membershipId" IS NULL)
       OR (
         document."artifactKind" = 'assignment-group'
         AND NOT EXISTS (
           SELECT 1 FROM "DocumentGroup"
           WHERE "documentId" = document."id"
         )
       )
  ) THEN
    RAISE EXCEPTION 'Protected reconciliation left an invalid or orphaned artifact';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AssignmentModuleSession"
    WHERE "membershipId" IS NOT NULL
    GROUP BY "documentId", "membershipId", "assignmentModuleId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Protected tutor-session reconciliation produced duplicate keys';
  END IF;
END $$;
