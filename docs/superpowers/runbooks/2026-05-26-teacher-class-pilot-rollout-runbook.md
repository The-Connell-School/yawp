# Teacher/Class Pilot Rollout Runbook

**Branch:** `codex/teacher-class-feature-rollouts`
**Scope:** Amanda Metcalfe pilot for `assignments` and `document_submission_grading`
**Production DB access:** `docs/superpowers/runbooks/production-db-access.md`

This rollout is additive. It creates `FeatureAccessTarget` and keeps the
existing org/school `Setting` allowlists active.

## Pilot Targets

| Target | ID |
| --- | --- |
| Teacher profile | `cmocwzzzl03gg0ql73gbzi22v` |
| Teacher email | `ametcalfe@bhm.k12.al.us` |
| Organization | GEAR UP Achieve, `cmm93f0zd007z0qjtuwksa3d2` |
| School | Parker High School, `cmocwvqk303g00ql7d9igjzp5` |
| Class | `cmocwxinl03g20ql77u0fd51c` |
| Class | `cmocwy6vp03g50ql71ioy202o` |
| Class | `cmocwytnm03g80ql7weubpkbr` |

Enabled feature keys:

- `assignments`
- `document_submission_grading`

Enabled target kinds:

- `teacher`
- `class`

## Pre-Deploy Gates

Do not deploy until all gates are green:

- Branch is current with the intended release branch and CI is green.
- Migration is reviewed as additive only:
  `packages/prisma/migrations/20260526143000_add_feature_access_targets/migration.sql`
- Local or preview migration deploy succeeds with `bunx prisma migrate deploy`.
- Existing org/school feature settings remain unchanged:
  `assignments_enabled_org_ids`, `document_submission_enabled`, and
  `document_submission_enabled_school_ids`.
- Production DB tunnel details are available from `scripts/production-sync.env`;
  do not copy secrets into shell history or committed docs.
- Bryant has approved the production write window for Amanda's pilot targets.

## Migration Verification

After deployment runs Prisma migrations, verify the table and indexes exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND table_name = 'FeatureAccessTarget';

SELECT indexname
FROM pg_indexes
WHERE schemaname = current_schema()
  AND tablename = 'FeatureAccessTarget'
ORDER BY indexname;
```

Expected indexes:

- `FeatureAccessTarget_pkey`
- `FeatureAccessTarget_featureKey_targetKind_targetId_key`
- `FeatureAccessTarget_targetKind_targetId_idx`
- `FeatureAccessTarget_featureKey_enabled_idx`
- `FeatureAccessTarget_expiresAt_idx`

Verify the migration is recorded:

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE migration_name = '20260526143000_add_feature_access_targets';
```

## Amanda Enable SQL

Run this only after migration verification passes. Use `psql -v ON_ERROR_STOP=1`
so the transaction stops if the guard block raises an exception. The script
intentionally uses deterministic ids because raw SQL does not invoke Prisma's
`cuid()` default.

