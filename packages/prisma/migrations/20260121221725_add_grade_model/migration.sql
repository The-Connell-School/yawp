-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "feedback" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "releasedAt" TIMESTAMPTZ(6),
    "documentId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grade_documentId_key" ON "Grade"("documentId");

-- CreateIndex
CREATE INDEX "Grade_teacherProfileId_idx" ON "Grade"("teacherProfileId");

-- CreateIndex
CREATE INDEX "Grade_status_idx" ON "Grade"("status");

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
