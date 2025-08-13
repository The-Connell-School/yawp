/*
  Warnings:

  - You are about to drop the column `organizationId` on the `User` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "_OrganizationToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OrganizationToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_OrganizationToUser_B_index" ON "_OrganizationToUser"("B");

-- AddForeignKey
ALTER TABLE "_OrganizationToUser" ADD CONSTRAINT "_OrganizationToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizationToUser" ADD CONSTRAINT "_OrganizationToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data from organizationId to the new many-to-many relationship
INSERT INTO "_OrganizationToUser" ("A", "B")
SELECT "organizationId", "id"
FROM "User"
WHERE "organizationId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "organizationId";
