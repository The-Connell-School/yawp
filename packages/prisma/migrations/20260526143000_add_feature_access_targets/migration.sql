-- Add narrow rollout targets for feature pilots without removing existing
-- org/school Setting allowlists.
CREATE TABLE "FeatureAccessTarget" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featureKey" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(6),
    "note" TEXT,

    CONSTRAINT "FeatureAccessTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureAccessTarget_featureKey_targetKind_targetId_key"
    ON "FeatureAccessTarget"("featureKey", "targetKind", "targetId");

CREATE INDEX "FeatureAccessTarget_targetKind_targetId_idx"
    ON "FeatureAccessTarget"("targetKind", "targetId");

CREATE INDEX "FeatureAccessTarget_featureKey_enabled_idx"
    ON "FeatureAccessTarget"("featureKey", "enabled");

CREATE INDEX "FeatureAccessTarget_expiresAt_idx"
    ON "FeatureAccessTarget"("expiresAt");
