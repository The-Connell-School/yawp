SET lock_timeout = '5s';

-- Lesson Planner intake v2 (Brian's review, A2): remember how long each class
-- meets, as the teacher last set it. Additive and nullable: no existing row
-- changes, and nothing reads it unless lesson_planner_intake_v2 is on.
ALTER TABLE "Class" ADD COLUMN "periodMinutes" INTEGER;
