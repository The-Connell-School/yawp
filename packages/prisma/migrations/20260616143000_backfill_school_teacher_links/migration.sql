-- Normalize teacher-school links to Prisma's implicit join orientation and
-- backfill links implied by existing teacher-class assignments.
ALTER TABLE "_SchoolTeachers" DROP CONSTRAINT IF EXISTS "_SchoolTeachers_A_fkey";
ALTER TABLE "_SchoolTeachers" DROP CONSTRAINT IF EXISTS "_SchoolTeachers_B_fkey";

CREATE TEMP TABLE "_SchoolTeachers_normalized" AS
SELECT DISTINCT
  st."B" AS "A",
  st."A" AS "B"
FROM "_SchoolTeachers" st
JOIN "School" s
  ON s."id" = st."A"
JOIN "OrgMembership" om
  ON om."id" = st."B"
WHERE om."role" = 'TEACHER'
  AND om."organizationId" = s."organizationId"
UNION
SELECT DISTINCT
  st."A" AS "A",
  st."B" AS "B"
FROM "_SchoolTeachers" st
JOIN "OrgMembership" om
  ON om."id" = st."A"
JOIN "School" s
  ON s."id" = st."B"
WHERE om."role" = 'TEACHER'
  AND om."organizationId" = s."organizationId";

TRUNCATE TABLE "_SchoolTeachers";

INSERT INTO "_SchoolTeachers" ("A", "B")
SELECT DISTINCT "A", "B"
FROM "_SchoolTeachers_normalized"
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_SchoolTeachers" ("A", "B")
SELECT DISTINCT
  ct."B" AS "A",
  c."schoolId" AS "B"
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

ALTER TABLE "_SchoolTeachers" ADD CONSTRAINT "_SchoolTeachers_A_fkey"
  FOREIGN KEY ("A") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_SchoolTeachers" ADD CONSTRAINT "_SchoolTeachers_B_fkey"
  FOREIGN KEY ("B") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
