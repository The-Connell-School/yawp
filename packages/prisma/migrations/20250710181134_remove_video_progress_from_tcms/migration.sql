/*
  Warnings:

  - You are about to drop the column `videoProgress` on the `TeacherCourseModuleSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TeacherCourseModuleSession" DROP COLUMN "videoProgress";

-- RenameIndex
ALTER INDEX "TeacherCourseModuleSession_teacherCourseModuleId_teacherProfile" RENAME TO "TeacherCourseModuleSession_teacherCourseModuleId_teacherPro_key";
