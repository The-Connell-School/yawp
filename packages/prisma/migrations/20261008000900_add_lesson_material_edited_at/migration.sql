SET lock_timeout = '5s';

-- A hand-edited handout needs to stop being something the planner can quietly
-- overwrite. `editedAt` marks a material as forked out of the model's control
-- the moment a teacher edits its content in the stack; while set, filing a new
-- revision over the same slot has to ask rather than replace it outright.
ALTER TABLE "LessonPlanMaterial"
  ADD COLUMN "editedAt" TIMESTAMPTZ(6);
