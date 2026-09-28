-- The teacher's per-assignment "is this graded for grammar and syntax" toggle.
--
-- Nullable on purpose: NULL means the assignment has no preference and the
-- rubric decides, so every assignment that predates this column keeps grading
-- exactly as it did. Only an explicit FALSE changes anything.
ALTER TABLE "Assignment" ADD COLUMN "grammarGradingEnabled" BOOLEAN;
