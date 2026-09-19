-- Key an artifact by what it IS, not by which reply produced it, so a revised
-- handout takes the old one's place in the packet instead of piling up beside
-- it. Existing rows are backfilled from their own id, which is unique and
-- keeps every currently-filed material exactly where it is.
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "slot" TEXT;

UPDATE "LessonPlanMaterial" SET "slot" = "kind" || ':' || "id" WHERE "slot" IS NULL;

ALTER TABLE "LessonPlanMaterial" ALTER COLUMN "slot" SET NOT NULL;

-- Provenance stays as an index: the chat still asks "is this block filed?".
DROP INDEX IF EXISTS "LessonPlanMaterial_conversationId_sourceMessageId_blockKey_key";
CREATE INDEX "LessonPlanMaterial_conversationId_sourceMessageId_blockKey_idx"
  ON "LessonPlanMaterial" ("conversationId", "sourceMessageId", "blockKey");

CREATE UNIQUE INDEX "LessonPlanMaterial_conversationId_slot_key"
  ON "LessonPlanMaterial" ("conversationId", "slot");
