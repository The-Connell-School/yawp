-- AlterTable
ALTER TABLE "_TeacherCourseAssignments" ADD CONSTRAINT "_TeacherCourseAssignments_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_TeacherCourseAssignments_AB_unique";
