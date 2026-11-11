SET lock_timeout = '5s';

-- "Planned in" as working time (Nov 3): seconds the teacher spent working on
-- a lesson before setting it, when that clock first saw the lesson, and when
-- the page last reported. Additive; setAt and createdAt are unchanged, and
-- the old figure (setAt - createdAt) can still be read from them.
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "activeSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "activeSince" TIMESTAMPTZ(6);
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "activeReportedAt" TIMESTAMPTZ(6);
