SET lock_timeout = '5s';

-- Teacher notes per step (Oct 24 handoff, task 7), on the lesson and keyed by
-- step id: a step from the chat has no material row to hold them. The
-- material column from the stack v2 migration was never written; it goes.
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "teacherNotes" JSONB;
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "teacherNotes";
