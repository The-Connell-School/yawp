-- Pin existing assignments that grade with a selected library rubric to the
-- rubric's current published revision, if they are not already pinned.
--
-- Safety properties:
-- - Only assignments whose assignment type has an explicit library rubric
--   selected (AssignmentType.rubricId) are affected.
-- - Only assignments with a NULL rubricRevisionId are updated.
-- - Only rubrics with a non-NULL currentRevisionId are used for pinning.
--
-- This preserves historical grading semantics for existing work when a new
-- rubric revision is published later: new assignments will follow the new
-- current revision, while historical assignments remain on the revision
-- that was current when they were created.
UPDATE "Assignment" a
SET "rubricRevisionId" = r."currentRevisionId"
FROM "AssignmentType" t
JOIN "Rubric" r ON r.id = t."rubricId"
WHERE a."assignmentTypeId" = t.id
  AND a."rubricRevisionId" IS NULL
  AND r."currentRevisionId" IS NOT NULL;
