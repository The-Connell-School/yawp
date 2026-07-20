\set ON_ERROR_STOP on

-- Run before migrate deploy. Every query is read-only and fails closed on data
-- that would otherwise make the combined Reporter / class-insight / writing
-- migrations ambiguous or destructive.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ReporterGrowthPlan"
    WHERE "status" = 'active'
    GROUP BY "membershipId", "studentMembershipId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'preflight: duplicate active ReporterGrowthPlan rows require explicit resolution';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAssignment"
    WHERE "lessonSlugs" IS NULL OR CARDINALITY("lessonSlugs") = 0
  ) THEN
    RAISE EXCEPTION
      'preflight: WritingPracticeAssignment.lessonSlugs contains null or empty values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeClassAssignment" deployment
    JOIN "WritingPracticeAssignment" assignment
      ON assignment."id" = deployment."assignmentId"
    JOIN "OrgMembership" creator
      ON creator."id" = assignment."createdByMembershipId"
    JOIN "Class" class_row ON class_row."id" = deployment."classId"
    JOIN "School" school ON school."id" = class_row."schoolId"
    WHERE creator."organizationId" <> school."organizationId"
  ) THEN
    RAISE EXCEPTION
      'preflight: cross-organization writing-practice deployment exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAttempt" attempt
    JOIN "OrgMembership" student ON student."id" = attempt."membershipId"
    JOIN "WritingPracticeClassAssignment" deployment
      ON deployment."id" = attempt."classAssignmentId"
    JOIN "Class" class_row ON class_row."id" = deployment."classId"
    JOIN "School" school ON school."id" = class_row."schoolId"
    WHERE student."organizationId" <> school."organizationId"
  ) THEN
    RAISE EXCEPTION
      'preflight: cross-organization writing-practice attempt exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WritingPracticePromptSet" prompt_set
    JOIN "OrgMembership" student ON student."id" = prompt_set."membershipId"
    JOIN "WritingPracticeClassAssignment" deployment
      ON deployment."id" = prompt_set."classAssignmentId"
    JOIN "Class" class_row ON class_row."id" = deployment."classId"
    JOIN "School" school ON school."id" = class_row."schoolId"
    WHERE student."organizationId" <> school."organizationId"
  ) THEN
    RAISE EXCEPTION
      'preflight: cross-organization writing-practice prompt set exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ClassAssignmentInsight" insight
    JOIN "OrgMembership" generator
      ON generator."id" = insight."generatedByMembershipId"
    JOIN "ClassAssignment" deployment
      ON deployment."id" = insight."classAssignmentId"
    JOIN "Class" class_row ON class_row."id" = deployment."classId"
    JOIN "School" school ON school."id" = class_row."schoolId"
    WHERE generator."organizationId" <> school."organizationId"
  ) THEN
    RAISE EXCEPTION
      'preflight: cross-organization class insight exists';
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM "WritingPracticeAttempt") AS legacy_attempt_rows,
  (SELECT COUNT(*) FROM "WritingPracticePromptSet") AS prompt_set_rows,
  (SELECT COUNT(*) FROM "ClassAssignmentInsight") AS class_insight_rows,
  (SELECT COUNT(*) FROM "ReporterGrowthPlan") AS growth_plan_rows;
