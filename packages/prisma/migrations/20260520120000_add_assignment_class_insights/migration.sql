ALTER TABLE "Assignment"
  ADD COLUMN "classInsights" JSONB,
  ADD COLUMN "classInsightsGeneratedAt" TIMESTAMPTZ(6);
