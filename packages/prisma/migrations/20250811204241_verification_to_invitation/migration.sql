/*
  Warnings:

  - You are about to drop the `Verification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Verification" DROP CONSTRAINT "Verification_organizationId_fkey";

-- RenameTable
ALTER TABLE "Verification" RENAME TO "Invitation";

-- AddColumn
ALTER TABLE "Invitation" ADD COLUMN "schoolId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_target_type_key" ON "Invitation"("target", "type");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invitation" RENAME CONSTRAINT "Verification_pkey" TO "Invitation_pkey";
