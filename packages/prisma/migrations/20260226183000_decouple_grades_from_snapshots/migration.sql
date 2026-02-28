-- Decouple grades from mandatory snapshot FK while keeping document ownership explicit.
ALTER TABLE "Grade"
ADD COLUMN "documentId" TEXT;

UPDATE "Grade" AS g
SET "documentId" = s."documentId"
FROM "DocumentSnapshot" AS s
WHERE g."snapshotId" = s."id";

ALTER TABLE "Grade"
ALTER COLUMN "documentId" SET NOT NULL,
ALTER COLUMN "snapshotId" DROP NOT NULL;

ALTER TABLE "Grade"
DROP CONSTRAINT "Grade_snapshotId_fkey";

ALTER TABLE "Grade"
ADD CONSTRAINT "Grade_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "DocumentSnapshot"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Grade"
ADD CONSTRAINT "Grade_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "Grade_documentId_idx" ON "Grade"("documentId");
