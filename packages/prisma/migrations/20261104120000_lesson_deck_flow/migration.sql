SET lock_timeout = '5s';

-- Uploaded decks (Brian's review, Nov 4). Which planner reply carries the
-- deck made from an upload, so it is made once and filed into the stack; and
-- pictures a teacher adds in the slide editor, which belong to the lesson
-- rather than to an uploaded deck. Additive: existing pictures keep their
-- upload, and nothing reads the new columns with the flags off.
ALTER TABLE "LessonPlanUpload" ADD COLUMN IF NOT EXISTS "deckMessageId" TEXT;

ALTER TABLE "LessonPlanUploadPicture" ALTER COLUMN "uploadId" DROP NOT NULL;
ALTER TABLE "LessonPlanUploadPicture" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
CREATE INDEX IF NOT EXISTS "LessonPlanUploadPicture_conversationId_idx" ON "LessonPlanUploadPicture" ("conversationId");

DO $$ BEGIN
  ALTER TABLE "LessonPlanUploadPicture"
    ADD CONSTRAINT "LessonPlanUploadPicture_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "LessonPlanConversation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
