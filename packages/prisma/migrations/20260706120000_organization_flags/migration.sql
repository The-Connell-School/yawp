CREATE TABLE "OrganizationFlag" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "key" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  CONSTRAINT "OrganizationFlag_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrganizationFlag" (
  "id",
  "createdAt",
  "updatedAt",
  "key",
  "organizationId",
  "enabled",
  "description"
)
SELECT
  flag."id",
  flag."createdAt",
  flag."updatedAt",
  flag."key",
  flag."scopeId",
  flag."enabled",
  flag."description"
FROM "FeatureFlag" flag
INNER JOIN "Organization" org ON org."id" = flag."scopeId"
WHERE flag."scopeKind" = 'organization';

INSERT INTO "OrganizationFlag" (
  "id",
  "key",
  "organizationId",
  "enabled",
  "description"
)
SELECT
  'organization-flag-writing-practice-' || org."id",
  'writing_practice',
  org."id",
  false,
  'Enable writing practice lessons for this organization.'
FROM "Organization" org
WHERE NOT EXISTS (
  SELECT 1
  FROM "OrganizationFlag" flag
  WHERE flag."key" = 'writing_practice'
    AND flag."organizationId" = org."id"
);

DROP TABLE "FeatureFlag";

CREATE UNIQUE INDEX "OrganizationFlag_key_organizationId_key"
ON "OrganizationFlag"("key", "organizationId");

CREATE INDEX "OrganizationFlag_key_enabled_idx"
ON "OrganizationFlag"("key", "enabled");

CREATE INDEX "OrganizationFlag_organizationId_idx"
ON "OrganizationFlag"("organizationId");

ALTER TABLE "OrganizationFlag"
ADD CONSTRAINT "OrganizationFlag_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
