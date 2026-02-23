-- AlterTable
ALTER TABLE "DocumentSnapshot"
ADD COLUMN "submittedAt" TIMESTAMPTZ(6),
ADD COLUMN "archivedAt" TIMESTAMPTZ(6);

-- Backfill existing submission snapshots:
-- 1) any snapshot currently referenced as the document's submitted snapshot
-- 2) any snapshot that already has a grade
UPDATE "DocumentSnapshot" ds
SET "submittedAt" = COALESCE(ds."submittedAt", ds."createdAt")
WHERE ds."id" IN (
    SELECT DISTINCT d."submittedSnapshotId"
    FROM "Document" d
    WHERE d."submittedSnapshotId" IS NOT NULL
  )
  OR ds."id" IN (
    SELECT DISTINCT g."snapshotId"
    FROM "Grade" g
  );

-- Index for submission queue lookups
CREATE INDEX "DocumentSnapshot_submittedAt_archivedAt_idx"
ON "DocumentSnapshot"("submittedAt", "archivedAt");
