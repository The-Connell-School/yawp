-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "unsubmittedAt" TIMESTAMPTZ(6),
ADD COLUMN     "unsubmittedByMembershipId" TEXT;

-- CreateIndex
CREATE INDEX "Submission_documentId_unsubmittedAt_idx" ON "Submission"("documentId", "unsubmittedAt");

-- CreateIndex
CREATE INDEX "Submission_unsubmittedByMembershipId_idx" ON "Submission"("unsubmittedByMembershipId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_unsubmittedByMembershipId_fkey" FOREIGN KEY ("unsubmittedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
