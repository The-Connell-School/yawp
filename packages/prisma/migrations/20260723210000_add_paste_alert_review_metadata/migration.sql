-- AlterTable
ALTER TABLE "PasteAlert" ADD COLUMN     "reviewedAt" TIMESTAMPTZ,
ADD COLUMN     "reviewedByMembershipId" TEXT;

-- AddForeignKey
ALTER TABLE "PasteAlert" ADD CONSTRAINT "PasteAlert_reviewedByMembershipId_fkey" FOREIGN KEY ("reviewedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- Validate without holding the stronger lock required by a fully validated
-- ADD CONSTRAINT across the existing PasteAlert table.
ALTER TABLE "PasteAlert" VALIDATE CONSTRAINT "PasteAlert_reviewedByMembershipId_fkey";
