SET lock_timeout = '5s';

-- Handle + password free-tier student accounts (sorts after 20261008001200).
-- Idempotent: safe on preview DBs that partially applied an older migration name.
--
-- Rollback (production has NOT applied a later migration that depends on these columns):
--   1. Stop app traffic.
--   2. psql $DATABASE_URL -c 'ALTER TABLE "Class" DROP COLUMN IF EXISTS "studentJoinToken";'
--   3. psql $DATABASE_URL -c 'ALTER TABLE "Invitation" DROP COLUMN IF EXISTS "studentClassId";'
--   4. psql $DATABASE_URL -c 'ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_or_username_check";'
--   5. psql $DATABASE_URL -c 'ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_lowercase_check";'
--   6. psql $DATABASE_URL -c 'DROP INDEX IF EXISTS "User_username_key";'
--   7. psql $DATABASE_URL -c 'ALTER TABLE "User" DROP COLUMN IF EXISTS "mustChangePassword";'
--   8. psql $DATABASE_URL -c 'ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerifiedAt";'
--   9. psql $DATABASE_URL -c 'ALTER TABLE "User" DROP COLUMN IF EXISTS "username";'
--  10. Backfill NULL emails before NOT NULL (only if no handle-only users remain):
--      UPDATE "User" SET email = username || '@invalid.local' WHERE email IS NULL;
--  11. psql $DATABASE_URL -c 'ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;'
--  12. cd packages/prisma && bun prisma migrate resolve --rolled-back 20261008140000_user_handle_accounts

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

ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "studentJoinToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Class_studentJoinToken_key" ON "Class"("studentJoinToken");

UPDATE "Class" c
SET "studentJoinToken" = replace(gen_random_uuid()::text, '-', '')
FROM "School" s
JOIN "Organization" o ON s."organizationId" = o.id
WHERE c."schoolId" = s.id
  AND o.plan = 'FREE_CLASSROOM'
  AND c."studentJoinToken" IS NULL;

ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "studentClassId" TEXT;

CREATE INDEX IF NOT EXISTS "Invitation_type_studentClassId_idx"
  ON "Invitation" ("type", "studentClassId");
