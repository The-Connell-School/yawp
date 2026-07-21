ALTER TABLE "Organization"
  ADD COLUMN "writingFundamentalsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "classInsightsEnabled" BOOLEAN NOT NULL DEFAULT false;
