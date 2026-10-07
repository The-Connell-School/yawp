SET lock_timeout = '5s';

-- A teacher-supplied name for a saved lesson resource. Null keeps the derived
-- title, so existing kept sections are unaffected.
ALTER TABLE "LessonPlanMessage"
  ADD COLUMN "keptTitle" TEXT;
