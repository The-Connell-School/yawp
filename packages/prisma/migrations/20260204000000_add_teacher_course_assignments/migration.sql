-- CreateTable
CREATE TABLE "_TeacherCourseAssignments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_TeacherCourseAssignments_AB_unique" ON "_TeacherCourseAssignments"("A", "B");

-- CreateIndex
CREATE INDEX "_TeacherCourseAssignments_B_index" ON "_TeacherCourseAssignments"("B");

-- AddForeignKey
ALTER TABLE "_TeacherCourseAssignments" ADD CONSTRAINT "_TeacherCourseAssignments_A_fkey" FOREIGN KEY ("A") REFERENCES "TeacherCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TeacherCourseAssignments" ADD CONSTRAINT "_TeacherCourseAssignments_B_fkey" FOREIGN KEY ("B") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

