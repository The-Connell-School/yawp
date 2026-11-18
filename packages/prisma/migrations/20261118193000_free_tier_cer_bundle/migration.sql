SET lock_timeout = '5s';

-- C-E-R library rubric (dev/preview seed; production row is left intact when present).
INSERT INTO "Rubric" ("id", "createdAt", "updatedAt", "name", "title", "schemaJson")
SELECT gen_random_uuid()::text, NOW(), NOW(), 'c-e-r', 'C-E-R', '{
  "name": "c-e-r",
  "title": "C-E-R",
  "scoringScale": {
    "type": "weighted_1_5",
    "minScore": 1,
    "maxScore": 5,
    "step": 1
  },
  "rubric": {
    "categories": [
      {
        "key": "claim",
        "label": "Claim",
        "weight": 0.34,
        "description": "A clear, arguable claim that answers the prompt and tells the reader what the student thinks."
      },
      {
        "key": "evidence",
        "label": "Evidence",
        "weight": 0.33,
        "description": "Specific evidence from the text or task that supports the claim and is explained, not just quoted."
      },
      {
        "key": "reasoning",
        "label": "Reasoning",
        "weight": 0.33,
        "description": "Analysis that connects the evidence to the claim and shows why it proves the point."
      }
    ]
  },
  "promptConfig": {
    "gradingInstructions": "Grade this C-E-R (Claim-Evidence-Reasoning) response on claim, evidence, and reasoning. Anchor your read in the assignment prompt when it is available. Reward clear thinking and specific support; do not expect full essay structure."
  },
  "outputSchema": {
    "responseShape": "categories_overall_comment",
    "schemaVersion": 1
  },
  "calibrationNotes": "C-E-R (Claim-Evidence-Reasoning): grade claim, evidence, and reasoning as distinct moves."
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "Rubric" WHERE "name" = 'c-e-r');

-- Link the production C-E-R assignment type to the bundle kind and library rubric.
UPDATE "AssignmentType" AS at
SET
  "kind" = 'claim_evidence_reasoning',
  "rubricId" = (SELECT "id" FROM "Rubric" WHERE "name" = 'c-e-r' LIMIT 1),
  "rubricJson" = NULL,
  "scoringScaleJson" = NULL,
  "gradingPromptConfigJson" = NULL,
  "gradingOutputSchemaJson" = NULL,
  "gradingCalibrationNotes" = NULL,
  "gradingAssistantVersion" = GREATEST(at."gradingAssistantVersion", 1) + 1,
  "updatedAt" = NOW()
WHERE at."kind" IS DISTINCT FROM 'claim_evidence_reasoning'
  AND (
    at."id" = 'cmwma1a58000301l3jqxcxr3j'
    OR lower(trim(at."title")) IN ('c-e-r', 'claim-evidence-reasoning', 'claim evidence reasoning')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentType" other
    WHERE other."kind" = 'claim_evidence_reasoning'
      AND other."id" <> at."id"
  );

-- New free classrooms get C-E-R at provisioning; this links existing free orgs.
INSERT INTO "OrganizationAssignmentType" ("organizationId", "assignmentTypeId")
SELECT o."id", t."id"
FROM "Organization" o
CROSS JOIN "AssignmentType" t
WHERE o."plan" = 'FREE_CLASSROOM'
  AND t."kind" = 'claim_evidence_reasoning'
ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING;
