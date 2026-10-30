SET lock_timeout = '5s';

ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "extensionStepIds";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "deckStackKey";
ALTER TABLE "LessonPlanMessage" DROP COLUMN IF EXISTS "displayText";
