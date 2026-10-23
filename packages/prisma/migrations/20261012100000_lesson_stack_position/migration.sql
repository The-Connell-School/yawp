SET lock_timeout = '5s';

-- Lesson Planner stack order (Brian's run 2, A1): a teacher can drag the
-- pieces of a lesson into the order they will teach them. Additive and
-- nullable: a stack nobody has reordered keeps reading in the order its
-- pieces were written, exactly as before.
ALTER TABLE "LessonPlanMessage" ADD COLUMN "position" INTEGER;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "position" INTEGER;
