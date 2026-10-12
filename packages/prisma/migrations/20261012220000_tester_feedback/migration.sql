ALTER TABLE "User" ADD COLUMN "isTester" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TesterFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "userAgent" VARCHAR(1000) NOT NULL,
  "whatIDid" VARCHAR(4000) NOT NULL,
  "whatHappened" VARCHAR(4000) NOT NULL,
  "whatIWish" VARCHAR(4000) NOT NULL,
  "severity" VARCHAR(20),
  "environment" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TesterFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TesterFeedback_severity_check" CHECK ("severity" IS NULL OR "severity" IN ('low', 'medium', 'high')),
  CONSTRAINT "TesterFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TesterFeedback_createdAt_id_idx" ON "TesterFeedback"("createdAt", "id");
CREATE INDEX "TesterFeedback_userId_createdAt_idx" ON "TesterFeedback"("userId", "createdAt");
CREATE INDEX "TesterFeedback_environment_createdAt_idx" ON "TesterFeedback"("environment", "createdAt");
