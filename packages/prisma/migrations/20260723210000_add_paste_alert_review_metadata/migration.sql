-- AlterTable
ALTER TABLE "PasteAlert" ADD COLUMN     "reviewedAt" TIMESTAMPTZ,
ADD COLUMN     "reviewedByMembershipId" TEXT;

-- AddForeignKey
ALTER TABLE "PasteAlert" ADD CONSTRAINT "PasteAlert_reviewedByMembershipId_fkey" FOREIGN KEY ("reviewedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