```sql
BEGIN;

DO $$
DECLARE
  teacher_count integer;
  class_count integer;
BEGIN
  SELECT COUNT(*)
  INTO teacher_count
  FROM "TeacherProfile" tp
  JOIN "Profile" p ON p.id = tp."profileId"
  JOIN "User" u ON u.id = p."userId"
  JOIN "_SchoolToTeacherProfile" st ON st."B" = tp.id
  JOIN "School" s ON s.id = st."A"
  JOIN "Organization" o ON o.id = s."organizationId"
  WHERE tp.id = 'cmocwzzzl03gg0ql73gbzi22v'
    AND u.email = 'ametcalfe@bhm.k12.al.us'
    AND s.id = 'cmocwvqk303g00ql7d9igjzp5'
    AND o.id = 'cmm93f0zd007z0qjtuwksa3d2';

  IF teacher_count <> 1 THEN
    RAISE EXCEPTION 'Amanda teacher target did not resolve to expected email, school, and organization';
  END IF;

  SELECT COUNT(*)
  INTO class_count
  FROM "Class" c
  JOIN "_ClassToTeacherProfile" ctp ON ctp."A" = c.id
  JOIN "School" s ON s.id = c."schoolId"
  JOIN "Organization" o ON o.id = s."organizationId"
  WHERE c.id IN (
    'cmocwxinl03g20ql77u0fd51c',
    'cmocwy6vp03g50ql71ioy202o',
    'cmocwytnm03g80ql7weubpkbr'
  )
    AND ctp."B" = 'cmocwzzzl03gg0ql73gbzi22v'
    AND s.id = 'cmocwvqk303g00ql7d9igjzp5'
    AND o.id = 'cmm93f0zd007z0qjtuwksa3d2';

  IF class_count <> 3 THEN
    RAISE EXCEPTION 'One or more Amanda class targets did not resolve to expected teacher, school, and organization';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    WITH pilot_target(feature_key, target_kind, target_id, row_id) AS (
      VALUES
        ('assignments', 'teacher', 'cmocwzzzl03gg0ql73gbzi22v', 'rollout-20260526-amanda-assignments-teacher'),
        ('document_submission_grading', 'teacher', 'cmocwzzzl03gg0ql73gbzi22v', 'rollout-20260526-amanda-docsub-teacher'),
        ('assignments', 'class', 'cmocwxinl03g20ql77u0fd51c', 'rollout-20260526-amanda-assignments-class-1'),
        ('assignments', 'class', 'cmocwy6vp03g50ql71ioy202o', 'rollout-20260526-amanda-assignments-class-2'),
        ('assignments', 'class', 'cmocwytnm03g80ql7weubpkbr', 'rollout-20260526-amanda-assignments-class-3'),
        ('document_submission_grading', 'class', 'cmocwxinl03g20ql77u0fd51c', 'rollout-20260526-amanda-docsub-class-1'),
        ('document_submission_grading', 'class', 'cmocwy6vp03g50ql71ioy202o', 'rollout-20260526-amanda-docsub-class-2'),
        ('document_submission_grading', 'class', 'cmocwytnm03g80ql7weubpkbr', 'rollout-20260526-amanda-docsub-class-3')
    )
    SELECT 1
    FROM "FeatureAccessTarget" fat
    JOIN pilot_target pt
      ON pt.feature_key = fat."featureKey"
     AND pt.target_kind = fat."targetKind"
     AND pt.target_id = fat."targetId"
    WHERE fat.id NOT LIKE 'rollout-20260526-amanda-%'
  ) THEN
    RAISE EXCEPTION 'Existing Amanda pilot FeatureAccessTarget row found; inspect before overwriting';
  END IF;
END $$;

WITH pilot_target(feature_key, target_kind, target_id, row_id) AS (
  VALUES
    ('assignments', 'teacher', 'cmocwzzzl03gg0ql73gbzi22v', 'rollout-20260526-amanda-assignments-teacher'),
    ('document_submission_grading', 'teacher', 'cmocwzzzl03gg0ql73gbzi22v', 'rollout-20260526-amanda-docsub-teacher'),
    ('assignments', 'class', 'cmocwxinl03g20ql77u0fd51c', 'rollout-20260526-amanda-assignments-class-1'),
    ('assignments', 'class', 'cmocwy6vp03g50ql71ioy202o', 'rollout-20260526-amanda-assignments-class-2'),
    ('assignments', 'class', 'cmocwytnm03g80ql7weubpkbr', 'rollout-20260526-amanda-assignments-class-3'),
    ('document_submission_grading', 'class', 'cmocwxinl03g20ql77u0fd51c', 'rollout-20260526-amanda-docsub-class-1'),
    ('document_submission_grading', 'class', 'cmocwy6vp03g50ql71ioy202o', 'rollout-20260526-amanda-docsub-class-2'),
    ('document_submission_grading', 'class', 'cmocwytnm03g80ql7weubpkbr', 'rollout-20260526-amanda-docsub-class-3')
)
INSERT INTO "FeatureAccessTarget" (
  id,
  "featureKey",
  "targetKind",
  "targetId",
  enabled,
  "expiresAt",
  note
)
SELECT
  row_id,
  feature_key,
  target_kind,
  target_id,
  true,
  NULL,
  'Amanda Metcalfe teacher/class pilot enabled 2026-05-26'
FROM pilot_target
ON CONFLICT ("featureKey", "targetKind", "targetId")
DO UPDATE SET
  enabled = true,
  "expiresAt" = NULL,
  note = EXCLUDED.note,
  "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
```

## Rollback SQL

Preferred rollback disables only rows created by this runbook and preserves an
audit trail:

