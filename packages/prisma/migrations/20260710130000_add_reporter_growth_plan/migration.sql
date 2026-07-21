-- Yawp Reporter growth plans (persistent, teacher-owned, per-student plans).
CREATE TABLE "ReporterGrowthPlan" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'active',
  "focus" TEXT NOT NULL,
  "targetSkills" JSONB NOT NULL,
  "body" TEXT NOT NULL,
  "baseline" JSONB NOT NULL,
  "checkInAt" TIMESTAMPTZ(6),
  "membershipId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "studentMembershipId" TEXT NOT NULL,
  CONSTRAINT "ReporterGrowthPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReporterGrowthPlan_membershipId_studentMembershipId_status_idx"
  ON "ReporterGrowthPlan"("membershipId", "studentMembershipId", "status");

CREATE INDEX "ReporterGrowthPlan_studentMembershipId_idx"
  ON "ReporterGrowthPlan"("studentMembershipId");

CREATE INDEX "ReporterGrowthPlan_organizationId_idx"
  ON "ReporterGrowthPlan"("organizationId");

ALTER TABLE "ReporterGrowthPlan"
  ADD CONSTRAINT "ReporterGrowthPlan_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReporterGrowthPlan"
  ADD CONSTRAINT "ReporterGrowthPlan_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReporterGrowthPlan"
  ADD CONSTRAINT "ReporterGrowthPlan_studentMembershipId_fkey"
  FOREIGN KEY ("studentMembershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
