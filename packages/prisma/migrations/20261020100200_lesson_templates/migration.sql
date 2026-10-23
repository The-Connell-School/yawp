SET lock_timeout = '5s';

-- A teacher's lesson shapes (stack page redesign, templates): an ordered list
-- of (type, minutes) slots and a name. The shape only, never the content.
CREATE TABLE "LessonPlanTemplate" (
  "id"             TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMPTZ(6),
  "name"           TEXT NOT NULL,
  "slots"          JSONB NOT NULL,
  "periodMinutes"  INTEGER,
  "membershipId"   TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,

  CONSTRAINT "LessonPlanTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPlanTemplate_membershipId_createdAt_idx"
  ON "LessonPlanTemplate" ("membershipId", "createdAt" DESC);

CREATE INDEX "LessonPlanTemplate_organizationId_idx"
  ON "LessonPlanTemplate" ("organizationId");

ALTER TABLE "LessonPlanTemplate"
  ADD CONSTRAINT "LessonPlanTemplate_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership" ("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonPlanTemplate"
  ADD CONSTRAINT "LessonPlanTemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
