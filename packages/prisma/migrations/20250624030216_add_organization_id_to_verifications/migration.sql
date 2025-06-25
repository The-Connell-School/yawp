/*
  Warnings:

  - You are about to drop the `AssistantConfiguration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AssistantMetadata` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Thread` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AssistantMetadata" DROP CONSTRAINT "AssistantMetadata_userId_fkey";

-- DropForeignKey
ALTER TABLE "Thread" DROP CONSTRAINT "Thread_assistantMetadataId_fkey";

-- AlterTable
ALTER TABLE "Verification" ADD COLUMN     "organizationId" TEXT;

-- DropTable
DROP TABLE "AssistantConfiguration";

-- DropTable
DROP TABLE "AssistantMetadata";

-- DropTable
DROP TABLE "Thread";

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
