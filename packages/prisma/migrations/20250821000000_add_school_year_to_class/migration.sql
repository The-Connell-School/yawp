-- AlterTable
ALTER TABLE "Class" ADD COLUMN "schoolYear" TEXT NOT NULL DEFAULT '2024-2025';

-- DropIndex
DROP INDEX "Class_schoolId_period_grade_key";

-- CreateIndex
CREATE UNIQUE INDEX "Class_schoolId_schoolYear_period_grade_key" ON "Class"("schoolId", "schoolYear", "period", "grade");

