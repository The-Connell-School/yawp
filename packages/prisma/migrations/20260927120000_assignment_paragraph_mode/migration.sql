-- The kind of paragraph a Daily Pages entry practices (analyze, argue, ...).
--
-- Nullable on purpose: NULL means no type was chosen, so every assignment that
-- predates this column grades and tutors exactly as it did. Additive only.
ALTER TABLE "Assignment" ADD COLUMN "paragraphMode" TEXT;
