SET lock_timeout = '5s';

-- One link to a student, family, sub or admin page for a lesson (stack page
-- redesign: Post to your class, Send this lesson). Only a hash of the token
-- is stored; a link can be revoked.
CREATE TABLE "LessonShareLink" (
  "id"             TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"      TIMESTAMPTZ(6),
  "expiresAt"      TIMESTAMPTZ(6),
  "tokenHash"      TEXT NOT NULL,
  "audience"       TEXT NOT NULL,
  "includes"       JSONB NOT NULL,
  "note"           TEXT,
  "body"           TEXT,
  "conversationId" TEXT NOT NULL,

  CONSTRAINT "LessonShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LessonShareLink_tokenHash_key" ON "LessonShareLink" ("tokenHash");
CREATE INDEX "LessonShareLink_conversationId_idx" ON "LessonShareLink" ("conversationId");

ALTER TABLE "LessonShareLink"
  ADD CONSTRAINT "LessonShareLink_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "LessonPlanConversation" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
