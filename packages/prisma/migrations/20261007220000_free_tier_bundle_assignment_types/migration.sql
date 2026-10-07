SET lock_timeout = '5s';

-- Guarded, idempotent creation of free-classroom bundle assignment types.
-- Module content and rubric pins are completed by
-- `seed-free-tier-bundle-assignment-types` on deploy; this migration only
-- ensures the kind rows exist without linking them to existing organizations.

INSERT INTO "AssignmentType" (
  "id", "createdAt", "updatedAt", "title", "description", "position", "kind"
)
SELECT
  'cfreeclassstarter00000001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'Class Starter',
  'Open-ended writing to begin class. Graded on engagement: did the student write, and did they reflect.',
  51,
  'class_starter'
WHERE NOT EXISTS (
  SELECT 1 FROM "AssignmentType" WHERE "kind" = 'class_starter'
);

INSERT INTO "AssignmentType" (
  "id", "createdAt", "updatedAt", "title", "description", "position", "kind"
)
SELECT
  'cfreeprewriting000000001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'Prewriting',
  'Explore the prompt and find a specific focus before writing a thesis.',
  52,
  'prewriting'
WHERE NOT EXISTS (
  SELECT 1 FROM "AssignmentType" WHERE "kind" = 'prewriting'
);

INSERT INTO "AssignmentType" (
  "id", "createdAt", "updatedAt", "title", "description", "position", "kind"
)
SELECT
  'cfreethesisstatement00001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'Thesis Statement',
  'Develop a single clear, arguable thesis sentence.',
  53,
  'thesis_statement'
WHERE NOT EXISTS (
  SELECT 1 FROM "AssignmentType" WHERE "kind" = 'thesis_statement'
);
