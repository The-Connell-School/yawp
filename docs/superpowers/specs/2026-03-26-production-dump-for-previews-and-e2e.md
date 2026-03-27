# Production Database Dump for Preview Environments & E2E Tests

## Problem

Preview environments and E2E tests use synthetic seed data that doesn't represent production reality. Bugs that depend on real data (relationships, volume, edge cases) can't be reproduced. A production database dump stored in S3 gives both environments realistic data to work with.

## S3 Source

- **Bucket/key**: Configured via `DUMP_S3_KEY` constant (currently `s3://yawp-production-database-exports/Mar03260636.dump`). Single constant in `prepare-e2e.ts` and referenced in the workflow — change one place to refresh.
- **Format**: Plain SQL (`pg_dump` with no flags)
- **Local access**: `AWS_PROFILE=yawp`
- **CI access**: GitHub Actions OIDC role (already configured)

## Design

### 1. E2E Tests (Local)

**Cache location**: `services/web-app/e2e/.data/production.dump` (gitignored)

**Flow in `prepare-e2e.ts`**:

1. Start Docker Postgres (unchanged)
2. **CHANGED**: Drop and recreate database `yop_e2e` before each restore (ensures clean state on repeated runs, like `dropdb/createdb`)
3. **NEW**: Download dump from S3 if not cached locally:
   ```bash
   aws s3 cp s3://yawp-production-database-exports/Mar03260636.dump e2e/.data/production.dump --profile yawp
   ```
4. **CHANGED**: Instead of `seedE2E()`, restore the dump:
   ```bash
   psql -f e2e/.data/production.dump $DATABASE_URL
   ```
5. Run `prisma migrate deploy` to apply any migrations newer than the dump. The dump includes `_prisma_migrations` table so Prisma knows which migrations are already applied.
6. **NEW**: Run test user overlay (upserts E2E test users on top of production data)
7. **CHANGED**: Build `E2EContext` — the overlay returns all required IDs after creating/upserting entities

### 2. Preview Environments (GitHub Actions)

**Changes to `.github/workflows/preview-environments.yml`**, in the "Create PR schema and migrate" step:

1. Create schema `pr_X` (unchanged)
2. **NEW**: Stream dump from S3, remap `public` → `pr_X`, pipe to psql:
   ```bash
   SCHEMA="pr_${PR_NUMBER}"
   aws s3 cp s3://yawp-production-database-exports/Mar03260636.dump - \
     | sed "s/public\./${SCHEMA}./g; s/search_path = public/search_path = ${SCHEMA}/g" \
     | psql "$MIGRATE_URL"
   ```
3. Run `prisma migrate deploy` (unchanged — applies any migrations newer than the dump). The dump's `_prisma_migrations` table is remapped to `pr_X._prisma_migrations` by the sed, so Prisma with `?schema=pr_X` finds it correctly.
4. **CHANGED**: Replace the current `seed.ts` invocation with the shared overlay script that upserts smoke test users (`teacher@fake.test` / `teacher123`) and E2E test users into the restored data

The `sed` pattern `s/public\./${SCHEMA}./g` matches schema-qualified references (`public."User"`, `public."Document"`, etc.) in DDL and COPY statements. Combined with `s/search_path = public/search_path = ${SCHEMA}/g` for SET statements, this covers the patterns emitted by plain `pg_dump`. The dot-suffix makes false matches in COPY data rows extremely unlikely — tab-delimited data values don't contain schema-qualified identifiers like `public.`.

### 3. Shared Overlay Script

A single overlay script (`packages/prisma/scripts/seed-overlay.ts`) is used by both E2E and preview environments. It accepts `DATABASE_URL` from the environment (same as `seed.ts` does today) and handles both local and schema-qualified connections.

**Full entity scope** (mirrors current `seedE2E()` but uses upsert semantics):

1. **Organization**: `the-connell-school`
2. **School**: `E2E High` with code `E2E-SCHOOL`
3. **Class**: code `E2E-CLASS`, grade 9th, period 1st, linked to school
4. **Teacher user**: `teacher.e2e@yawp.test` with profile, teacherProfile, linked to school+class
5. **Student user**: `jdoe@brock.software` with profile, studentProfile, linked to class
6. **Admin user**: `admin.e2e@yawp.test` with isAdmin flag
7. **Smoke test users**: `teacher@fake.test` / `teacher123`, `admin@fake.test` / `admin123`, `student@fake.test` / `student123`
8. **StudentCourse**: with 3 modules, each with 3 instructions (showChatButton: true)
9. **ClassStudentCourse**: links class to student course
10. **Document**: `E2E Doc` with sample text, linked to student profile and class
11. **StudentCourseModuleSession**: links document to first module

All operations use `ON CONFLICT DO UPDATE` or find-or-create patterns for idempotency. Returns `E2EContext` with all IDs.

### 4. Gitignore

Add to `.gitignore`:
```
services/web-app/e2e/.data/
```

## Files Changed

| File | Change |
|---|---|
| `services/web-app/e2e/prepare-e2e.ts` | Drop/recreate DB, download dump, restore via psql, call overlay instead of seedE2E |
| `services/web-app/e2e/seed-e2e.ts` | Keep for reference but no longer called from prepare-e2e |
| `packages/prisma/scripts/seed-overlay.ts` | **NEW** — shared test user overlay for both E2E and preview |
| `.github/workflows/preview-environments.yml` | Stream dump from S3, sed remap, replace seed.ts with overlay |
| `.gitignore` | Add `services/web-app/e2e/.data/` |

## Risks & Mitigations

- **Stale dump**: The dump is a point-in-time snapshot. `prisma migrate deploy` applies newer migrations. Data staleness is acceptable — the dump provides realistic structure and volume, not live data. The S3 key is a single constant — update it to refresh.
- **sed remapping**: The `public\.` pattern (with dot) is precise enough to avoid matching data in COPY blocks (tab-delimited rows don't contain schema-qualified names). Covers DDL, COPY headers, ALTER, CREATE INDEX, and foreign key statements. If edge cases arise in the future, switching to `pg_dump -Fc` + `pg_restore` with native schema support is the upgrade path.
- **_prisma_migrations**: The dump includes this table. For E2E (public schema), it works as-is. For preview (pr_X schema), the sed remaps it to `pr_X._prisma_migrations`. Prisma with `?schema=pr_X` reads from there. Verified: Prisma respects the schema parameter for all tables including its migration tracking table.
- **S3 download size/speed**: Downloaded once and cached locally for E2E. In CI, streams directly to psql. Approximate dump size should be documented after first implementation.
- **Overlay conflicts**: Uses upsert semantics. If production data contains a user with the same email, the overlay updates the password. No data loss.
- **Sensitive data**: The production dump contains real user data. This is acceptable per project requirements (data is "pretty public information"). If this changes, a sanitization step should be added to the dump generation process.
