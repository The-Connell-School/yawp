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

UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "email" IS NOT NULL AND "emailVerifiedAt" IS NULL;

ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "studentJoinToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Class_studentJoinToken_key" ON "Class"("studentJoinToken");

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "Class" c
SET "studentJoinToken" = replace(
  replace(
    replace(encode(gen_random_bytes(18), 'base64'), '/', '_'),
    '+',
    '-'
  ),
  '=',
  ''
)
FROM "School" s
JOIN "Organization" o ON s."organizationId" = o.id
WHERE c."schoolId" = s.id
  AND o.plan = 'FREE_CLASSROOM'
  AND c."studentJoinToken" IS NULL;
