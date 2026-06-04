-- Add grading assistant template management and AssignmentType linking.
-- Backward compatible: existing submissions stay unchanged; new provenance rows
-- are written only when the grading assistant runs.

ALTER TABLE "AssignmentType" ADD COLUMN "kind" TEXT;

CREATE UNIQUE INDEX "AssignmentType_kind_key" ON "AssignmentType"("kind");
CREATE INDEX "AssignmentType_kind_idx" ON "AssignmentType"("kind");

UPDATE "AssignmentType"
SET "kind" = 'free_write'
WHERE "id" = 'cfreewrite0000000000000000'
  AND "kind" IS NULL;

UPDATE "AssignmentType"
SET "kind" = 'thesis_driven_essay'
WHERE "id" = (
  SELECT "id"
  FROM "AssignmentType"
  WHERE "kind" IS NULL
    AND "ownerOrgId" IS NULL
    AND "ownerTeacherId" IS NULL
    AND LOWER("title") = 'critical essay'
  ORDER BY "position" ASC, "createdAt" ASC, "id" ASC
  LIMIT 1
);

UPDATE "AssignmentType"
SET "kind" = 'daily_pages'
WHERE "id" = (
  SELECT "id"
  FROM "AssignmentType"
  WHERE "kind" IS NULL
    AND "ownerOrgId" IS NULL
    AND "ownerTeacherId" IS NULL
    AND LOWER("title") = 'daily pages'
  ORDER BY "position" ASC, "createdAt" ASC, "id" ASC
  LIMIT 1
);

UPDATE "AssignmentType"
SET "kind" = 'act_writing'
WHERE "id" = (
  SELECT "id"
  FROM "AssignmentType"
  WHERE "kind" IS NULL
    AND "ownerOrgId" IS NULL
    AND "ownerTeacherId" IS NULL
    AND LOWER("title") = 'act writing'
  ORDER BY "position" ASC, "createdAt" ASC, "id" ASC
  LIMIT 1
);

CREATE TABLE "GradingAssistantTemplate" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "assignmentTypeKind" TEXT,
  "scoringScale" JSONB NOT NULL,
  "rubricJson" JSONB NOT NULL,
  "promptConfigJson" JSONB NOT NULL,
  "outputSchemaJson" JSONB NOT NULL,
  "calibrationNotes" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "GradingAssistantTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradingAssistantTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Profile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GradingAssistantTemplate_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "Profile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GradingAssistantTemplate_slug_key"
  ON "GradingAssistantTemplate"("slug");
CREATE INDEX "GradingAssistantTemplate_status_idx"
  ON "GradingAssistantTemplate"("status");
CREATE INDEX "GradingAssistantTemplate_assignmentTypeKind_idx"
  ON "GradingAssistantTemplate"("assignmentTypeKind");
CREATE INDEX "GradingAssistantTemplate_createdById_idx"
  ON "GradingAssistantTemplate"("createdById");
CREATE INDEX "GradingAssistantTemplate_updatedById_idx"
  ON "GradingAssistantTemplate"("updatedById");

CREATE TABLE "AssignmentTypeGradingAssistant" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "assignmentTypeId" TEXT NOT NULL,
  "gradingAssistantTemplateId" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT TRUE,
  "activeFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "activeTo" TIMESTAMPTZ(6),
  CONSTRAINT "AssignmentTypeGradingAssistant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssignmentTypeGradingAssistant_assignmentTypeId_fkey"
    FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssignmentTypeGradingAssistant_gradingAssistantTemplateId_fkey"
    FOREIGN KEY ("gradingAssistantTemplateId") REFERENCES "GradingAssistantTemplate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AssignmentTypeGradingAssistant_assignmentTypeId_isDefault_activeFrom_idx"
  ON "AssignmentTypeGradingAssistant"("assignmentTypeId", "isDefault", "activeFrom");
CREATE INDEX "AssignmentTypeGradingAssistant_gradingAssistantTemplateId_idx"
  ON "AssignmentTypeGradingAssistant"("gradingAssistantTemplateId");
CREATE INDEX "AssignmentTypeGradingAssistant_activeTo_idx"
  ON "AssignmentTypeGradingAssistant"("activeTo");
CREATE UNIQUE INDEX "AssignmentTypeGradingAssistant_one_active_default_idx"
  ON "AssignmentTypeGradingAssistant"("assignmentTypeId")
  WHERE "isDefault" = TRUE AND "activeTo" IS NULL;

CREATE TABLE "SubmissionGradingAssistantRun" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "submissionId" TEXT NOT NULL,
  "gradingAssistantTemplateId" TEXT,
  "templateVersion" INTEGER,
  "source" TEXT NOT NULL,
  "model" TEXT,
  "status" TEXT NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "SubmissionGradingAssistantRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionGradingAssistantRun_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubmissionGradingAssistantRun_gradingAssistantTemplateId_fkey"
    FOREIGN KEY ("gradingAssistantTemplateId") REFERENCES "GradingAssistantTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SubmissionGradingAssistantRun_submissionId_createdAt_idx"
  ON "SubmissionGradingAssistantRun"("submissionId", "createdAt" DESC);
