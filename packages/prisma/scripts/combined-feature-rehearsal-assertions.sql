\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (
    SELECT COUNT(*) FROM "WritingPracticeAttempt"
    WHERE "classAssignmentId" = 'rehearsal-writing-deployment'
      AND "membershipId" = 'rehearsal-student-a'
      AND "countsTowardProgress"
  ) <> 3 THEN
    RAISE EXCEPTION 'rehearsal: expected exactly three credited attempts';
  END IF;

  IF (
    SELECT COUNT(*) FROM "WritingPracticeAttempt"
    WHERE "classAssignmentId" = 'rehearsal-writing-deployment'
      AND "membershipId" = 'rehearsal-student-a'
      AND NOT "countsTowardProgress"
  ) <> 1 THEN
    RAISE EXCEPTION 'rehearsal: expected exactly one quarantined attempt';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('rehearsal-attempt-1', 1, true),
        ('rehearsal-attempt-2', 2, true),
        ('rehearsal-attempt-3', 3, true),
        ('rehearsal-attempt-4', 7, false)
    ) expected(id, position, credited)
    LEFT JOIN "WritingPracticeAttempt" actual ON actual."id" = expected.id
    WHERE actual."id" IS NULL
      OR actual."position" <> expected.position
      OR actual."countsTowardProgress" <> expected.credited
  ) THEN
    RAISE EXCEPTION
      'rehearsal: legacy attempt positions or quarantine semantics changed';
  END IF;

  IF (
    SELECT "organizationId"
    FROM "WritingPracticeAssignment"
    WHERE "id" = 'rehearsal-writing-assignment'
  ) <> 'rehearsal-org-a' THEN
    RAISE EXCEPTION 'rehearsal: writing assignment tenant backfill failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ReporterGrowthPlan"
    WHERE "id" = 'rehearsal-growth-plan' AND "status" = 'active'
  ) THEN
    RAISE EXCEPTION 'rehearsal: growth plan was not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ClassAssignmentInsight"
    WHERE "id" = 'rehearsal-class-insight'
      AND "submissionCount" = 1
  ) THEN
    RAISE EXCEPTION 'rehearsal: class insight was not preserved';
  END IF;
END $$;

SELECT
  attempt."id",
  attempt."promptId",
  attempt."position",
  attempt."countsTowardProgress"
FROM "WritingPracticeAttempt" attempt
WHERE attempt."classAssignmentId" = 'rehearsal-writing-deployment'
ORDER BY attempt."createdAt", attempt."id";
