DROP TABLE IF EXISTS "FeatureAccessTarget";

DELETE FROM "Setting"
WHERE name IN (
  'document_submission_enabled',
  'document_submission_enabled_school_ids',
  'assignments_enabled_org_ids',
  'feature_assignment_creation_standardization'
);
