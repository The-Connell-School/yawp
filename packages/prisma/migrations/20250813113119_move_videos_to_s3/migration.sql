/*
  Warnings:

  - You are about to drop the column `videoLink` on the `TeacherCourseModule` table. All the data in the column will be lost.
  - You are about to drop the `Upload` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Upload" DROP CONSTRAINT "Upload_userId_fkey";

-- AlterTable
ALTER TABLE "TeacherCourseModule" DROP COLUMN "videoLink",
ADD COLUMN     "videoS3Key" TEXT;

-- DropTable
DROP TABLE "Upload";
