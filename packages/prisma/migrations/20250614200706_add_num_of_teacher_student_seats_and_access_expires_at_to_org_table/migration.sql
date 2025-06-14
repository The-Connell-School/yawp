-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "accessExpiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "numOfStudentSeats" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "numOfTeacherSeats" INTEGER NOT NULL DEFAULT 10;
