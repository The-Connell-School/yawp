\set ON_ERROR_STOP on

-- Run immediately after migrate deploy. These invariants prove that the
-- migration preserved legacy completion semantics and installed the durable
-- spend/tenant controls expected by the application.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAssignment"
    WHERE "lessonSlugs" IS NULL OR CARDINALITY("lessonSlugs") = 0
  ) THEN
    RAISE EXCEPTION 'postcheck: invalid lessonSlugs remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ReporterGrowthPlan"
    WHERE "status" = 'active'
    GROUP BY "membershipId", "studentMembershipId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'postcheck: duplicate active growth plans remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        attempt."classAssignmentId",
        attempt."membershipId",
        assignment."problemCount",
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE attempt."countsTowardProgress") AS credited_count,
        MIN(attempt."position") FILTER (
          WHERE attempt."countsTowardProgress"
        ) AS min_credited_position,
        MAX(attempt."position") FILTER (
          WHERE attempt."countsTowardProgress"
        ) AS max_credited_position
      FROM "WritingPracticeAttempt" attempt
      JOIN "WritingPracticeClassAssignment" deployment
        ON deployment."id" = attempt."classAssignmentId"
      JOIN "WritingPracticeAssignment" assignment
        ON assignment."id" = deployment."assignmentId"
      GROUP BY
        attempt."classAssignmentId",
        attempt."membershipId",
        assignment."problemCount"
    ) progress
    WHERE progress.credited_count <>
        LEAST(progress.total_count, progress."problemCount")
      OR (
        progress.credited_count > 0
        AND (
          progress.min_credited_position <> 1
          OR progress.max_credited_position <> progress.credited_count
        )
      )
  ) THEN
    RAISE EXCEPTION
      'postcheck: writing-practice completion changed during position backfill';
  END IF;

  IF to_regclass('"AiRequestReservation"') IS NULL THEN
    RAISE EXCEPTION 'postcheck: durable AI reservation table is missing';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'WritingPracticeClassAssignment_tenant_check',
        'WritingPracticeAttempt_tenant_check',
        'WritingPracticePromptSet_tenant_check',
        'ClassAssignmentInsight_tenant_check'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'postcheck: one or more tenant-integrity triggers are missing';
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM "WritingPracticeAttempt"
    WHERE "countsTowardProgress") AS credited_attempt_rows,
  (SELECT COUNT(*) FROM "WritingPracticeAttempt"
    WHERE NOT "countsTowardProgress") AS quarantined_attempt_rows,
  (SELECT COUNT(*) FROM "AiRequestReservation") AS ai_reservation_rows,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname LIKE '%tenant_check') AS tenant_trigger_count;
