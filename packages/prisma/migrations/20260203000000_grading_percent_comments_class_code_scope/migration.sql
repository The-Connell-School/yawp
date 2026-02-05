-- Grade: add numeric percentage, letter grade, grammar issues, prompt config
ALTER TABLE "Grade" ADD COLUMN "numericPercentage" INTEGER;
ALTER TABLE "Grade" ADD COLUMN "letterGrade" TEXT;
ALTER TABLE "Grade" ADD COLUMN "grammarIssues" JSONB;
ALTER TABLE "Grade" ADD COLUMN "promptConfig" JSONB;

-- DocumentComment: archive drafting comments on submit
ALTER TABLE "DocumentComment" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);

-- Class: allow duplicate (schoolYear, grade, period) and scope code uniqueness to school
DROP INDEX IF EXISTS "Class_schoolId_schoolYear_period_grade_key";
DROP INDEX IF EXISTS "Class_code_key";

CREATE UNIQUE INDEX "Class_schoolId_code_key" ON "Class"("schoolId", "code");
CREATE INDEX "Class_schoolId_schoolYear_period_grade_idx" ON "Class"("schoolId", "schoolYear", "period", "grade");

