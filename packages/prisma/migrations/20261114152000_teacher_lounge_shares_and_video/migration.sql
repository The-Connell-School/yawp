SET lock_timeout = '5s';

-- Additive: Teacher's Lounge shares (frozen assignment snapshots), in-app
-- video on posts and replies, and pinned posts. Nullable columns and new
-- tables only; existing rows are untouched.
-- Rollback: prisma migrate resolve --rolled-back 20261016120000_teacher_lounge_shares_and_video

-- AlterTable
ALTER TABLE "LoungePost" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "pinnedByUserId" TEXT,
ADD COLUMN IF NOT EXISTS "videoContentType" TEXT,
ADD COLUMN IF NOT EXISTS "videoDurationSeconds" INTEGER,
ADD COLUMN IF NOT EXISTS "videoKey" TEXT,
ADD COLUMN IF NOT EXISTS "videoTitle" TEXT;

-- AlterTable
ALTER TABLE "LoungeReply" ADD COLUMN IF NOT EXISTS "videoContentType" TEXT,
ADD COLUMN IF NOT EXISTS "videoDurationSeconds" INTEGER,
ADD COLUMN IF NOT EXISTS "videoKey" TEXT,
ADD COLUMN IF NOT EXISTS "videoTitle" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT,
    "assignmentTypeId" TEXT NOT NULL,
    "assignmentTypeTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "settings" JSONB,

    CONSTRAINT "LoungeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeAttachmentUse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "LoungeAttachmentUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoungeAttachment_postId_key" ON "LoungeAttachment"("postId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoungeAttachmentUse_attachmentId_userId_key" ON "LoungeAttachmentUse"("attachmentId", "userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeAttachment" ADD CONSTRAINT "LoungeAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LoungePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeAttachmentUse" ADD CONSTRAINT "LoungeAttachmentUse_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "LoungeAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeAttachmentUse" ADD CONSTRAINT "LoungeAttachmentUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungePost_pinnedAt_idx" ON "LoungePost"("pinnedAt");

RESET lock_timeout;
