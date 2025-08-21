-- Data migration: create Schools and Classes from existing StudentProfile fields,
-- and assign StudentProfile.classId accordingly. Idempotent.

-- 1) Insert Schools per organization from free-text StudentProfile.school
WITH distinct_schools AS (
  SELECT DISTINCT p."organizationId", TRIM(sp."school") AS school_name
  FROM "StudentProfile" sp
  JOIN "Profile" p ON p."id" = sp."profileId"
  WHERE sp."school" IS NOT NULL AND TRIM(sp."school") <> ''
),
to_insert_schools AS (
  SELECT ds."organizationId", ds.school_name
  FROM distinct_schools ds
  LEFT JOIN "School" s
    ON s."organizationId" = ds."organizationId"
   AND lower(s."name") = lower(ds.school_name)
  WHERE s."id" IS NULL
)
INSERT INTO "School" ("id", "createdAt", "updatedAt", "name", "code", "organizationId")
SELECT
  substr(md5(random()::text || clock_timestamp()::text), 1, 24) AS id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  tis.school_name AS name,
  -- Unique, deterministic-ish code per org/name; 8-char hash is human-usable and unique
  substr(md5(tis.school_name || '|' || tis."organizationId"), 1, 8) AS code,
  tis."organizationId"
FROM to_insert_schools tis;

-- 2) Insert Classes per (school, period, grade)
WITH distinct_class_keys AS (
  SELECT DISTINCT
    p."organizationId",
    TRIM(sp."school") AS school_name,
    TRIM(sp."period") AS period,
    TRIM(sp."grade") AS grade
  FROM "StudentProfile" sp
  JOIN "Profile" p ON p."id" = sp."profileId"
  WHERE sp."school" IS NOT NULL AND TRIM(sp."school") <> ''
    AND sp."period" IS NOT NULL AND TRIM(sp."period") <> ''
    AND sp."grade" IS NOT NULL AND TRIM(sp."grade") <> ''
),
with_schools AS (
  SELECT DISTINCT dck."organizationId", s."id" AS "schoolId", dck."period", dck."grade"
  FROM distinct_class_keys dck
  JOIN "School" s
    ON s."organizationId" = dck."organizationId"
   AND lower(s."name") = lower(dck.school_name)
),
to_insert_classes AS (
  SELECT DISTINCT ws."schoolId", ws."period", ws."grade"
  FROM with_schools ws
  LEFT JOIN "Class" c
    ON c."schoolId" = ws."schoolId"
   AND c."period" = ws."period"
   AND c."grade" = ws."grade"
  WHERE c."id" IS NULL
)
INSERT INTO "Class" ("id", "createdAt", "updatedAt", "period", "grade", "schoolId")
SELECT
  substr(md5(random()::text || clock_timestamp()::text), 1, 24) AS id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  tic."period",
  tic."grade",
  tic."schoolId"
FROM to_insert_classes tic
ON CONFLICT ("schoolId", "period", "grade") DO NOTHING;

-- 3) Assign StudentProfile.classId to the appropriate Class
WITH sp_targets AS (
  SELECT
    sp."id" AS "studentProfileId",
    c."id"  AS "classId"
  FROM "StudentProfile" sp
  JOIN "Profile" p ON p."id" = sp."profileId"
  JOIN "School" s
    ON s."organizationId" = p."organizationId"
   AND lower(s."name") = lower(TRIM(sp."school"))
  JOIN "Class" c
    ON c."schoolId" = s."id"
   AND c."period" = TRIM(sp."period")
   AND c."grade"  = TRIM(sp."grade")
  WHERE sp."school" IS NOT NULL AND sp."period" IS NOT NULL AND sp."grade" IS NOT NULL
)
UPDATE "StudentProfile" sp
SET "classId" = st."classId"
FROM sp_targets st
WHERE sp."id" = st."studentProfileId"
  AND (sp."classId" IS DISTINCT FROM st."classId");

-- End data migration
