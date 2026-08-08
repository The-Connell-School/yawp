CREATE TABLE "WritingPracticeAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "lessonSlugs" TEXT[],
    "problemCount" INTEGER NOT NULL DEFAULT 5,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "instructions" TEXT,
    "createdByMembershipId" TEXT,

    CONSTRAINT "WritingPracticeAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WritingPracticeClassAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "WritingPracticeClassAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WritingPracticeAssignment_createdByMembershipId_idx"
ON "WritingPracticeAssignment"("createdByMembershipId");

CREATE INDEX "WritingPracticeClassAssignment_classId_createdAt_idx"
ON "WritingPracticeClassAssignment"("classId", "createdAt" DESC);

CREATE UNIQUE INDEX "WritingPracticeClassAssignment_assignmentId_classId_key"
ON "WritingPracticeClassAssignment"("assignmentId", "classId");

ALTER TABLE "WritingPracticeAssignment"
ADD CONSTRAINT "WritingPracticeAssignment_createdByMembershipId_fkey"
FOREIGN KEY ("createdByMembershipId") REFERENCES "OrgMembership"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WritingPracticeClassAssignment"
ADD CONSTRAINT "WritingPracticeClassAssignment_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "WritingPracticeAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WritingPracticeClassAssignment"
ADD CONSTRAINT "WritingPracticeClassAssignment_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
