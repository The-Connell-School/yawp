\set ON_ERROR_STOP on

-- This script is intentionally safe both before the branch's first feature
-- migration and after a partial deploy. All feature-table statements are
-- dynamic so PostgreSQL never plans a reference to a relation that does not
-- exist yet.
CREATE TEMP TABLE combined_feature_preflight_counts (
  legacy_attempt_rows BIGINT NOT NULL DEFAULT 0,
  prompt_set_rows BIGINT NOT NULL DEFAULT 0,
  class_insight_rows BIGINT NOT NULL DEFAULT 0,
  growth_plan_rows BIGINT NOT NULL DEFAULT 0
);
INSERT INTO combined_feature_preflight_counts DEFAULT VALUES;

DO $$
DECLARE
  violation BOOLEAN;
  row_count BIGINT;
  writing_org_column BOOLEAN;
  attempt_position_column BOOLEAN;
BEGIN
  IF to_regclass('"ReporterConversation"') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "ReporterConversation" conversation
        LEFT JOIN "OrgMembership" owner
          ON owner."id" = conversation."membershipId"
        WHERE owner."id" IS NULL
          OR owner."organizationId" <> conversation."organizationId"
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: ReporterConversation membership tenant mismatch';
    END IF;
  END IF;

  IF to_regclass('"ReporterGrowthPlan"') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "ReporterGrowthPlan" plan
        LEFT JOIN "OrgMembership" owner
          ON owner."id" = plan."membershipId"
        LEFT JOIN "OrgMembership" student
          ON student."id" = plan."studentMembershipId"
        WHERE owner."id" IS NULL
          OR student."id" IS NULL
          OR owner."organizationId" <> plan."organizationId"
          OR student."organizationId" <> plan."organizationId"
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: ReporterGrowthPlan membership tenant mismatch';
    END IF;

    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "ReporterGrowthPlan"
        WHERE "status" = 'active'
        GROUP BY "membershipId", "studentMembershipId"
        HAVING COUNT(*) > 1
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: duplicate active ReporterGrowthPlan rows require explicit resolution';
    END IF;

    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1 FROM "ReporterGrowthPlan"
        WHERE "status" NOT IN ('active', 'archived', 'completed')
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION 'preflight: invalid ReporterGrowthPlan.status value';
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM "ReporterGrowthPlan"' INTO row_count;
    UPDATE combined_feature_preflight_counts
    SET growth_plan_rows = row_count;
  END IF;

  IF to_regclass('"WritingPracticeAssignment"') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "WritingPracticeAssignment"
        WHERE "problemCount" <= 0
          OR "lessonSlugs" IS NULL
          OR CARDINALITY("lessonSlugs") = 0
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: invalid WritingPracticeAssignment problem count or lesson slugs';
    END IF;

    IF to_regclass('"WritingPracticeClassAssignment"') IS NOT NULL THEN
      EXECUTE $query$
        SELECT EXISTS (
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
        )
      $query$ INTO violation;
      IF violation THEN
        RAISE EXCEPTION
          'preflight: ownerless writing assignment has no tenant to backfill';
      END IF;

      EXECUTE $query$
        SELECT EXISTS (
          SELECT assignment."id"
          FROM "WritingPracticeAssignment" assignment
          JOIN "WritingPracticeClassAssignment" deployment
            ON deployment."assignmentId" = assignment."id"
          JOIN "Class" class_row ON class_row."id" = deployment."classId"
          JOIN "School" school ON school."id" = class_row."schoolId"
          GROUP BY assignment."id"
          HAVING COUNT(DISTINCT school."organizationId") > 1
        )
      $query$ INTO violation;
      IF violation THEN
        RAISE EXCEPTION
          'preflight: writing assignment is deployed across organizations';
      END IF;

      EXECUTE $query$
        SELECT EXISTS (
          SELECT 1
          FROM "WritingPracticeAssignment" assignment
          JOIN "OrgMembership" creator
            ON creator."id" = assignment."createdByMembershipId"
          JOIN "WritingPracticeClassAssignment" deployment
            ON deployment."assignmentId" = assignment."id"
          JOIN "Class" class_row ON class_row."id" = deployment."classId"
          JOIN "School" school ON school."id" = class_row."schoolId"
          WHERE creator."organizationId" <> school."organizationId"
        )
      $query$ INTO violation;
      IF violation THEN
        RAISE EXCEPTION
          'preflight: cross-organization writing-practice deployment exists';
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'WritingPracticeAssignment'
        AND column_name = 'organizationId'
    ) INTO writing_org_column;

    IF writing_org_column THEN
      EXECUTE $query$
        SELECT EXISTS (
          SELECT 1
          FROM "WritingPracticeAssignment" assignment
          LEFT JOIN "OrgMembership" creator
            ON creator."id" = assignment."createdByMembershipId"
          WHERE assignment."organizationId" IS NULL
            OR (
              creator."id" IS NOT NULL
              AND creator."organizationId" <> assignment."organizationId"
            )
        )
      $query$ INTO violation;
      IF violation THEN
        RAISE EXCEPTION
          'preflight: WritingPracticeAssignment durable tenant mismatch';
      END IF;
    END IF;
  END IF;

  IF to_regclass('"WritingPracticeAttempt"') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1 FROM "WritingPracticeAttempt"
        WHERE "status" NOT IN ('strong', 'developing', 'needs_revision')
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION 'preflight: invalid WritingPracticeAttempt.status value';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'WritingPracticeAttempt'
        AND column_name = 'position'
    ) INTO attempt_position_column;
    IF attempt_position_column THEN
      EXECUTE $query$
        SELECT EXISTS (
          SELECT 1 FROM "WritingPracticeAttempt" WHERE "position" <= 0
        )
      $query$ INTO violation;
      IF violation THEN
        RAISE EXCEPTION 'preflight: invalid WritingPracticeAttempt.position';
      END IF;
    END IF;

    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "WritingPracticeAttempt" attempt
        JOIN "OrgMembership" student ON student."id" = attempt."membershipId"
        JOIN "WritingPracticeClassAssignment" deployment
          ON deployment."id" = attempt."classAssignmentId"
        JOIN "Class" class_row ON class_row."id" = deployment."classId"
        JOIN "School" school ON school."id" = class_row."schoolId"
        WHERE student."organizationId" <> school."organizationId"
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: cross-organization writing-practice attempt exists';
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM "WritingPracticeAttempt"' INTO row_count;
    UPDATE combined_feature_preflight_counts
    SET legacy_attempt_rows = row_count;
  END IF;

  IF to_regclass('"WritingPracticePromptSet"') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "WritingPracticePromptSet" prompt_set
        JOIN "OrgMembership" student
          ON student."id" = prompt_set."membershipId"
        JOIN "WritingPracticeClassAssignment" deployment
          ON deployment."id" = prompt_set."classAssignmentId"
        JOIN "Class" class_row ON class_row."id" = deployment."classId"
        JOIN "School" school ON school."id" = class_row."schoolId"
        WHERE student."organizationId" <> school."organizationId"
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: cross-organization writing-practice prompt set exists';
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM "WritingPracticePromptSet"' INTO row_count;
    UPDATE combined_feature_preflight_counts SET prompt_set_rows = row_count;
  END IF;

  IF to_regclass('"ClassAssignmentInsight"') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1 FROM "ClassAssignmentInsight"
        WHERE "submissionCount" < 0
          OR "status" NOT IN ('ready', 'failed')
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: invalid ClassAssignmentInsight count or status';
    END IF;

    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "ClassAssignmentInsight" insight
        LEFT JOIN "OrgMembership" generator
          ON generator."id" = insight."generatedByMembershipId"
        JOIN "ClassAssignment" deployment
          ON deployment."id" = insight."classAssignmentId"
        JOIN "Class" class_row ON class_row."id" = deployment."classId"
        JOIN "School" school ON school."id" = class_row."schoolId"
        WHERE insight."generatedByMembershipId" IS NOT NULL
          AND (
            generator."id" IS NULL
            OR generator."organizationId" <> school."organizationId"
          )
      )
    $query$ INTO violation;
    IF violation THEN
      RAISE EXCEPTION
        'preflight: orphaned or cross-organization class insight exists';
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM "ClassAssignmentInsight"' INTO row_count;
    UPDATE combined_feature_preflight_counts
    SET class_insight_rows = row_count;
  END IF;
END $$;

TABLE combined_feature_preflight_counts;
DROP TABLE combined_feature_preflight_counts;
