CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "key" TEXT NOT NULL,
  "scopeKind" TEXT NOT NULL DEFAULT 'global',
  "scopeId" TEXT NOT NULL DEFAULT '*',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_key_scopeKind_scopeId_key"
ON "FeatureFlag"("key", "scopeKind", "scopeId");

CREATE INDEX "FeatureFlag_key_enabled_idx"
ON "FeatureFlag"("key", "enabled");

CREATE INDEX "FeatureFlag_scopeKind_scopeId_idx"
ON "FeatureFlag"("scopeKind", "scopeId");

INSERT INTO "FeatureFlag" (
  "id",
  "key",
  "scopeKind",
  "scopeId",
  "enabled",
  "description"
) VALUES (
  'feature-flag-writing-practice-global',
  'writing_practice',
  'global',
  '*',
  false,
  'Controls access to the student writing lessons and practice prototype.'
);
