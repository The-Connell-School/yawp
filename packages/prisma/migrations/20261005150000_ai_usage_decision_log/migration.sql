-- CreateTable
CREATE TABLE "AiUsageDecisionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "route" TEXT NOT NULL,
    "feature" TEXT,
    "decision" TEXT NOT NULL,
    "membershipId" TEXT,
    "organizationId" TEXT,
    "classId" TEXT,
    "ipHash" TEXT,
    "requestId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "providerStatus" TEXT,

    CONSTRAINT "AiUsageDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageDecisionLog_organizationId_createdAt_idx" ON "AiUsageDecisionLog"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiUsageDecisionLog_route_createdAt_idx" ON "AiUsageDecisionLog"("route", "createdAt" DESC);

