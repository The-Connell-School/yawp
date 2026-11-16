-- Puts the Daily Pages name back. The card is not restored: the old one said
-- "Class Starter" and was wrong for this type under either name.

UPDATE "AssignmentType"
SET
  "title" = 'Daily Pages',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "kind" = 'daily_pages'
  AND "title" = 'Short Response';

UPDATE "AssignmentModule" AS m
SET
  "title" = 'Daily Pages',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "AssignmentType" AS t
WHERE m."assignmentTypeId" = t."id"
  AND t."kind" = 'daily_pages'
  AND m."title" = 'Short Response';
