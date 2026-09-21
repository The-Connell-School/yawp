ALTER TABLE "Assignment"
  ADD COLUMN "rubricTotalPoints" INTEGER,
  ADD COLUMN "gradingMode" TEXT NOT NULL DEFAULT 'step';
