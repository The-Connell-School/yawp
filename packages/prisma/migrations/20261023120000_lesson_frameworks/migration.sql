SET lock_timeout = '5s';

-- Brian's run 5 (round 2): a week's shape, kept. A unit remembers the
-- framework its day lessons came from (each day's title and steps, and the
-- reply they were made from); a template can hold a whole week's framework.
ALTER TABLE "LessonPlanUnit" ADD COLUMN IF NOT EXISTS "framework" JSONB;
ALTER TABLE "LessonPlanTemplate" ADD COLUMN IF NOT EXISTS "days" JSONB;
