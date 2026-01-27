-- Add rubric and AI grading fields
ALTER TABLE "Grade" ADD COLUMN "rubricScores" JSONB;
ALTER TABLE "Grade" ADD COLUMN "overallScore" INTEGER;
ALTER TABLE "Grade" ADD COLUMN "overallComment" TEXT;
ALTER TABLE "Grade" ADD COLUMN "aiMeta" JSONB;
