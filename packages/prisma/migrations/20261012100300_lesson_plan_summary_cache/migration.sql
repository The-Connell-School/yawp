SET lock_timeout = '5s';

-- Lesson Planner concise plan export (Brian's run 2, D1): the plan's short
-- summaries, written once per stack and reused until the stack changes.
-- Additive and nullable; nothing reads them unless
-- lesson_planner_plan_export_v2 is on.
ALTER TABLE "LessonPlanConversation" ADD COLUMN "planSummary" JSONB;
ALTER TABLE "LessonPlanConversation" ADD COLUMN "planSummaryKey" TEXT;
