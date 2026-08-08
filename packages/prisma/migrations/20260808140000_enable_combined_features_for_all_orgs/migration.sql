-- Yawp Reporter, class insights (Class performance summary) and writing
-- practice shipped behind per-organization rollout gates that defaulted to
-- false, so no live organization ever saw them. They are now generally
-- available: turn them on for every existing organization and default them on
-- for organizations created from here on. The admin toggles stay in place so a
-- single organization can still be opted out.

ALTER TABLE "Organization" ALTER COLUMN "reporterEnabled" SET DEFAULT true;
ALTER TABLE "Organization" ALTER COLUMN "classInsightsEnabled" SET DEFAULT true;
ALTER TABLE "Organization" ALTER COLUMN "writingPracticeEnabled" SET DEFAULT true;

UPDATE "Organization"
SET
  "reporterEnabled" = true,
  "classInsightsEnabled" = true,
  "writingPracticeEnabled" = true
WHERE
  "reporterEnabled" = false
  OR "classInsightsEnabled" = false
  OR "writingPracticeEnabled" = false;
