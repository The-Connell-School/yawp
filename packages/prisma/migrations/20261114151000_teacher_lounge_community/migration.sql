SET lock_timeout = '5s';

-- Additive: Teacher's Lounge community board (feature flag teacher_lounge_community).
-- New enums and tables only; nothing existing is altered.
-- Rollback: prisma migrate resolve --rolled-back 20261013120000_teacher_lounge_community
-- Forward recovery after lock timeout: same resolve rolled-back, then migrate deploy.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LoungePostKind" AS ENUM ('QUESTION', 'SHARE', 'WIN');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LoungeDisplayNameStyle" AS ENUM ('FULL_NAME', 'FIRST_NAME_LAST_INITIAL', 'FIRST_NAME_ONLY');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LoungeStaffStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LoungePostVisibility" AS ENUM ('COMMUNITY', 'STAFF_ONLY');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeProfile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "displayNameStyle" "LoungeDisplayNameStyle" NOT NULL DEFAULT 'FIRST_NAME_LAST_INITIAL',
    "guidelinesAcceptedAt" TIMESTAMPTZ(6) NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LoungeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungePost" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "kind" "LoungePostKind" NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "LoungePostVisibility" NOT NULL DEFAULT 'COMMUNITY',
    "staffStatus" "LoungeStaffStatus",
    "staffRequestedAt" TIMESTAMPTZ(6),
    "staffAnsweredAt" TIMESTAMPTZ(6),
    "hiddenAt" TIMESTAMPTZ(6),
    "hiddenByUserId" TEXT,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "LoungePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeReply" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "body" TEXT NOT NULL,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "videoUrl" TEXT,
    "hiddenAt" TIMESTAMPTZ(6),
    "hiddenByUserId" TEXT,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "LoungeReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeVote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "replyId" TEXT,

    CONSTRAINT "LoungeVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeMention" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "replyId" TEXT,
    "mentionedUserId" TEXT NOT NULL,
    "mentionedByUserId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMPTZ(6),

    CONSTRAINT "LoungeMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoungeReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reporterUserId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "replyId" TEXT,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedByUserId" TEXT,
    "resolution" TEXT,

    CONSTRAINT "LoungeReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoungeProfile_userId_key" ON "LoungeProfile"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungePost_createdAt_idx" ON "LoungePost"("createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungePost_staffStatus_staffRequestedAt_idx" ON "LoungePost"("staffStatus", "staffRequestedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungePost_authorUserId_idx" ON "LoungePost"("authorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungePost_topic_createdAt_idx" ON "LoungePost"("topic", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeReply_postId_createdAt_idx" ON "LoungeReply"("postId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeReply_authorUserId_idx" ON "LoungeReply"("authorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeVote_postId_idx" ON "LoungeVote"("postId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeVote_replyId_idx" ON "LoungeVote"("replyId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoungeVote_userId_postId_key" ON "LoungeVote"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoungeVote_userId_replyId_key" ON "LoungeVote"("userId", "replyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeMention_mentionedUserId_createdAt_idx" ON "LoungeMention"("mentionedUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeMention_postId_idx" ON "LoungeMention"("postId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeReport_resolvedAt_createdAt_idx" ON "LoungeReport"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungeReport_postId_idx" ON "LoungeReport"("postId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeProfile" ADD CONSTRAINT "LoungeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungePost" ADD CONSTRAINT "LoungePost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungePost" ADD CONSTRAINT "LoungePost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeReply" ADD CONSTRAINT "LoungeReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LoungePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeReply" ADD CONSTRAINT "LoungeReply_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeReply" ADD CONSTRAINT "LoungeReply_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeVote" ADD CONSTRAINT "LoungeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeVote" ADD CONSTRAINT "LoungeVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LoungePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeVote" ADD CONSTRAINT "LoungeVote_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "LoungeReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeMention" ADD CONSTRAINT "LoungeMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LoungePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeMention" ADD CONSTRAINT "LoungeMention_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "LoungeReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeMention" ADD CONSTRAINT "LoungeMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeMention" ADD CONSTRAINT "LoungeMention_mentionedByUserId_fkey" FOREIGN KEY ("mentionedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeReport" ADD CONSTRAINT "LoungeReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeReport" ADD CONSTRAINT "LoungeReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LoungePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeReport" ADD CONSTRAINT "LoungeReport_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "LoungeReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoungeReport" ADD CONSTRAINT "LoungeReport_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- A helpful vote targets exactly one post or one reply.
DO $$ BEGIN
  ALTER TABLE "LoungeVote" ADD CONSTRAINT "LoungeVote_exactly_one_target"
    CHECK (("postId" IS NULL) <> ("replyId" IS NULL));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

RESET lock_timeout;
