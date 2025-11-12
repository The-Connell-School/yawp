-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "PasteAlert" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "textLength" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "PasteAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasteAlert_documentId_createdAt_idx" ON "PasteAlert"("documentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PasteAlert_profileId_createdAt_idx" ON "PasteAlert"("profileId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PasteAlert" ADD CONSTRAINT "PasteAlert_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasteAlert" ADD CONSTRAINT "PasteAlert_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
