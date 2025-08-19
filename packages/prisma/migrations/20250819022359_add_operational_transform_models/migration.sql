-- CreateTable
CREATE TABLE "DocumentOperation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT,
    "length" INTEGER,
    "batchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "DocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DocumentOperation_documentId_version_idx" ON "DocumentOperation"("documentId", "version");
CREATE INDEX "DocumentOperation_documentId_version_sequence_idx" ON "DocumentOperation"("documentId", "version", "sequence");

-- CreateIndex
CREATE INDEX "DocumentOperation_documentId_batchId_idx" ON "DocumentOperation"("documentId", "batchId");

-- CreateIndex
CREATE INDEX "DocumentSnapshot_documentId_version_idx" ON "DocumentSnapshot"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSnapshot_documentId_version_key" ON "DocumentSnapshot"("documentId", "version");

-- AddForeignKey
ALTER TABLE "DocumentOperation" ADD CONSTRAINT "DocumentOperation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
