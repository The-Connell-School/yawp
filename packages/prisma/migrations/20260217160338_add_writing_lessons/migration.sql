-- CreateEnum
CREATE TYPE "WritingLessonTopic" AS ENUM ('WORDINESS', 'TRANSITIONS', 'COMMA_OXFORD', 'COMMA_SPLICES', 'COMMA_INTRODUCTORY', 'COMMA_CLAUSES', 'PASSIVE_VOICE', 'PARALLEL_CONSTRUCTION', 'SUBJECT_VERB_AGREEMENT', 'PRONOUN_AGREEMENT');

-- CreateTable
CREATE TABLE "WritingLesson" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topic" "WritingLessonTopic" NOT NULL,
    "title" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL DEFAULT 'high-school',
    "content" TEXT NOT NULL,
    "exercises" JSONB NOT NULL,
    "teacherProfileId" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WritingLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingLessonAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lessonId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "classId" TEXT,
    "studentProfileId" TEXT,
    "dueAt" TIMESTAMPTZ(6),

    CONSTRAINT "WritingLessonAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingLessonSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "lessonId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,

    CONSTRAINT "WritingLessonSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingLessonAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,
    "exerciseIndex" INTEGER NOT NULL,
    "response" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "feedback" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,

    CONSTRAINT "WritingLessonAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WritingLesson_teacherProfileId_idx" ON "WritingLesson"("teacherProfileId");

-- CreateIndex
CREATE INDEX "WritingLesson_topic_idx" ON "WritingLesson"("topic");

-- CreateIndex
CREATE INDEX "WritingLessonAssignment_lessonId_idx" ON "WritingLessonAssignment"("lessonId");

-- CreateIndex
CREATE INDEX "WritingLessonAssignment_teacherProfileId_idx" ON "WritingLessonAssignment"("teacherProfileId");

-- CreateIndex
CREATE INDEX "WritingLessonAssignment_classId_idx" ON "WritingLessonAssignment"("classId");

-- CreateIndex
CREATE INDEX "WritingLessonAssignment_studentProfileId_idx" ON "WritingLessonAssignment"("studentProfileId");

-- CreateIndex
CREATE INDEX "WritingLessonSession_studentProfileId_idx" ON "WritingLessonSession"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "WritingLessonSession_lessonId_studentProfileId_key" ON "WritingLessonSession"("lessonId", "studentProfileId");

-- CreateIndex
CREATE INDEX "WritingLessonAttempt_sessionId_exerciseIndex_idx" ON "WritingLessonAttempt"("sessionId", "exerciseIndex");

-- AddForeignKey
ALTER TABLE "WritingLesson" ADD CONSTRAINT "WritingLesson_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonAssignment" ADD CONSTRAINT "WritingLessonAssignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "WritingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonAssignment" ADD CONSTRAINT "WritingLessonAssignment_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonAssignment" ADD CONSTRAINT "WritingLessonAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonAssignment" ADD CONSTRAINT "WritingLessonAssignment_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonSession" ADD CONSTRAINT "WritingLessonSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "WritingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonSession" ADD CONSTRAINT "WritingLessonSession_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonSession" ADD CONSTRAINT "WritingLessonSession_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingLessonAttempt" ADD CONSTRAINT "WritingLessonAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WritingLessonSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
