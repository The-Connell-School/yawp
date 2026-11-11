SET lock_timeout = '5s';

-- Exit Ticket joins the free classroom bundle. New free classrooms are linked
-- to it at provisioning (linkBundleAssignmentTypes); this links the ones that
-- already exist. Additive only: one row per org, skipped where present.
INSERT INTO "OrganizationAssignmentType" ("organizationId", "assignmentTypeId")
SELECT o."id", t."id"
FROM "Organization" o
CROSS JOIN "AssignmentType" t
WHERE o."plan" = 'FREE_CLASSROOM'
  AND t."kind" = 'exit_ticket'
ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING;
