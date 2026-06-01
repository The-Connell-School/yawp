# Feature Access Rollout Runbook

Date: 2026-05-28

Use this for `assignments` and `document_submission_grading` rollouts.

## Contract

Manage access with `FeatureAccessTarget`:

| Scope        | `targetKind`   | Effect                                           |
| ------------ | -------------- | ------------------------------------------------ |
| Teacher      | `teacher`      | Enables all active classes taught by the teacher |
| School       | `school`       | Enables all classes in the school                |
| Organization | `organization` | Enables all schools/classes in the organization  |

Do not create new class targets from the admin UI. Class targets are legacy
compatibility rows only.

## Brian Admin Flow

1. Open Admin > Feature Flags.
2. Use **Feature access** for the two current features:
   - Assignments
   - Document submission grading
3. Search by organization, school, teacher name, teacher email, or feature.
4. Toggle the desired teacher, school, or organization target.
5. Confirm the target row shows `Enabled`.

## Production Verification SQL

```sql
SELECT "featureKey", "targetKind", "targetId", enabled, "expiresAt", note
FROM "FeatureAccessTarget"
WHERE "featureKey" IN ('assignments', 'document_submission_grading')
ORDER BY "featureKey", "targetKind", "targetId";
```

Expected for new rollouts: `targetKind` is `teacher`, `school`, or
`organization`; enabled rows have `enabled = true` and either `expiresAt IS NULL`
or a future expiry.

## Parker High School Example

To enable Parker High School for both features, create or toggle these rows:

- `assignments` / `school` / Parker High School school id
- `document_submission_grading` / `school` / Parker High School school id

To pilot only one Parker teacher, use the teacher profile id instead:

- `assignments` / `teacher` / teacher profile id
- `document_submission_grading` / `teacher` / teacher profile id

## Rollback

Disable the exact rows that were enabled:

```sql
UPDATE "FeatureAccessTarget"
SET enabled = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "featureKey" IN ('assignments', 'document_submission_grading')
  AND "targetKind" IN ('teacher', 'school', 'organization')
  AND "targetId" IN ('REPLACE_WITH_TARGET_ID');
```

Do not change legacy `Setting` allowlists during a targeted rollback unless the
rollout intentionally changed those settings.
