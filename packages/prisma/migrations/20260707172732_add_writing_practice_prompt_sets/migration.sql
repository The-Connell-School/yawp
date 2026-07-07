-- CreateTable
CREATE TABLE "WritingPracticePromptSet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classAssignmentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "promptsJson" JSONB NOT NULL,

    CONSTRAINT "WritingPracticePromptSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WritingPracticePromptSet_classAssignmentId_membershipId_key" ON "WritingPracticePromptSet"("classAssignmentId", "membershipId");

-- AddForeignKey
ALTER TABLE "WritingPracticePromptSet" ADD CONSTRAINT "WritingPracticePromptSet_classAssignmentId_fkey" FOREIGN KEY ("classAssignmentId") REFERENCES "WritingPracticeClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingPracticePromptSet" ADD CONSTRAINT "WritingPracticePromptSet_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
