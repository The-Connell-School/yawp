-- AlterTable
ALTER TABLE "AssignmentModuleSessionMessage" ADD COLUMN     "membershipId" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "submittedByMembershipId" TEXT;

-- CreateTable
CREATE TABLE "DocumentCollaborator" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "documentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "invitedByMembershipId" TEXT NOT NULL,

    CONSTRAINT "DocumentCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentCollaborator_documentId_revokedAt_idx" ON "DocumentCollaborator"("documentId", "revokedAt");

-- CreateIndex
CREATE INDEX "DocumentCollaborator_membershipId_revokedAt_idx" ON "DocumentCollaborator"("membershipId", "revokedAt");

-- CreateIndex
CREATE INDEX "DocumentCollaborator_invitedByMembershipId_idx" ON "DocumentCollaborator"("invitedByMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCollaborator_documentId_membershipId_key" ON "DocumentCollaborator"("documentId", "membershipId");

-- CreateIndex
CREATE INDEX "AssignmentModuleSessionMessage_membershipId_idx" ON "AssignmentModuleSessionMessage"("membershipId");

-- CreateIndex
CREATE INDEX "Submission_submittedByMembershipId_idx" ON "Submission"("submittedByMembershipId");

-- AddForeignKey
ALTER TABLE "AssignmentModuleSessionMessage" ADD CONSTRAINT "AssignmentModuleSessionMessage_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCollaborator" ADD CONSTRAINT "DocumentCollaborator_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCollaborator" ADD CONSTRAINT "DocumentCollaborator_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCollaborator" ADD CONSTRAINT "DocumentCollaborator_invitedByMembershipId_fkey" FOREIGN KEY ("invitedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submittedByMembershipId_fkey" FOREIGN KEY ("submittedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

