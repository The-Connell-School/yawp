-- Move grading/rubric configuration toward AssignmentType ownership.
-- This migration intentionally keeps GradingAssistantTemplate and
-- AssignmentTypeGradingAssistant in place while runtime/UI cut over.

BEGIN;

ALTER TABLE "AssignmentType"
  ADD COLUMN "scoringScaleJson" JSONB,
  ADD COLUMN "rubricJson" JSONB,
  ADD COLUMN "gradingPromptConfigJson" JSONB,
  ADD COLUMN "gradingOutputSchemaJson" JSONB,
  ADD COLUMN "gradingCalibrationNotes" TEXT,
  ADD COLUMN "gradingAssistantVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "gradingAssistantSourceTemplateId" TEXT,
  ADD COLUMN "gradingAssistantSourceTemplateSlug" TEXT;

ALTER TABLE "AssignmentModule"
  ADD COLUMN "rubricAlignmentJson" JSONB;

ALTER TABLE "SubmissionGradingAssistantRun"
  ADD COLUMN "assignmentTypeId" TEXT,
  ADD COLUMN "assignmentTypeGradingVersion" INTEGER,
  ADD COLUMN "assignmentTypeRubricSnapshot" JSONB,
  ADD COLUMN "assignmentTypePromptConfigSnapshot" JSONB;

CREATE INDEX "SubmissionGradingAssistantRun_assignmentTypeId_idx"
  ON "SubmissionGradingAssistantRun"("assignmentTypeId");

-- If more than one active default link exists for an assignment type, the
-- newest activeFrom/createdAt row wins. Audit duplicates with:
--
-- SELECT "assignmentTypeId", count(*)
-- FROM "AssignmentTypeGradingAssistant"
-- WHERE "activeTo" IS NULL AND "isDefault" = true
-- GROUP BY "assignmentTypeId"
-- HAVING count(*) > 1;
WITH ranked_active_defaults AS (
  SELECT
    link."assignmentTypeId",
    template."id" AS "templateId",
    template."slug" AS "templateSlug",
    template."scoringScale",
    template."rubricJson",
    template."promptConfigJson",
    template."outputSchemaJson",
    template."calibrationNotes",
    ROW_NUMBER() OVER (
      PARTITION BY link."assignmentTypeId"
      ORDER BY link."activeFrom" DESC, link."createdAt" DESC, link."id" DESC
    ) AS rank
  FROM "AssignmentTypeGradingAssistant" link
  INNER JOIN "GradingAssistantTemplate" template
    ON template."id" = link."gradingAssistantTemplateId"
  WHERE link."activeTo" IS NULL
    AND link."isDefault" = true
    AND template."status" = 'active'
)
UPDATE "AssignmentType" assignment_type
SET
  "scoringScaleJson" = ranked."scoringScale",
  "rubricJson" = ranked."rubricJson",
  "gradingPromptConfigJson" = ranked."promptConfigJson",
  "gradingOutputSchemaJson" = ranked."outputSchemaJson",
  "gradingCalibrationNotes" = ranked."calibrationNotes",
  "gradingAssistantSourceTemplateId" = ranked."templateId",
  "gradingAssistantSourceTemplateSlug" = ranked."templateSlug"
FROM ranked_active_defaults ranked
WHERE assignment_type."id" = ranked."assignmentTypeId"
  AND ranked.rank = 1;

COMMIT;
