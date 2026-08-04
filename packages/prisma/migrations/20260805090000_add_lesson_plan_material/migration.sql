-- One piece of teaching material lifted out of a planner reply into the lesson
-- packet, so a teacher can keep the handout without keeping the whole plan
-- around it. Purely additive: existing kept replies are untouched.
CREATE TABLE "LessonPlanMaterial" (
  "id"              TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conversationId"  TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "sourceCreatedAt" TIMESTAMPTZ(6) NOT NULL,
  "blockKey"        TEXT NOT NULL,
  "kind"            TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "audience"        TEXT NOT NULL,
  "content"         TEXT NOT NULL,

  CONSTRAINT "LessonPlanMaterial_pkey" PRIMARY KEY ("id")
);

-- Adding the same material twice is the same add.
CREATE UNIQUE INDEX "LessonPlanMaterial_conversationId_sourceMessageId_blockKey_key"
  ON "LessonPlanMaterial" ("conversationId", "sourceMessageId", "blockKey");

-- The packet reads in lesson order, not in the order the teacher clicked.
CREATE INDEX "LessonPlanMaterial_conversationId_sourceCreatedAt_idx"
  ON "LessonPlanMaterial" ("conversationId", "sourceCreatedAt");

ALTER TABLE "LessonPlanMaterial"
  ADD CONSTRAINT "LessonPlanMaterial_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "LessonPlanConversation" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
