-- Add a default-off organization rollout gate for teacher paste review.
ALTER TABLE "Organization"
ADD COLUMN "pasteActivityEnabled" BOOLEAN NOT NULL DEFAULT false;
