-- Backfill teacher-school links implied by existing teacher-class assignments.
-- Teacher class ownership is not enough for the Create Class menu; the teacher
-- must also be connected to the class school through "_SchoolTeachers".
INSERT INTO "_SchoolTeachers" ("A", "B")
SELECT DISTINCT
  c."schoolId" AS "A",
  ct."B" AS "B"
FROM "_ClassTeachers" ct
JOIN "Class" c
  ON c."id" = ct."A"
JOIN "School" s
  ON s."id" = c."schoolId"
JOIN "OrgMembership" om
  ON om."id" = ct."B"
WHERE om."role" = 'TEACHER'
  AND om."organizationId" = s."organizationId"
ON CONFLICT ("A", "B") DO NOTHING;
