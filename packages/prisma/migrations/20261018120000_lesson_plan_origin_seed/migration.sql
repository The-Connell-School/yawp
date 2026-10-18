SET lock_timeout = '5s';

-- Assignment summary → Lesson Planner hand-offs: which part of the summary a
-- session was opened from ("category:thesis", "models:evidence", …), so the
-- planner can rebuild that class context from the stored summary on every
-- turn instead of only in the first message. Additive and nullable.
ALTER TABLE "LessonPlanConversation" ADD COLUMN "originSeed" TEXT;
