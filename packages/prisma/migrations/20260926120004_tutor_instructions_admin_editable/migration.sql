-- Make the tutor's prompt layers editable in admin instead of code-only.
--
-- "AssignmentType"."tutorInstructions" is the assignment-level General Tutor
-- Instructions box -- the top of every tutor prompt for that assignment type.
-- It is where the Universal YAWP! Tutor Instructions live.
--
-- The *VariantsJson columns hold per-variant guidance for assignment types
-- whose modules serve more than one flavour of the same step. AP History uses
-- the keys "dbq" and "leq"; the shape is {"<variantKey>": "<instructions>"}.
-- The existing single-string "tutorInstructions" columns are untouched and
-- still read as a fallback, so nothing breaks before these are populated.

ALTER TABLE "AssignmentType" ADD COLUMN "tutorInstructions" TEXT;
ALTER TABLE "AssignmentModule" ADD COLUMN "tutorInstructionsVariantsJson" JSONB;
ALTER TABLE "AssignmentModuleInstruction" ADD COLUMN "tutorInstructionsVariantsJson" JSONB;
