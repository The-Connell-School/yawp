-- Insert feature flag for document submission (disabled by default)
INSERT INTO "Setting" ("id", "createdAt", "updatedAt", "name", "description", "value", "valueType")
VALUES (
  'document_submission_flag',
  NOW(),
  NOW(),
  'document_submission_enabled',
  'Allow students to submit documents for grading',
  'false',
  'boolean'
);
