SET lock_timeout = '5s';

-- Lesson Planner (Brian's run 2, A6): a filed class starter keeps its library
-- prompt id as data instead of printing "Class Starter prompt FW-021" in its
-- text. Additive and nullable; older rows keep their text and the app hides
-- the id when it shows them.
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "promptId" TEXT;
