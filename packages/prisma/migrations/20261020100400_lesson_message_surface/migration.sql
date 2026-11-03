SET lock_timeout = '5s';

-- Where a planner turn was asked (stack page redesign): null is the planner
-- chat, 'stack' is a change asked for on the stack page, which the chat shows
-- as one compact line.
ALTER TABLE "LessonPlanMessage" ADD COLUMN "surface" TEXT;
