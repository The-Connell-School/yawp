SET lock_timeout = '5s';

SELECT set_config('yawp.rubric_revision_actor', 'migration:holistic-tier-hornbuckle', true);
SELECT set_config(
  'yawp.rubric_revision_reason',
  'Opt in Cristo Rey Hornbuckle in-class essay type to holistic tier scoring (PR #411)',
  true
);

-- Opt-in holistic tier scoring for Mr. Hornbuckle's in-class essay/analysis assignment type.
-- Idempotent: skips rows that already store scoringMode holistic_tier; skips non-object JSON.
UPDATE "AssignmentType"
SET "gradingOutputSchemaJson" =
  CASE
    WHEN "gradingOutputSchemaJson" IS NULL THEN
      jsonb_build_object('scoringMode', 'holistic_tier')
    ELSE
      "gradingOutputSchemaJson" || jsonb_build_object('scoringMode', 'holistic_tier')
  END
WHERE id = 'cmur0glku00d401l1cg6ou25q'
  AND (
    "gradingOutputSchemaJson" IS NULL
    OR (
      jsonb_typeof("gradingOutputSchemaJson") = 'object'
      AND NOT ("gradingOutputSchemaJson" @> '{"scoringMode": "holistic_tier"}'::jsonb)
    )
  );

RESET lock_timeout;
