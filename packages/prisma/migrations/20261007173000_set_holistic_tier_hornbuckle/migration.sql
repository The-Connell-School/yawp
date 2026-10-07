SET lock_timeout = '5s';

-- Opt-in holistic tier scoring for Mr. Hornbuckle's in-class essay/analysis assignment type.
-- Store the mode alongside the grading output schema JSON so it is captured
-- by the AssignmentType baseline trigger and versioned in RubricRevision.
UPDATE "AssignmentType"
SET "gradingOutputSchemaJson" = COALESCE("gradingOutputSchemaJson", '{}'::jsonb) || jsonb_build_object('scoringMode','holistic_tier')
WHERE id = 'cmur0glku00d401l1cg6ou25q';

RESET lock_timeout;
