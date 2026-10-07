SET lock_timeout = '5s';

-- Additive migration: nullable email, optional username (handle), email verification timestamp.
-- Rollback note:
--   prisma migrate resolve --rolled-back 20261007193000_user_handle_accounts
--   Then deploy prior migration. Columns remain harmless if left in place on rollback deploy.
--   To fully revert schema manually (only if no handle-only users exist):
--     ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_or_username_check";
--     ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_lowercase_check";
--     DROP INDEX IF EXISTS "User_username_key";
--     ALTER TABLE "User" DROP COLUMN IF EXISTS "mustChangePassword";
--     ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerifiedAt";
--     ALTER TABLE "User" DROP COLUMN IF EXISTS "username";
--     ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ(6);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_username_lowercase_check"
    CHECK ("username" IS NULL OR "username" = lower("username"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_email_or_username_check"
    CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
