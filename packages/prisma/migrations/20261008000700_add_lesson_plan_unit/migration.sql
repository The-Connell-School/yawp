SET lock_timeout = '5s';

-- A multi-day unit owns one map conversation and one lesson per day built out
-- of it. Days are whole lessons — plan, packet, deck, handouts — so stacking
-- them into the conversation that wrote the map produced a packet nobody could
-- teach from.
CREATE TABLE "LessonPlanUnit" (
  "id"             TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMPTZ(6),
  "title"          TEXT NOT NULL DEFAULT 'New unit',
  "membershipId"   TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,

  CONSTRAINT "LessonPlanUnit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPlanUnit_membershipId_updatedAt_idx"
  ON "LessonPlanUnit" ("membershipId", "updatedAt" DESC);

CREATE INDEX "LessonPlanUnit_organizationId_idx"
  ON "LessonPlanUnit" ("organizationId");

ALTER TABLE "LessonPlanUnit"
  ADD CONSTRAINT "LessonPlanUnit_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership" ("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonPlanUnit"
  ADD CONSTRAINT "LessonPlanUnit_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Null unitDay on a unit-linked conversation means the map itself; a number
-- means that day's lesson. Deleting a unit leaves its lessons standing rather
-- than destroying a teacher's work.
ALTER TABLE "LessonPlanConversation" ADD COLUMN "unitId" TEXT;
ALTER TABLE "LessonPlanConversation" ADD COLUMN "unitDay" INTEGER;

CREATE INDEX "LessonPlanConversation_unitId_unitDay_idx"
  ON "LessonPlanConversation" ("unitId", "unitDay");

ALTER TABLE "LessonPlanConversation"
  ADD CONSTRAINT "LessonPlanConversation_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "LessonPlanUnit" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
