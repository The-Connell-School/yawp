# OrgMembership cutover runbook

**Date:** 2026-06-13  
**Migration:** `packages/prisma/migrations/20260613180000_org_membership/`  
**Spec:** `docs/superpowers/specs/2026-06-13-org-membership-design.md`  
**Production DB access:** `docs/superpowers/runbooks/production-db-access.md`

This is a **big-bang, downtime** release. Schema and application code deploy together. There is no partial rollback path — restore the pre-cutover database snapshot and redeploy the previous application tag.

---

## Pre-cutover gates (do not skip)

- [ ] Bryant approved the production downtime window.
- [ ] Release branch is green in CI (unit tests + e2e smoke).
- [ ] Migration SQL reviewed:
  - `20260612120000_assignment_templates_and_class_assignments/migration.sql`
  - `20260613180000_org_membership/migration.sql`
- [ ] Application release artifact built from the same commit as the migration.
- [ ] On-call knows how to enable maintenance mode and restore RDS from snapshot.
- [ ] Final pre-cutover RDS snapshot taken immediately before `migrate deploy`.

---

## Data preservation (forensic / legacy tables)

These migrations **do not delete production rows**. They copy dropped columns/tables into forensic tables before structural changes:

| Migration | Forensic table | Preserves |
| --- | --- | --- |
| `20260612120000_assignment_templates_and_class_assignments` | `AssignmentClassIdForensic` | former `Assignment.classId` |
| same | `AssignmentDueDateForensic` | former `Assignment.dueDate` |
| `20260613180000_org_membership` | `FeatureAccessTargetTeacherForensic` | teacher-scoped flag rows before ID rewire |
| same | `DocumentStudentProfileIdForensic` | former `Document.studentProfileId` |
| same | `TeacherProfileForensic` | full `TeacherProfile` table |
| same | `StudentProfileForensic` | full `StudentProfile` table |

`Profile` is renamed to `OrgMembership` (same primary keys). Live assignment rows remain; class linkage moves to `ClassAssignment`.

Teacher-scoped `FeatureAccessTarget.targetId` values are rewired from `TeacherProfile.id` → membership id (`Profile.id`) during the org migration.

**Rollback note:** forensic tables survive on the migrated database. Full app rollback still requires restoring the **pre-cutover RDS snapshot** and redeploying the previous app tag — forensic tables are for investigation and manual recovery, not automatic rollback.

---

## Pre-cutover staging rehearsal

Run against a **fresh restore** of the latest production snapshot. Do not rehearse on live production.

### 1. Snapshot and restore

1. Take a production RDS snapshot (or confirm the latest automated snapshot).
2. Restore snapshot to a staging database (separate instance or disposable restore).
3. Point staging `DATABASE_URL` at the restored database.

### 2. Pre-migration verification (recommended, not blocking if snapshot is fresh)

The precheck script in this repo expects the **pre-cutover Prisma schema** (`Profile`, `TeacherProfile`, etc.). On the OrgMembership release branch, that script will not run against an already-migrated database.

**Minimum gate before production migrate:** a fresh RDS snapshot taken immediately before cutover.

**Optional gate:** run precheck from the **previous application release** (pre-OrgMembership tag) against the restored snapshot, or inspect the snapshot manually for duplicate `(userId, organizationId)` profiles and orphan sub-profiles.

```bash
cd packages/prisma
bun run scripts/org-membership-precheck.ts
```

Expected when run on pre-cutover schema: JSON report with `"ok": true`. If blockers appear, stop and resolve before continuing.

Blocker kinds:

- `dual_sub_profile` — profile has both teacher and student sub-profiles (migration auto-resolves to TEACHER; investigate before cutover)
- `document_mismatch` — document profile does not match student sub-profile parent
- `orphan_sub_profile` — teacher/student sub-profile without parent profile
- `duplicate_user_org` — more than one profile per user+organization

### 3. Apply migrations on staging

```bash
cd packages/prisma
bun run prisma migrate deploy
bun run prisma generate
```

Expected: all pending migrations through `20260613180000_org_membership` finish without error.

### 4. Post-migration verification (must exit 0)

```bash
cd packages/prisma
bun run scripts/org-membership-postcheck.ts
```

Expected: JSON report with `"ok": true`. Confirms:

- `TeacherProfile` / `StudentProfile` tables are gone
- `OrgMembership` row count matches former `Profile` count
- No documents missing `membershipId`
- No orphan class/school join rows

### 5. Deploy staging application build

Deploy the OrgMembership application release to staging with staging env vars. Confirm:

- Cookie name is `membership-id` (not `profile-id`)
- `/api/membership-id` org switcher works
- `/no-membership` route loads for users without memberships

### 6. Automated e2e on staging-like data

From a developer machine or CI against the staging URL (or local restore):

```bash
cd services/web-app
bun run test:e2e:prepare   # if using isolated e2e DB
bun run test:e2e:smoke
```

Expected: smoke suite passes. Full suite optional before production:

```bash
bun run test:e2e:full
```

