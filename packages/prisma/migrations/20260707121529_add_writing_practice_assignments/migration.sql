-- CreateTable
CREATE TABLE "WritingPracticeAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "lessonSlugs" TEXT[],
    "problemCount" INTEGER NOT NULL DEFAULT 5,
    "dueAt" TIMESTAMPTZ(6),
    "instructions" TEXT,
    "createdByMembershipId" TEXT,

    CONSTRAINT "WritingPracticeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingPracticeClassAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "WritingPracticeClassAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingPracticeAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classAssignmentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "lessonSlug" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "exercise" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "feedbackJson" JSONB NOT NULL,

    CONSTRAINT "WritingPracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WritingPracticeAssignment_createdByMembershipId_idx" ON "WritingPracticeAssignment"("createdByMembershipId");

-- CreateIndex
CREATE INDEX "WritingPracticeClassAssignment_classId_createdAt_idx" ON "WritingPracticeClassAssignment"("classId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WritingPracticeClassAssignment_assignmentId_classId_key" ON "WritingPracticeClassAssignment"("assignmentId", "classId");

-- CreateIndex
CREATE INDEX "WritingPracticeAttempt_classAssignmentId_membershipId_creat_idx" ON "WritingPracticeAttempt"("classAssignmentId", "membershipId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WritingPracticeAttempt_membershipId_createdAt_idx" ON "WritingPracticeAttempt"("membershipId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "WritingPracticeAssignment" ADD CONSTRAINT "WritingPracticeAssignment_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingPracticeClassAssignment" ADD CONSTRAINT "WritingPracticeClassAssignment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WritingPracticeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingPracticeClassAssignment" ADD CONSTRAINT "WritingPracticeClassAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingPracticeAttempt" ADD CONSTRAINT "WritingPracticeAttempt_classAssignmentId_fkey" FOREIGN KEY ("classAssignmentId") REFERENCES "WritingPracticeClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingPracticeAttempt" ADD CONSTRAINT "WritingPracticeAttempt_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