```sql
BEGIN;

UPDATE "FeatureAccessTarget"
SET enabled = false,
    note = 'Amanda Metcalfe teacher/class pilot disabled by rollback',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id LIKE 'rollout-20260526-amanda-%'
  AND "featureKey" IN ('assignments', 'document_submission_grading')
  AND "targetKind" IN ('teacher', 'class');

COMMIT;
```

If an operator must remove the rollout rows entirely:

```sql
BEGIN;

DELETE FROM "FeatureAccessTarget"
WHERE id LIKE 'rollout-20260526-amanda-%'
  AND "featureKey" IN ('assignments', 'document_submission_grading')
  AND "targetKind" IN ('teacher', 'class');

COMMIT;
```

## Post-Deploy DB Verification SQL

Run after the enable SQL commits:

```sql
SELECT "featureKey", "targetKind", "targetId", enabled, "expiresAt", note
FROM "FeatureAccessTarget"
WHERE id LIKE 'rollout-20260526-amanda-%'
ORDER BY "featureKey", "targetKind", "targetId";
```

Expected: eight rows, all `enabled = true`, all `expiresAt IS NULL`.

Verify Amanda and the three class ids still resolve to the expected school and
organization:

```sql
SELECT tp.id AS "teacherProfileId",
       u.email,
       o.id AS "organizationId",
       o.name AS "organizationName",
       s.id AS "schoolId",
       s.name AS "schoolName"
FROM "TeacherProfile" tp
JOIN "Profile" p ON p.id = tp."profileId"
JOIN "User" u ON u.id = p."userId"
JOIN "_SchoolToTeacherProfile" st ON st."B" = tp.id
JOIN "School" s ON s.id = st."A"
JOIN "Organization" o ON o.id = s."organizationId"
WHERE tp.id = 'cmocwzzzl03gg0ql73gbzi22v';

SELECT c.id AS "classId",
       c.grade,
       c.period,
       s.id AS "schoolId",
       s.name AS "schoolName",
       o.id AS "organizationId",
       o.name AS "organizationName"
FROM "Class" c
JOIN "School" s ON s.id = c."schoolId"
JOIN "Organization" o ON o.id = s."organizationId"
WHERE c.id IN (
  'cmocwxinl03g20ql77u0fd51c',
  'cmocwy6vp03g50ql71ioy202o',
  'cmocwytnm03g80ql7weubpkbr'
)
ORDER BY c.id;
```

Verify no broad org/school rollout was accidentally changed:

```sql
SELECT name, value, "valueType"
FROM "Setting"
WHERE name IN (
  'assignments_enabled_org_ids',
  'document_submission_enabled',
  'document_submission_enabled_school_ids'
)
ORDER BY name;
```

## Post-Deploy UI Smoke Checklist

Use Amanda's production account or a supervised session with Amanda. Keep the
smoke narrow; this is a pilot enablement check, not a full regression pass.

- Amanda can sign in.
- Amanda's dashboard shows assignment affordances.
- Each pilot class page opens for:
  `cmocwxinl03g20ql77u0fd51c`, `cmocwy6vp03g50ql71ioy202o`,
  `cmocwytnm03g80ql7weubpkbr`.
- Each pilot class page shows the `Assignments` tab.
- Amanda can open the create-assignment flow for one pilot class.
- Amanda can view students/documents for one pilot class.
- Document submission grading controls are visible on an eligible submitted
  student document.
- A non-pilot teacher or non-pilot class is not newly enabled through this
  table.
- If any smoke item fails, run the rollback SQL and capture the failing URL,
  account, class id, timestamp, and screenshot/video evidence.

## Brian Reply Timing

Do not tell Brian the pilot is ready immediately after deploy. Reply only after:

1. Migration verification passes.
2. Amanda enable SQL commits.
3. Post-deploy DB verification returns the expected eight enabled rows.
4. The UI smoke checklist has no blocker.

If all checks pass, reply to Brian within 15 minutes with:

- Amanda is enabled for assignments and document submission grading.
- The rollout is scoped to Amanda's teacher profile and the three Parker High
  School class ids listed above.
- Amanda can start pilot testing now.

If deploy or smoke is delayed by more than 30 minutes, send Brian a holding
reply with the current gate and the next expected update time. If rollback is
needed, notify Brian immediately after rollback verification.
