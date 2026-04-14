-- Backfill DocumentVersion rows into DocumentRevision
INSERT INTO "DocumentRevision" (id, "createdAt", "documentId", html, text, trigger)
SELECT id, "createdAt", "documentId", html, text, 'imported-version'
FROM "DocumentVersion"
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentRevision" r WHERE r.id = "DocumentVersion".id
);

-- DropForeignKey
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "DocumentVersion_documentId_fkey";

-- AlterTable
ALTER TABLE "Grade" DROP COLUMN "essayTitle";

-- DropTable
DROP TABLE "DocumentVersion";
