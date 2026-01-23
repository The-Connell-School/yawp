-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" TEXT,
    "feedback" TEXT,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMPTZ(6),
    "documentId" TEXT NOT NULL,
    "gradedById" TEXT NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grade_documentId_key" ON "Grade"("documentId");

-- CreateIndex
CREATE INDEX "Grade_documentId_idx" ON "Grade"("documentId");

-- CreateIndex
CREATE INDEX "Grade_gradedById_idx" ON "Grade"("gradedById");

-- CreateIndex
CREATE INDEX "Grade_isReleased_idx" ON "Grade"("isReleased");

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
