-- Add frozen essay content to grades to preserve graded artifact content
ALTER TABLE "Grade"
ADD COLUMN "essayText" TEXT,
ADD COLUMN "essayHtml" TEXT;