CREATE INDEX "SubmissionGradingAssistantRun_gradingAssistantTemplateId_idx"
  ON "SubmissionGradingAssistantRun"("gradingAssistantTemplateId");
CREATE INDEX "SubmissionGradingAssistantRun_status_idx"
  ON "SubmissionGradingAssistantRun"("status");

INSERT INTO "GradingAssistantTemplate" (
  "id",
  "name",
  "slug",
  "status",
  "version",
  "assignmentTypeKind",
  "scoringScale",
  "rubricJson",
  "promptConfigJson",
  "outputSchemaJson",
  "calibrationNotes"
) VALUES (
  'gait_thesis_current_v1',
  'Thesis-driven essay grading assistant',
  'thesis-driven-essay-current',
  'active',
  1,
  'thesis_driven_essay',
  $${
    "type": "weighted_1_5",
    "minScore": 1,
    "maxScore": 5
  }$$::jsonb,
  $${
    "categories": [
      {
        "key": "thesis_and_content",
        "label": "Thesis/Content",
        "description": "Original, defensible thesis with sustained critical thinking and meaningful deductions.",
        "weight": 0.25
      },
      {
        "key": "organization_and_structure",
        "label": "Organization/Structure",
        "description": "Purposeful structure with strong progression, clear transitions, and a conclusion that extends thinking.",
        "weight": 0.25
      },
      {
        "key": "evidence_and_support",
        "label": "Evidence/Support",
        "description": "Precise, well-integrated evidence that deepens analysis and builds authority.",
        "weight": 0.2
      },
      {
        "key": "voice_and_style",
        "label": "Voice/Style",
        "description": "Authentic voice with engaging, precise language and consistent tone.",
        "weight": 0.2
      },
      {
        "key": "grammar_and_mechanics",
        "label": "Grammar/Syntax/Formatting",
        "description": "Technical correctness and polished presentation that support clarity.",
        "weight": 0.1
      }
    ]
  }$$::jsonb,
  $${
    "instructionsPreset": "legacy_thesis_driven_essay"
  }$$::jsonb,
  $${
    "schemaVersion": 1,
    "responseShape": "categories_overall_comment"
  }$$::jsonb,
  'Represents the pre-existing Yawp thesis-driven essay grading assistant path.'
), (
  'gait_act_writing_v1',
  'ACT Writing four-domain grading assistant',
  'act-writing-four-domain',
  'active',
  1,
  'act_writing',
  $${
    "type": "act_writing_2_12",
    "minScore": 1,
    "maxScore": 6,
    "compositeMin": 2,
    "compositeMax": 12
  }$$::jsonb,
  $${
    "categories": [
      {
        "key": "ideas_and_analysis",
        "label": "Ideas and Analysis",
        "description": "Evaluate the clarity of the writer's perspective and analysis of the relationships among perspectives.",
        "weight": 0.25
      },
      {
        "key": "development_and_support",
        "label": "Development and Support",
        "description": "Evaluate how well claims are developed with reasoning, examples, and implications.",
        "weight": 0.25
      },
      {
        "key": "organization",
        "label": "Organization",
        "description": "Evaluate purposeful sequencing, paragraphing, transitions, and control of the response.",
        "weight": 0.25
      },
      {
        "key": "language_use_and_conventions",
        "label": "Language Use and Conventions",
        "description": "Evaluate word choice, sentence control, grammar, usage, and mechanics as they affect clarity.",
        "weight": 0.25
      }
    ]
  }$$::jsonb,
  $${
    "systemInstructions": "Grade this as ACT Writing with four rubric domains. Do not use thesis-driven essay categories. Give concise retrospective feedback for each ACT domain.",
    "rubricInstructions": "Score the four ACT Writing domains independently. Focus first on Ideas and Analysis and Development and Support. Language Use and Conventions matters when errors impede clarity.",
    "scoreInstructions": "Scores must be integers 1-6 for each ACT domain. The app converts the average domain score to a 2-12 ACT-style composite for display."
  }$$::jsonb,
  $${
    "schemaVersion": 1,
    "responseShape": "categories_overall_comment"
  }$$::jsonb,
  'Pilot ACT template. Canonical ACT rubric source and calibration set still need Brian/Kevin sign-off before recorded-grade rollout.'
);

INSERT INTO "AssignmentTypeGradingAssistant" (
  "id",
  "assignmentTypeId",
  "gradingAssistantTemplateId",
  "isDefault",
  "activeFrom"
)
SELECT
  'gatlink_thesis_current_' || md5("id"),
  "id",
  'gait_thesis_current_v1',
  TRUE,
  NOW()
FROM "AssignmentType"
WHERE "kind" = 'thesis_driven_essay'
ON CONFLICT DO NOTHING;

INSERT INTO "AssignmentTypeGradingAssistant" (
  "id",
  "assignmentTypeId",
  "gradingAssistantTemplateId",
  "isDefault",
  "activeFrom"
)
SELECT
  'gatlink_act_writing_' || md5("id"),
  "id",
  'gait_act_writing_v1',
  TRUE,
  NOW()
FROM "AssignmentType"
WHERE "kind" = 'act_writing'
ON CONFLICT DO NOTHING;
