SET lock_timeout = '5s';

-- A document a teacher gave the lesson planner as source material (Oct 21):
-- a chapter, a handout, their own notes. Only the text read out of it is
-- kept, not the file. One added before a lesson's first message has no
-- lesson yet; that message attaches it.
CREATE TABLE "LessonPlanUpload" (
  "id"             TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name"           TEXT NOT NULL,
  "contentType"    TEXT NOT NULL,
  "byteSize"       INTEGER NOT NULL,
  "text"           TEXT NOT NULL,
  "truncated"      BOOLEAN NOT NULL DEFAULT false,
  "conversationId" TEXT,
  "membershipId"   TEXT NOT NULL,

  CONSTRAINT "LessonPlanUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPlanUpload_conversationId_idx" ON "LessonPlanUpload" ("conversationId");
CREATE INDEX "LessonPlanUpload_membershipId_idx" ON "LessonPlanUpload" ("membershipId");

ALTER TABLE "LessonPlanUpload"
  ADD CONSTRAINT "LessonPlanUpload_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "LessonPlanConversation" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
