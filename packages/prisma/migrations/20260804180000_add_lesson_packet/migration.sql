-- The teacher-facing name of the printable lesson packet. Null falls back to
-- the conversation title, so existing rows keep working untouched.
ALTER TABLE "LessonPlanConversation"
  ADD COLUMN "packetTitle" TEXT;

-- A reply the teacher kept for the packet, and who the printed section is for:
-- 'teacher' (a plan they read) or 'student' (a handout with writing space).
ALTER TABLE "LessonPlanMessage"
  ADD COLUMN "keptAt" TIMESTAMPTZ(6),
  ADD COLUMN "keptAudience" TEXT;

CREATE INDEX "LessonPlanMessage_conversationId_keptAt_idx"
  ON "LessonPlanMessage"("conversationId", "keptAt");
