BEGIN;

ALTER TABLE "SubmissionGradingAssistantRun"
  DROP CONSTRAINT IF EXISTS "SubmissionGradingAssistantRun_gradingAssistantTemplateId_fkey";

DROP INDEX IF EXISTS "SubmissionGradingAssistantRun_gradingAssistantTemplateId_idx";

ALTER TABLE "SubmissionGradingAssistantRun"
  DROP COLUMN IF EXISTS "gradingAssistantTemplateId",
  DROP COLUMN IF EXISTS "templateVersion";

DROP TABLE IF EXISTS "AssignmentTypeGradingAssistant";
DROP TABLE IF EXISTS "GradingAssistantTemplate";

COMMIT;
