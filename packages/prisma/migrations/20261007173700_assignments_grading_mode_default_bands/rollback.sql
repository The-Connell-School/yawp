-- Roll back default for Assignment.gradingMode to step
ALTER TABLE "Assignment" ALTER COLUMN "gradingMode" SET DEFAULT 'step';
