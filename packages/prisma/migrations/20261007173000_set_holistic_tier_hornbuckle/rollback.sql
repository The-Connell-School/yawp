SET lock_timeout = '5s';

-- Roll back the holistic scoring mode for the specified assignment type.
UPDATE "AssignmentType"
SET "gradingOutputSchemaJson" = COALESCE("gradingOutputSchemaJson", '{}'::jsonb) - 'scoringMode'
WHERE id = 'cmur0glku00d401l1cg6ou25q';

RESET lock_timeout;
