-- Add assignment-level grading assistant strictness calibration.
-- Backward compatible: existing assignments use the prior implicit default.

ALTER TABLE "Assignment"
  ADD COLUMN "gradingAssistantStrictnessLevel" TEXT NOT NULL DEFAULT 'intermediate';

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_gradingAssistantStrictnessLevel_valid"
  CHECK ("gradingAssistantStrictnessLevel" IN ('beginner', 'intermediate', 'advanced'));
