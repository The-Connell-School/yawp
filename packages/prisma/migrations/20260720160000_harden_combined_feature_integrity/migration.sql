SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- Prisma supplies @updatedAt values, but the database default keeps raw
-- operational inserts and migration checks safe as well.
ALTER TABLE "ClassAssignmentInsight"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Duplicate active plans require an explicit product decision. Fail before
-- mutating customer state instead of silently archiving records.
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
      'duplicate active ReporterGrowthPlan rows; resolve explicitly before deploy';
  END IF;
END $$;

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
