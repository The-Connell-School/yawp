-- CreateTable
CREATE TABLE "ClassAssignmentInsight" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "classAssignmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "model" TEXT,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "generatedByMembershipId" TEXT,
    "generatedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ClassAssignmentInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassAssignmentInsight_classAssignmentId_key" ON "ClassAssignmentInsight"("classAssignmentId");

-- AddForeignKey
ALTER TABLE "ClassAssignmentInsight" ADD CONSTRAINT "ClassAssignmentInsight_classAssignmentId_fkey" FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
