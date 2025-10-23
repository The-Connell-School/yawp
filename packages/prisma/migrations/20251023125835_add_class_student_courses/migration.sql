-- CreateTable
CREATE TABLE "ClassStudentCourse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classId" TEXT NOT NULL,
    "studentCourseId" TEXT NOT NULL,

    CONSTRAINT "ClassStudentCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassStudentCourse_classId_studentCourseId_key" ON "ClassStudentCourse"("classId", "studentCourseId");

-- AddForeignKey
ALTER TABLE "ClassStudentCourse" ADD CONSTRAINT "ClassStudentCourse_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassStudentCourse" ADD CONSTRAINT "ClassStudentCourse_studentCourseId_fkey" FOREIGN KEY ("studentCourseId") REFERENCES "StudentCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
