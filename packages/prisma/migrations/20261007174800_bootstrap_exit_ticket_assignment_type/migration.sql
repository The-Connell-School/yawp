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
  'cexitticket000000000000000'
WHERE NOT EXISTS (
  SELECT 1
  FROM "AssignmentModule"
  WHERE "assignmentTypeId" = 'cexitticket000000000000000'
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
  'cexitticketmod00000000001'
WHERE NOT EXISTS (
  SELECT 1
  FROM "AssignmentModuleInstruction"
  WHERE "assignmentModuleId" = 'cexitticketmod00000000001'
);

INSERT INTO "OrganizationAssignmentType" ("organizationId", "assignmentTypeId")
SELECT o."id", 'cexitticket000000000000000'
FROM "Organization" o
ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING;
