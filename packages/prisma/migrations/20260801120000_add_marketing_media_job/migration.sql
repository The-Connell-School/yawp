-- CreateTable
CREATE TABLE "MarketingMediaJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "audience" TEXT,
    "subjectType" TEXT NOT NULL DEFAULT 'FEATURE',
    "subjectId" TEXT,
    "subjectLabel" TEXT,
    "storyboard" JSONB,
    "model" TEXT,
    "targetUrl" TEXT,
    "outputs" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMPTZ(6),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "MarketingMediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingMediaJob_status_createdAt_idx" ON "MarketingMediaJob"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketingMediaJob_createdById_idx" ON "MarketingMediaJob"("createdById");

-- AddForeignKey
ALTER TABLE "MarketingMediaJob" ADD CONSTRAINT "MarketingMediaJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
