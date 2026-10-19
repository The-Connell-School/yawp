-- Add optional authored instruction fields without rewriting existing rows.
ALTER TABLE "AssignmentModuleInstruction"
  ADD COLUMN "answerKey" TEXT,
  ADD COLUMN "nextButtonLabel" TEXT;
