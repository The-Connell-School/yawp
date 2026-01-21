-- CreateEnum
CREATE TYPE "RubricType" AS ENUM ('default_yop', 'school_upload', 'custom_pdf');

-- CreateEnum
CREATE TYPE "GradeLevel" AS ENUM ('regular', 'honors', 'ap');

-- CreateEnum
CREATE TYPE "FeedbackTone" AS ENUM ('gentle', 'moderate', 'brutal');

-- CreateTable
CREATE TABLE "Rubric" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rubricType" "RubricType" NOT NULL,
    "gradeLevel" "GradeLevel" NOT NULL,
    "feedbackTone" "FeedbackTone" NOT NULL,
    "pdfBlob" BYTEA,
    "pdfFileName" TEXT,
    "pdfContentType" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Class" ADD COLUMN "rubricId" TEXT;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
