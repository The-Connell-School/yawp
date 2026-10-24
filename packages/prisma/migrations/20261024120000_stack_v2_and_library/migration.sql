SET lock_timeout = '5s';

-- Brian's handoff (Oct 24): stack page v2 and the library redesign.

-- One record per assignment made from a lesson piece, keyed by the reply and
-- block it came from, so creating it in the planner chat before the piece is
-- in the stack is still known on the stack (task 1).
CREATE TABLE "LessonPlanAssignmentLink" (
  "id"              TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conversationId"  TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "blockKey"        TEXT NOT NULL,
  "yawpHref"        TEXT NOT NULL,
  "createdFrom"     TEXT NOT NULL,

  CONSTRAINT "LessonPlanAssignmentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonPlanAssignmentLink_piece_key"
  ON "LessonPlanAssignmentLink" ("conversationId", "sourceMessageId", "blockKey");
ALTER TABLE "LessonPlanAssignmentLink"
  ADD CONSTRAINT "LessonPlanAssignmentLink_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "LessonPlanConversation" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A teacher's Google Drive permission (drive.file only), kept after the first
-- "Google Docs" click so the next one does not ask again (task 3). The
-- refresh token is stored encrypted.
CREATE TABLE "GoogleDriveGrant" (
  "id"           TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"       TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "scope"        TEXT NOT NULL,

  CONSTRAINT "GoogleDriveGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleDriveGrant_userId_key" ON "GoogleDriveGrant" ("userId");

-- A step's notes for the teacher, editable (task 7), and a lesson's first
-- name, kept once it is renamed (task 8).
ALTER TABLE "LessonPlanMaterial" ADD COLUMN IF NOT EXISTS "teacherNotes" TEXT;
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "originalTitle" TEXT;

-- The library: a teacher's courses (one tab each), optional groups of units
-- inside a course, and each unit's place, group and kind.
CREATE TABLE "LessonPlanCourse" (
  "id"           TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "membershipId" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "position"     INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "LessonPlanCourse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LessonPlanCourse_membershipId_idx" ON "LessonPlanCourse" ("membershipId");

CREATE TABLE "LessonPlanUnitGroup" (
  "id"        TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "courseId"  TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "subtitle"  TEXT,
  "position"  INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "LessonPlanUnitGroup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LessonPlanUnitGroup_courseId_idx" ON "LessonPlanUnitGroup" ("courseId");
ALTER TABLE "LessonPlanUnitGroup"
  ADD CONSTRAINT "LessonPlanUnitGroup_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "LessonPlanCourse" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonPlanUnit" ADD COLUMN IF NOT EXISTS "courseId" TEXT;
ALTER TABLE "LessonPlanUnit" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
ALTER TABLE "LessonPlanUnit" ADD COLUMN IF NOT EXISTS "position" INTEGER;
ALTER TABLE "LessonPlanUnit" ADD COLUMN IF NOT EXISTS "kind" TEXT;
CREATE INDEX "LessonPlanUnit_courseId_idx" ON "LessonPlanUnit" ("courseId");
ALTER TABLE "LessonPlanUnit"
  ADD CONSTRAINT "LessonPlanUnit_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "LessonPlanCourse" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LessonPlanUnit"
  ADD CONSTRAINT "LessonPlanUnit_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "LessonPlanUnitGroup" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
