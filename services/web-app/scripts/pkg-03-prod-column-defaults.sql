-- PKG-03 · Site-wide assignment defaults (Grading Assistant Beginner)
-- BRYANT ACTION REQUIRED — do NOT run against production until explicitly approved.
--
-- This script only changes column DEFAULTs for new rows that omit
-- gradingAssistantStrictnessLevel. Existing assignments are untouched.
-- Point defaults remain type-specific in application code (Class Starter 10,
-- Exit Ticket 10, Daily Pages 20, others 100).
--
-- Demo/staging: prefer `bun prisma migrate deploy` (migration
-- 20261026160000_pkg03_assignment_strictness_default_beginner).

ALTER TABLE "Assignment"
  ALTER COLUMN "gradingAssistantStrictnessLevel" SET DEFAULT 'beginner';

ALTER TABLE "SavedAssignment"
  ALTER COLUMN "gradingAssistantStrictnessLevel" SET DEFAULT 'beginner';
