SET lock_timeout = '5s';

DROP INDEX IF EXISTS "LessonPlanMaterial_conversationId_slot_key";
DROP INDEX IF EXISTS "LessonPlanMaterial_conversationId_sourceMessageId_blockKey_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "LessonPlanMaterial_conversationId_sourceMessageId_blockKey_key"
  ON "LessonPlanMaterial" ("conversationId", "sourceMessageId", "blockKey");
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "slot";
