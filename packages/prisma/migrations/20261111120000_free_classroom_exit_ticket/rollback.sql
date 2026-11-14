SET lock_timeout = '5s';

DELETE FROM "OrganizationAssignmentType" oat
USING "Organization" o, "AssignmentType" t
WHERE oat."organizationId" = o."id"
  AND oat."assignmentTypeId" = t."id"
  AND o."plan" = 'FREE_CLASSROOM'
  AND t."kind" = 'exit_ticket';
