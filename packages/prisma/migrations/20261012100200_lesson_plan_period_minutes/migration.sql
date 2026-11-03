SET lock_timeout = '5s';

-- Lesson Planner (Brian's run 2, B1): keep the lesson's length and class from
-- the teacher's answer, so the planner fits every plan and deck to the period
-- on every turn. Additive and nullable.
ALTER TABLE "LessonPlanConversation" ADD COLUMN "periodMinutes" INTEGER;
ALTER TABLE "LessonPlanConversation" ADD COLUMN "lessonClassLabel" TEXT;
