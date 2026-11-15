SET lock_timeout = '5s';

-- Display titles for free-classroom bundle types (from #950). The applied
-- 20261007220000 migration is unchanged; seed and in-app labels use
-- Pre-writing and Thesis Builder.

UPDATE "AssignmentType"
SET
  "title" = 'Pre-writing',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "kind" = 'prewriting'
  AND "ownerOrgId" IS NULL
  AND "ownerMembershipId" IS NULL
  AND "title" = 'Prewriting';

UPDATE "AssignmentType"
SET
  "title" = 'Thesis Builder',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "kind" = 'thesis_statement'
  AND "ownerOrgId" IS NULL
  AND "ownerMembershipId" IS NULL
  AND "title" = 'Thesis Statement';