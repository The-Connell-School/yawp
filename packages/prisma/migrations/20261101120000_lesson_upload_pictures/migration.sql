SET lock_timeout = '5s';

-- The teacher's own decks (Nov 1): an uploaded PowerPoint is kept whole while
-- it is attached to a lesson, with what the teacher wants from it (teach it
-- as is, or refresh it into a Yawp! deck) and its pictures. Additive only:
-- the text column is still written for every upload.
ALTER TABLE "LessonPlanUpload" ADD COLUMN IF NOT EXISTS "file" BYTEA;
ALTER TABLE "LessonPlanUpload" ADD COLUMN IF NOT EXISTS "keptDeck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LessonPlanUpload" ADD COLUMN IF NOT EXISTS "mode" TEXT;

CREATE TABLE IF NOT EXISTS "LessonPlanUploadPicture" (
  "id"           TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadId"     TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "position"     INTEGER NOT NULL,
  "slideNumbers" INTEGER[],
  "altText"      TEXT NOT NULL,
  "contentType"  TEXT NOT NULL,
  "byteSize"     INTEGER NOT NULL,
  "width"        INTEGER,
  "height"       INTEGER,
  "blob"         BYTEA NOT NULL,

  CONSTRAINT "LessonPlanUploadPicture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LessonPlanUploadPicture_uploadId_idx" ON "LessonPlanUploadPicture" ("uploadId");
CREATE INDEX IF NOT EXISTS "LessonPlanUploadPicture_membershipId_idx" ON "LessonPlanUploadPicture" ("membershipId");

DO $$ BEGIN
  ALTER TABLE "LessonPlanUploadPicture"
    ADD CONSTRAINT "LessonPlanUploadPicture_uploadId_fkey"
    FOREIGN KEY ("uploadId") REFERENCES "LessonPlanUpload" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
