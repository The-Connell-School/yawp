CREATE TABLE "AssignmentClassSummary" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentId" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL,
    "gradedAtGeneration" INTEGER NOT NULL,
    "totalAtGeneration" INTEGER NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "lastMilestone" INTEGER,

    CONSTRAINT "AssignmentClassSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentClassSummary_assignmentId_key" ON "AssignmentClassSummary"("assignmentId");

CREATE INDEX "AssignmentClassSummary_assignmentId_idx" ON "AssignmentClassSummary"("assignmentId");

ALTER TABLE "AssignmentClassSummary" ADD CONSTRAINT "AssignmentClassSummary_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
