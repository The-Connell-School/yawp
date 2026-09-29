-- How long students have to write this assignment, in minutes.
--
-- Nullable on purpose: NULL means no time was given, and the grading assistant
-- and grammar checker read the work exactly as they did before this column
-- existed. Only a teacher-entered value changes anything.
ALTER TABLE "Assignment" ADD COLUMN "writingTimeMinutes" INTEGER;
