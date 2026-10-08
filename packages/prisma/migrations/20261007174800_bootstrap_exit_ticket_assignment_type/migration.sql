SET lock_timeout = '5s';

-- One-time bootstrap of the global Exit Ticket assignment type. Re-deploying
-- this migration does not re-run; org grants below are create-only on conflict.
-- Customized school/teacher lists are intentionally not modified.

INSERT INTO "AssignmentType" (
  "id",
  "createdAt",
  "updatedAt",
  "title",
  "kind",
  "description",
  "position",
  "ownerOrgId"
)
SELECT
  'cexitticket000000000000000',
  NOW(),
  NOW(),
  'Exit Ticket',
  'exit_ticket',
  'A short piece of writing at the end of a lesson that shows whether it landed.',
  51,
  (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "AssignmentType" WHERE "kind" = 'exit_ticket'
);

INSERT INTO "AssignmentModule" (
  "id",
  "createdAt",
  "updatedAt",
  "title",
  "position",
  "description",
  "assignmentTypeId"
)
SELECT
  'cexitticketmod00000000001',
  NOW(),
  NOW(),
  'Exit Ticket',
  1,
  'Answer the exit ticket in your own words.',
  t."id"
FROM "AssignmentType" t
WHERE t."kind" = 'exit_ticket'
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentModule" m
    WHERE m."assignmentTypeId" = t."id"
  );

INSERT INTO "AssignmentModuleInstruction" (
  "id",
  "createdAt",
  "updatedAt",
  "position",
  "title",
  "prompt",
  "showChatButton",
  "assignmentModuleId"
)
SELECT
  'cexitticketins0000000001',
  NOW(),
  NOW(),
  1,
  'Write',
  'Answer the prompt in your own words, and explain your thinking.',
  false,
  m."id"
FROM "AssignmentModule" m
INNER JOIN "AssignmentType" t ON t."id" = m."assignmentTypeId"
WHERE t."kind" = 'exit_ticket'
  AND m."id" = 'cexitticketmod00000000001'
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentModuleInstruction" i
    WHERE i."assignmentModuleId" = m."id"
  );

INSERT INTO "OrganizationAssignmentType" ("organizationId", "assignmentTypeId")
SELECT o."id", t."id"
FROM "Organization" o
CROSS JOIN "AssignmentType" t
WHERE t."kind" = 'exit_ticket'
ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING;

-- Card artwork: same pattern as Class Starter / Daily Pages (create-only, never
-- overwrite a custom upload). Prefer copying an existing type image when the
-- exit ticket row has none yet.
INSERT INTO "AssignmentTypeImage" (
  "id",
  "createdAt",
  "updatedAt",
  "altText",
  "contentType",
  "blob",
  "assignmentTypeId"
)
SELECT
  'cexitticketimage000000000',
  NOW(),
  NOW(),
  COALESCE(
    donor."altText",
    'A torn exit ticket resting on ruled notebook paper.'
  ),
  donor."contentType",
  donor."blob",
  exit_type."id"
FROM "AssignmentType" exit_type
CROSS JOIN LATERAL (
  SELECT ati."altText", ati."contentType", ati."blob"
  FROM "AssignmentTypeImage" ati
  INNER JOIN "AssignmentType" src ON src."id" = ati."assignmentTypeId"
  WHERE src."kind" IN ('class_starter', 'daily_pages')
  ORDER BY
    CASE src."kind"
      WHEN 'class_starter' THEN 0
      WHEN 'daily_pages' THEN 1
      ELSE 2
    END
  LIMIT 1
) donor
WHERE exit_type."kind" = 'exit_ticket'
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentTypeImage" existing
    WHERE existing."assignmentTypeId" = exit_type."id"
  );