### 7. Manual smoke on staging

Use real personas from the restored data (or seeded staging accounts):

- [ ] Login teacher / student / org owner / platform admin
- [ ] Multi-org user switches org via membership switcher (`membership-id` cookie updates)
- [ ] Teacher creates class, adds student, moves student between classes
- [ ] Student starts assignment, saves document, submits
- [ ] Teacher grades submission and releases grades
- [ ] Org owner opens org students/teachers admin pages
- [ ] Teacher enables student preview mode; student nav appears read-only
- [ ] Dev login personas work (local only)

---

## Production cutover sequence

Execute in order during the approved downtime window.

### 1. Announce and enter maintenance

1. Enable maintenance mode (app unavailable to users).
2. Confirm no active user sessions are writing (optional: wait 2–5 minutes).

### 2. Final production snapshot

Take a **final** RDS snapshot immediately before migration. Record snapshot id — this is the rollback restore point.

### 3. Pre-migration verification on production

```bash
cd packages/prisma
# DATABASE_URL must point at production via bastion tunnel
bun run scripts/org-membership-precheck.ts
```

**Stop if exit code ≠ 0.** Do not migrate until blockers are resolved or explicitly waived by Bryant.

### 4. Apply migration

```bash
cd packages/prisma
bun run prisma migrate deploy
bun run prisma generate
```

Or use the existing remote helper if that is the team standard:

```bash
bun prisma:migrate-remote production
```

### 5. Deploy application release

Deploy the OrgMembership application build to production. Single release — no dual-write period.

### 6. Post-migration verification

```bash
cd packages/prisma
bun run scripts/org-membership-postcheck.ts
```

**Stop if exit code ≠ 0** until the failure is understood.

### 7. Production manual smoke (~5 minutes)

Quick checks before opening traffic:

- [ ] Teacher login → dashboard / my classes loads
- [ ] Student login → assignments / documents load
- [ ] Org owner login → organization admin pages load
- [ ] Platform admin login → admin routes load
- [ ] Multi-org user switches membership; sidebar reflects role
- [ ] Open a class → roster and documents tab load
- [ ] Open a submitted document → teacher grading panel loads

### 8. Disable maintenance mode

1. Disable maintenance mode.
2. Monitor error logs and support channels for 30 minutes.
3. Keep the pre-cutover snapshot for at least 7 days.

---

## Rollback procedure

Use only if cutover fails before traffic is restored, or immediately after if critical regressions appear.

There is **no** schema-only rollback. Roll back both database and application together.

### 1. Maintenance mode on

Stop new traffic immediately.

### 2. Restore pre-cutover snapshot

Restore the RDS instance (or create a new instance) from the **final pre-migration snapshot** taken in step 2 of the cutover sequence.

Update production `DATABASE_URL` to point at the restored database if the endpoint changed.

### 3. Redeploy previous application release

Redeploy the last known-good release tag from **before** the OrgMembership migration. That build expects `Profile`, `TeacherProfile`, and `StudentProfile` tables and the `profile-id` cookie.

### 4. Verify rollback smoke

- [ ] Teacher and student login succeed
- [ ] Class page loads with roster
- [ ] Document editor opens and saves

### 5. Post-mortem before retry

Do not re-attempt cutover until:

- Staging rehearsal passes end-to-end
- Root cause of production failure is documented
- Bryant approves a new window

---

## Manual smoke checklist (from spec)

Full behavioral parity checklist for staging rehearsal or post-cutover validation:

- [ ] Login / logout / password reset
- [ ] Dev login personas (local)
- [ ] Teacher invitation + onboarding
- [ ] Student invitation + class join + enter-code
- [ ] Org owner onboarding
- [ ] Multi-org user switches membership
- [ ] Teacher creates class, adds/removes/moves students
- [ ] Student starts assignment, saves doc, submits
- [ ] Teacher grades, releases grade, leaves comments
- [ ] Admin impersonation (super admin)
- [ ] Org owner manages students/teachers lists
- [ ] Feature flag targeting by membership/org still resolves
- [ ] AP history library, assignment types, grading assistant flows

---

## Reference commands

| Step | Command |
| --- | --- |
| Precheck | `cd packages/prisma && bun run scripts/org-membership-precheck.ts` |
| Migrate | `cd packages/prisma && bun run prisma migrate deploy` |
| Postcheck | `cd packages/prisma && bun run scripts/org-membership-postcheck.ts` |
| E2E prepare | `cd services/web-app && bun run test:e2e:prepare` |
| E2E smoke | `cd services/web-app && bun run test:e2e:smoke` |

---

## Success criteria

1. Postcheck exits 0 on production after migration.
2. E2e smoke suite passes against OrgMembership schema.
3. Manual smoke checklist passes on staging before production cutover.
4. No orphaned class, document, or submission references after migration.
5. Forensic tables present with expected row counts (spot-check `TeacherProfileForensic`, `AssignmentClassIdForensic`).
6. Teacher-scoped feature flags resolve for a known pilot teacher after cutover.
