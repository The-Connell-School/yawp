SET lock_timeout = '5s';

-- The teacher's call on whether a stack step is writing (Nov 4 follow-up).
-- Null: Yawp! decides, as before. Additive and nullable: every existing step
-- reads exactly as it did, and only lesson_planner_writing_override writes it.
ALTER TABLE "LessonPlanMaterial" ADD COLUMN IF NOT EXISTS "writing" BOOLEAN;
