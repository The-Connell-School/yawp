SET lock_timeout = '5s';

ALTER TABLE "LessonPlanUnit" DROP CONSTRAINT IF EXISTS "LessonPlanUnit_groupId_fkey";
ALTER TABLE "LessonPlanUnit" DROP CONSTRAINT IF EXISTS "LessonPlanUnit_courseId_fkey";
DROP INDEX IF EXISTS "LessonPlanUnit_courseId_idx";
ALTER TABLE "LessonPlanUnit" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "LessonPlanUnit" DROP COLUMN IF EXISTS "position";
ALTER TABLE "LessonPlanUnit" DROP COLUMN IF EXISTS "groupId";
ALTER TABLE "LessonPlanUnit" DROP COLUMN IF EXISTS "courseId";
DROP TABLE IF EXISTS "LessonPlanUnitGroup";
DROP TABLE IF EXISTS "LessonPlanCourse";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "originalTitle";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "teacherNotes";
DROP TABLE IF EXISTS "GoogleDriveGrant";
DROP TABLE IF EXISTS "LessonPlanAssignmentLink";
