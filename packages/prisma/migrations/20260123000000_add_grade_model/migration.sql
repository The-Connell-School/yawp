-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" TEXT,
    "feedback" TEXT,
    "releasedAt" TIMESTAMPTZ(6),
    "snapshotId" TEXT NOT NULL,
    "gradedById" TEXT NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grade_snapshotId_key" ON "Grade"("snapshotId");

-- CreateIndex
CREATE INDEX "Grade_snapshotId_idx" ON "Grade"("snapshotId");

-- CreateIndex
CREATE INDEX "Grade_gradedById_idx" ON "Grade"("gradedById");

-- CreateIndex
CREATE INDEX "Grade_releasedAt_idx" ON "Grade"("releasedAt");

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DocumentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
