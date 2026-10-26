-- PKG-03: new assignments default to Beginner grading assistant strictness.
-- Does not update existing rows.

ALTER TABLE "Assignment" ALTER COLUMN "gradingAssistantStrictnessLevel" SET DEFAULT 'beginner';

ALTER TABLE "SavedAssignment" ALTER COLUMN "gradingAssistantStrictnessLevel" SET DEFAULT 'beginner';
