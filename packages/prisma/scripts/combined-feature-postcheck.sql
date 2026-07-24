\set ON_ERROR_STOP on

-- Run immediately after migrate deploy. These invariants prove that the
-- migration preserved legacy completion semantics and installed the durable
-- spend/tenant controls expected by the application.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAssignment"
    WHERE "organizationId" IS NULL
      OR "problemCount" <= 0
      OR "lessonSlugs" IS NULL
      OR CARDINALITY("lessonSlugs") = 0
  ) THEN
    RAISE EXCEPTION 'postcheck: invalid writing assignment data remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAssignment" assignment
    LEFT JOIN "OrgMembership" creator
      ON creator."id" = assignment."createdByMembershipId"
    WHERE creator."id" IS NOT NULL
      AND creator."organizationId" <> assignment."organizationId"
  ) THEN
    RAISE EXCEPTION 'postcheck: writing assignment creator tenant mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeClassAssignment" deployment
    JOIN "WritingPracticeAssignment" assignment
      ON assignment."id" = deployment."assignmentId"
    JOIN "Class" class_row ON class_row."id" = deployment."classId"
    JOIN "School" school ON school."id" = class_row."schoolId"
    WHERE assignment."organizationId" <> school."organizationId"
  ) THEN
    RAISE EXCEPTION 'postcheck: writing deployment tenant mismatch';
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
        'WritingPracticeAssignment_creator_tenant_check',
        'WritingPracticeAttempt_tenant_check',
        'WritingPracticePromptSet_tenant_check',
        'ClassAssignmentInsight_tenant_check',
        'School_parent_tenant_check',
        'Class_parent_tenant_check',
        'OrgMembership_parent_tenant_check'
      )
  ) <> 8 THEN
    RAISE EXCEPTION 'postcheck: one or more tenant-integrity triggers are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'ClassAssignmentInsight_generatedByMembershipId_fkey'
  ) THEN
    RAISE EXCEPTION
      'postcheck: class insight generator foreign key is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Organization'
      AND column_name = 'pasteActivityEnabled'
      AND data_type = 'boolean'
      AND is_nullable = 'NO'
      AND column_default IN ('false', 'false::boolean')
  ) THEN
    RAISE EXCEPTION
      'postcheck: default-off paste activity rollout gate is missing';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'PasteAlert'
      AND is_nullable = 'YES'
      AND (
        (
          column_name = 'reviewedAt'
          AND data_type = 'timestamp with time zone'
        )
        OR (
          column_name = 'reviewedByMembershipId'
          AND data_type = 'text'
        )
      )
  ) <> 2 THEN
    RAISE EXCEPTION
      'postcheck: nullable paste review metadata columns are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conname =
        'PasteAlert_reviewedByMembershipId_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.convalidated
      AND constraint_row.conrelid = 'public."PasteAlert"'::regclass
      AND constraint_row.confrelid = 'public."OrgMembership"'::regclass
      AND constraint_row.conkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public."PasteAlert"'::regclass
            AND attname = 'reviewedByMembershipId'
            AND NOT attisdropped
        )
      ]::smallint[]
      AND constraint_row.confkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public."OrgMembership"'::regclass
            AND attname = 'id'
            AND NOT attisdropped
        )
      ]::smallint[]
      AND constraint_row.confdeltype = 'n'
      AND constraint_row.confupdtype = 'c'
  ) THEN
    RAISE EXCEPTION
      'postcheck: validated paste reviewer foreign key is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class index_class
    JOIN pg_index index_row ON index_row.indexrelid = index_class.oid
    JOIN pg_namespace index_namespace
      ON index_namespace.oid = index_class.relnamespace
    WHERE index_class.relname = 'PasteAlert_reviewedByMembershipId_idx'
      AND index_namespace.nspname = 'public'
      AND index_row.indrelid = 'public."PasteAlert"'::regclass
      AND index_row.indnatts = 1
      AND index_row.indnkeyatts = 1
      AND index_row.indkey[0] = (
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public."PasteAlert"'::regclass
          AND attname = 'reviewedByMembershipId'
          AND NOT attisdropped
      )
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND index_row.indisvalid
      AND index_row.indisready
  ) THEN
    RAISE EXCEPTION
      'postcheck: paste reviewer index is absent, invalid, or not ready';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20260723210000_add_paste_alert_review_metadata',
      '20260723220000_add_paste_alert_reviewer_index',
      '20260723230000_add_paste_activity_rollout_gate'
    )
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) <> 3 THEN
    RAISE EXCEPTION
      'postcheck: one or more paste activity migrations are incomplete';
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM "WritingPracticeAttempt"
    WHERE "countsTowardProgress") AS credited_attempt_rows,
  (SELECT COUNT(*) FROM "WritingPracticeAttempt"
    WHERE NOT "countsTowardProgress") AS quarantined_attempt_rows,
  (SELECT COUNT(*) FROM "AiRequestReservation") AS ai_reservation_rows,
  (SELECT COUNT(*) FROM "Organization"
    WHERE "pasteActivityEnabled") AS paste_activity_enabled_organizations,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname LIKE '%tenant_check') AS tenant_trigger_count;
