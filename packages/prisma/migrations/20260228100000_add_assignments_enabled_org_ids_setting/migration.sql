-- Insert feature flag for assignments (disabled by default - empty org list)
INSERT INTO "Setting" ("id", "createdAt", "updatedAt", "name", "description", "value", "valueType")
VALUES (
  'assignments_enabled_org_ids',
  NOW(),
  NOW(),
  'assignments_enabled_org_ids',
  'Comma-separated organization IDs allowed to use assignments',
  '',
  'string'
)
ON CONFLICT ("name") DO NOTHING;
