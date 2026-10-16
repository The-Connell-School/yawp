-- Null preserves admission wording for every existing/legacy application.
-- Only first creation under public onboarding v2 writes an explicit version.
ALTER TABLE "FreeTierApplication"
  ADD COLUMN "releaseEmailCopyVersion" VARCHAR(40);
