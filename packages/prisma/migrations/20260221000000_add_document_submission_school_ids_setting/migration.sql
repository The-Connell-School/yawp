INSERT INTO "Setting" ("id", "createdAt", "updatedAt", "name", "description", "value", "valueType")
VALUES (
  'document_submission_school_ids',
  NOW(),
  NOW(),
  'document_submission_enabled_school_ids',
  'Comma-separated school IDs allowed to use document submission and grading',
  '',
  'string'
)
ON CONFLICT ("name") DO NOTHING;
