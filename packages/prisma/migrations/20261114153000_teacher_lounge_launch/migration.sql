SET lock_timeout = '5s';

-- Additive, for the Faculty Lounge launch: optional share consent, drafts and
-- scheduled posts, edit timestamps, stable keys for seeded launch content, and
-- Contact Us messages. New nullable/defaulted columns and one new table only.
-- Rollback: prisma migrate resolve --rolled-back 20261016200000_teacher_lounge_launch

-- AlterTable
ALTER TABLE "LoungePost" ADD COLUMN IF NOT EXISTS "draft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "seedKey" TEXT;

-- AlterTable
ALTER TABLE "LoungeProfile" ADD COLUMN IF NOT EXISTS "shareConsentAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "LoungeReply" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "seedKey" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeContactMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedByUserId" TEXT,

    CONSTRAINT "LoungeContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeContactMessage_resolvedAt_createdAt_idx" ON "LoungeContactMessage"("resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoungePost_seedKey_key" ON "LoungePost"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoungeReply_seedKey_key" ON "LoungeReply"("seedKey");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeContactMessage" ADD CONSTRAINT "LoungeContactMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

RESET lock_timeout;
