-- Student-uploaded figures embedded in a document (GBA 300 expansion report and,
-- later, any assignment type that opts in).
CREATE TABLE "DocumentImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "altText" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "blob" BYTEA NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "DocumentImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentImage_documentId_idx" ON "DocumentImage"("documentId");

ALTER TABLE "DocumentImage"
    ADD CONSTRAINT "DocumentImage_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
