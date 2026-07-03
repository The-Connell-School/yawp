-- Remove the four retired feature flags. The FeatureAccessTarget TABLE is kept
-- because it also backs assignment-type access control (featureKey
-- 'assignment_type:<id>'); only the flag-scoped rows are deleted here.

DELETE FROM "Setting"
WHERE name IN (
  'document_submission_enabled',
  'document_submission_enabled_school_ids',
  'assignments_enabled_org_ids',
  'feature_assignment_creation_standardization'
);

DELETE FROM "FeatureAccessTarget"
WHERE "featureKey" IN (
  'assignments',
  'assignment_creation_standardization',
  'document_submission_grading',
  'ap_history_essay'
);
