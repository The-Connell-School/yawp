SET lock_timeout = '5s';

-- Additive, for the Faculty Lounge's multi-select tags (post type, subject,
-- module or topic). Three defaulted array columns; `kind` and `topic` stay
-- and are still written, so older code and older posts keep working.
-- Rollback: prisma migrate resolve --rolled-back 20261111120000_teacher_lounge_post_tags

-- AlterTable
ALTER TABLE "LoungePost" ADD COLUMN IF NOT EXISTS "kinds" "LoungePostKind"[] DEFAULT ARRAY[]::"LoungePostKind"[],
ADD COLUMN IF NOT EXISTS "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoungePost_topics_idx" ON "LoungePost" USING GIN ("topics");
