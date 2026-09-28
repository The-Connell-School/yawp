-- Add per-organization AP History rollout flag
ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "apHistoryEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

