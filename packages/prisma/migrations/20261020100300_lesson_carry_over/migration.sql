SET lock_timeout = '5s';

-- A step moved "to tomorrow" by a one-tap fix (stack page redesign). It waits
-- here, keyed by the class, until the next lesson for that class claims it.
CREATE TABLE "LessonPlanCarryOver" (
  "id"                 TEXT NOT NULL,
  "createdAt"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt"         TIMESTAMPTZ(6),
  "classKey"           TEXT NOT NULL,
  "fromConversationId" TEXT NOT NULL,
  "fromLessonDate"     TIMESTAMPTZ(6),
  "kind"               TEXT NOT NULL,
  "title"              TEXT NOT NULL,
  "content"            TEXT NOT NULL,
  "minutes"            INTEGER,
  "stepType"           TEXT,
  "membershipId"       TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,

  CONSTRAINT "LessonPlanCarryOver_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPlanCarryOver_membershipId_classKey_consumedAt_idx"
  ON "LessonPlanCarryOver" ("membershipId", "classKey", "consumedAt");

CREATE INDEX "LessonPlanCarryOver_organizationId_idx"
  ON "LessonPlanCarryOver" ("organizationId");

ALTER TABLE "LessonPlanCarryOver"
  ADD CONSTRAINT "LessonPlanCarryOver_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership" ("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonPlanCarryOver"
  ADD CONSTRAINT "LessonPlanCarryOver_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
