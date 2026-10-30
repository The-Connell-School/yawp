SET lock_timeout = '5s';

-- Kevin's unit-build feedback (Oct 25).

-- A short line shown for a message a button sent as the teacher, in place of
-- the full request the planner gets ("Building Day 1 of Julius Caesar: …").
ALTER TABLE "LessonPlanMessage" ADD COLUMN IF NOT EXISTS "displayText" TEXT;

-- The stack as it was when the slides were filed or rebuilt, so the stack
-- page can say when the lesson has changed since.
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "deckStackKey" TEXT;

-- The steps moved to "If you have extra time": out of the timed lesson.
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "extensionStepIds" JSONB;
