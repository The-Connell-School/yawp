-- Prisma supplies @updatedAt values, but the database default keeps raw
-- operational inserts and migration checks safe as well.
ALTER TABLE "ClassAssignmentInsight"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Resolve any pre-constraint duplicates deterministically, retaining the most
-- recently updated plan as active.
WITH ranked_active_plans AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "membershipId", "studentMembershipId"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS rank
  FROM "ReporterGrowthPlan"
  WHERE "status" = 'active'
)
UPDATE "ReporterGrowthPlan" AS plan
SET
  "status" = 'archived',
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_active_plans
WHERE plan."id" = ranked_active_plans."id"
  AND ranked_active_plans.rank > 1;

CREATE UNIQUE INDEX "ReporterGrowthPlan_one_active_per_owner_student"
  ON "ReporterGrowthPlan"("membershipId", "studentMembershipId")
  WHERE "status" = 'active';

-- Enforce the organization boundary already required by the application.
CREATE UNIQUE INDEX "OrgMembership_id_organizationId_key"
  ON "OrgMembership"("id", "organizationId");

ALTER TABLE "ReporterConversation"
  ADD CONSTRAINT "ReporterConversation_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReporterGrowthPlan"
  ADD CONSTRAINT "ReporterGrowthPlan_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReporterGrowthPlan"
  ADD CONSTRAINT "ReporterGrowthPlan_studentMembershipId_organizationId_fkey"
  FOREIGN KEY ("studentMembershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WritingPracticeAssignment"
  ADD CONSTRAINT "WritingPracticeAssignment_problemCount_check"
  CHECK ("problemCount" > 0),
  ADD CONSTRAINT "WritingPracticeAssignment_lessonSlugs_check"
  CHECK (CARDINALITY("lessonSlugs") > 0);

ALTER TABLE "WritingPracticeAttempt"
  ADD CONSTRAINT "WritingPracticeAttempt_position_check"
  CHECK ("position" > 0),
  ADD CONSTRAINT "WritingPracticeAttempt_status_check"
  CHECK ("status" IN ('strong', 'developing', 'needs_revision'));

ALTER TABLE "ClassAssignmentInsight"
  ADD CONSTRAINT "ClassAssignmentInsight_submissionCount_check"
  CHECK ("submissionCount" >= 0),
  ADD CONSTRAINT "ClassAssignmentInsight_status_check"
  CHECK ("status" IN ('ready', 'failed'));

ALTER TABLE "ReporterGrowthPlan"
  ADD CONSTRAINT "ReporterGrowthPlan_status_check"
  CHECK ("status" IN ('active', 'archived', 'completed'));
