-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "archivedAt" TIMESTAMPTZ(6);

UPDATE "Document" SET "archivedAt" = NOW();
