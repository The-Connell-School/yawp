-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "Submission_documentId_archivedAt_idx" ON "Submission"("documentId", "archivedAt");
