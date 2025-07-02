-- CreateTable
CREATE TABLE "TeacherCourse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TeacherCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCourseImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "altText" TEXT,
    "contentType" TEXT NOT NULL,
    "blob" BYTEA NOT NULL,
    "teacherCourseId" TEXT NOT NULL,

    CONSTRAINT "TeacherCourseImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCourseModule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT,
    "videoLink" TEXT,
    "videoDuration" INTEGER,
    "teacherCourseId" TEXT,

    CONSTRAINT "TeacherCourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCourseModuleResource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "blob" BYTEA NOT NULL,
    "teacherCourseModuleId" TEXT NOT NULL,

    CONSTRAINT "TeacherCourseModuleResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCourseResource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "teacherCourseId" TEXT NOT NULL,

    CONSTRAINT "TeacherCourseResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCourseModuleSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "videoProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "videoTimestamp" INTEGER NOT NULL DEFAULT 0,
    "teacherCourseModuleId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,

    CONSTRAINT "TeacherCourseModuleSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherCourseImage_teacherCourseId_key" ON "TeacherCourseImage"("teacherCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherCourseModuleSession_teacherCourseModuleId_teacherProfile_key" ON "TeacherCourseModuleSession"("teacherCourseModuleId", "teacherProfileId");

-- AddForeignKey
ALTER TABLE "TeacherCourseImage" ADD CONSTRAINT "TeacherCourseImage_teacherCourseId_fkey" FOREIGN KEY ("teacherCourseId") REFERENCES "TeacherCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourseModule" ADD CONSTRAINT "TeacherCourseModule_teacherCourseId_fkey" FOREIGN KEY ("teacherCourseId") REFERENCES "TeacherCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourseModuleResource" ADD CONSTRAINT "TeacherCourseModuleResource_teacherCourseModuleId_fkey" FOREIGN KEY ("teacherCourseModuleId") REFERENCES "TeacherCourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourseResource" ADD CONSTRAINT "TeacherCourseResource_teacherCourseId_fkey" FOREIGN KEY ("teacherCourseId") REFERENCES "TeacherCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourseModuleSession" ADD CONSTRAINT "TeacherCourseModuleSession_teacherCourseModuleId_fkey" FOREIGN KEY ("teacherCourseModuleId") REFERENCES "TeacherCourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourseModuleSession" ADD CONSTRAINT "TeacherCourseModuleSession_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;