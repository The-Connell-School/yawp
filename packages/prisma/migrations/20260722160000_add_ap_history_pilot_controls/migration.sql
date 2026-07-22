-- Additive, default-off AP History pilot controls.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "apHistoryPdfImportEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Generic assignment-level tutor policy. Existing assignments stay tutor-on.
ALTER TABLE "Assignment"
  ADD COLUMN IF NOT EXISTS "tutorEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Durable start point for the AP History pacing timer.
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "apHistoryTimerStartedAt" TIMESTAMPTZ(6);

-- Rights metadata is copied into immutable snapshot v2 at assignment creation.
ALTER TABLE "ApHistoryPromptLibrarySource"
  ADD COLUMN IF NOT EXISTS "licenseName" TEXT,
  ADD COLUMN IF NOT EXISTS "licenseUrl" TEXT;

COMMENT ON COLUMN "Organization"."apHistoryPdfImportEnabled" IS
  'Default-off tenant gate for AP History public-domain PDF import.';
COMMENT ON COLUMN "Assignment"."tutorEnabled" IS
  'Server-enforced assignment-level tutor availability; defaults on for compatibility.';
COMMENT ON COLUMN "Document"."apHistoryTimerStartedAt" IS
  'Idempotent persisted start time for the AP History pacing timer.';
