SET lock_timeout = '5s';

ALTER TABLE "LessonPlanMaterial" ADD COLUMN IF NOT EXISTS "teacherNotes" TEXT;
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "teacherNotes";
