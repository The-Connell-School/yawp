-- CreateTable
CREATE TABLE "LlmLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER,
    "systemPrompt" TEXT,
    "messages" JSONB NOT NULL,
    "response" TEXT,
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "LlmLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmLog_createdAt_idx" ON "LlmLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "LlmLog_model_idx" ON "LlmLog"("model");

-- CreateIndex
CREATE INDEX "LlmLog_provider_idx" ON "LlmLog"("provider");
