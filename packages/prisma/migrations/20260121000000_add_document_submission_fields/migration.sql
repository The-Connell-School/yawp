-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "submittedAt" TIMESTAMPTZ(6),
ADD COLUMN     "submittedSnapshotId" TEXT;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_submittedSnapshotId_fkey" FOREIGN KEY ("submittedSnapshotId") REFERENCES "DocumentSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
