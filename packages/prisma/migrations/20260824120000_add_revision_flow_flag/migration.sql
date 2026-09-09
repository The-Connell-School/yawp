BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Additive rollout gate for the student split-screen revision flow.
-- Off by default: every existing organization keeps the legacy
-- "Revise Essay" -> /app/documents/:id?revise=1 path until the new flow has
-- been verified in production.
ALTER TABLE "Organization"
ADD COLUMN "revisionFlowEnabled" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
