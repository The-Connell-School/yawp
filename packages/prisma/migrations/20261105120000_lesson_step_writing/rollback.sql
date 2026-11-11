SET lock_timeout = '5s';

-- A teacher's calls on writing go with the rollback; Yawp! decides again.
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "writing";
