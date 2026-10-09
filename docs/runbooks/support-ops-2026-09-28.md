# YAWP Production Support Ops — 2026‑09‑28 (Investigation Only)

Status: draft (do not run in production without approval)
Scope: document safest sanctioned paths; prefer in‑product UIs and internal admin services over SQL

- Audience: school admins and Yawp support with org‑owner or platform‑admin access
- Never mutate production without:
  - a read‑only preview query first
  - an audit path (internal impersonation session or UI action)
  - a verification step

Admin surfaces discovered in this repo

- Teacher roster UI: `/app/my-classes/:classId` — add/remove/move students; role: TEACHER on that class.
- Org owner student UI: `/app/organization/students` — edit a student’s class assignments; role: ORG OWNER.
- Org classes UI: `/app/organization/classes` — create/edit/archive classes and assign teachers; role: ORG OWNER.
- Internal impersonation session (write-enabled, audited): `/auth/internal-impersonation` (link issued by Yawp Internal); denies `/app/admin`.
- Directory APIs for Yawp Internal (Bearer key): `/api.internal.v1.users` and `/api.internal.v1.users/:id` (read-only; used to look up principals).

Sibling repo (The-Connell-School/yawp-internal)

- This repo integrates with a separate internal admin platform (Yawp Internal) that issues impersonation sessions and manages QA accounts. While this codebase references those capabilities (e.g., internal impersonation runtime and QA endpoints), the admin console itself lives in the sibling repo. Use Yawp Internal to:
  - open an impersonation session for a teacher/owner (audited; write-safe)
  - create org-scoped QA accounts (not tied to real emails)

Model notes relevant to roster ops

- Classes link to memberships (OrgMembership) via join tables:
  - `_ClassStudents` (“A” = classId, “B” = membershipId)
  - `_ClassTeachers` (“A” = classId, “B” = membershipId)
- Student work is preserved when roster changes:
  - Group membership withdraws access via `DocumentGroupMember.removedAt` (soft), not a hard delete
  - Documents and Submissions remain; removing/moving students hides prior class work from teacher views but does not delete it
- Internal impersonation writes are audited in `InternalImpersonationEvent`, and DB triggers enforce coverage.

Conventions for preview SQL (read‑only)

- Replace placeholders with actual values:
  - :school_name, :class_label, :org_id, :class_id, :teacher_name, :student_email, :student_name
- Use case‑insensitive matches where appropriate (`ILIKE`).
- Quote camelCase identifiers (tables and columns) to match the production schema.

Operation 1 — SJP 1D: remove student Vincent Denecour from the class

Recommended path

1) Preferred: teacher roster UI (audited via internal impersonation)

- Open an internal impersonation session for the teacher who owns class 1D (Yawp Internal issues the link).
- Go to `/app/my-classes/:classId` → Students tab.
- Select “Vincent Denecour” → click “Remove” (trash/minus icon) → confirm.
- This calls the route action `intent="remove-students"` which:
  - sets `DocumentGroupMember.removedAt` for any groups in that class
  - disconnects the student membership from the class (`_ClassStudents`)

2) Alternative (org‑owner UI)

- Go to `/app/organization/students`.
- Search: Vincent’s name or email.
- Edit → uncheck class “1D” in the class list → Update Student.
- This calls `replaceStudentClassRoster`, which locks rosters and applies the set.

Preview (read‑only) SQL

- Find school and class candidates:

```sql
-- School (SJP) and likely "1D" classes (title OR grade/period); confirm manually
SELECT s.id AS school_id, s.name
FROM "School" s
WHERE s.name ILIKE '%st. joe%prep%' OR s.name ILIKE '%sjp%';

SELECT c.id AS class_id, c."schoolId", c."code", c."grade", c."period", c."title", c."isArchived"
FROM "Class" c
WHERE c."schoolId" = :school_id
  AND (
    c."title" ILIKE '%1D%' OR
    (c."grade" = '1' AND c."period" ILIKE 'D') OR
    c."code" ILIKE '%1D%'
  );
```

- Resolve organization id and student membership:

```sql
-- SJP’s organization id (single row expected per school)
SELECT s."organizationId" AS org_id FROM "School" s WHERE s.id = :school_id;

-- Vincent’s student membership in that org
SELECT m.id        AS membership_id,
       u.id        AS user_id,
       u.name,
       u.email
FROM "OrgMembership" m
JOIN "User" u ON u.id = m."userId"
WHERE m."organizationId" = :org_id
  AND m."role" = 'STUDENT'
  AND (u.email ILIKE '%vincent%denecour%' OR u.name ILIKE '%vincent%denecour%');
```

- Confirm enrollment and group membership in class 1D:

```sql
-- Enrollment link in 1D
SELECT 1
FROM "_ClassStudents"
WHERE "A" = :class_id AND "B" = :membership_id;

-- Any active group memberships in this class
SELECT dgm.id, dgm."groupId", dgm."removedAt"
FROM "DocumentGroupMember" dgm
JOIN "DocumentGroup" dg ON dg.id = dgm."groupId"
JOIN "ClassAssignment" ca ON ca.id = dg."classAssignmentId"
WHERE dgm."membershipId" = :membership_id
  AND ca."classId" = :class_id
  AND dgm."removedAt" IS NULL;
```

Verification

```sql
-- No remaining enrollment
SELECT 1
FROM "_ClassStudents"
WHERE "A" = :class_id AND "B" = :membership_id;

-- Group membership rows soft-withdrawn
SELECT COUNT(*) AS still_active_group_links
FROM "DocumentGroupMember" dgm
JOIN "DocumentGroup" dg ON dg.id = dgm."groupId"
JOIN "ClassAssignment" ca ON ca.id = dg."classAssignmentId"
WHERE dgm."membershipId" = :membership_id
  AND ca."classId" = :class_id
  AND dgm."removedAt" IS NULL;
```

Risks

- None of the student’s documents or submissions are deleted; access to groups in the removed class is withdrawn via `removedAt`.
- Ensure you’re acting in the correct tenant (org) and class id to avoid cross‑org changes.

Audit

- Perform via internal impersonation for an audited write; events are recorded in `InternalImpersonationEvent`.

Operation 2 — Move Frank Rocchi’s 1G students out of class 1D

Recommended path

1) Preferred bulk move: teacher roster UI (for the teacher who owns class 1D)

- Impersonate the class‑1D teacher via Yawp Internal.
- Open `/app/my-classes/:classId` for 1D → Students tab.
- Multi‑select the affected students (Frank’s 1G roster who were placed in 1D).
- Click “Move Students” → choose target class “1G” → confirm.
- The acting teacher must teach both source and destination classes to move students between them.
- Action `intent="move-students"`:
  - sets `DocumentGroupMember.removedAt` in 1D
  - disconnects from 1D and connects to 1G in `_ClassStudents`
  - locks rosters and group deployments for both classes during the transaction

2) Alternative (org‑owner, one‑by‑one)

- `/app/organization/students` → search/filter by name/email (optionally match `OrgMembership.schoolTeacher ILIKE '%Rocchi%'` for quick triage).
- Edit student → uncheck 1D, check 1G → Update Student (calls `replaceStudentClassRoster`).

Preview (read‑only) SQL

```sql
-- Find teacher (Frank) and his teacher memberships for context
SELECT m.id AS teacher_membership_id, u.email, u.name
FROM "OrgMembership" m
JOIN "User" u ON u.id = m."userId"
WHERE m."role" = 'TEACHER' AND u.name ILIKE '%frank%rocchi%';

-- Candidate class ids (1D and 1G) in the same school/org
SELECT c.id, c."code", c."grade", c."period", c."title", c."schoolId"
FROM "Class" c
WHERE c."schoolId" = :school_id
  AND (
    c."title" ILIKE '%1D%' OR (c."grade" = '1' AND c."period" ILIKE 'D') OR c."code" ILIKE '%1D%'
    OR c."title" ILIKE '%1G%' OR (c."grade" = '1' AND c."period" ILIKE 'G') OR c."code" ILIKE '%1G%'
  );

-- Students in 1D whose schoolTeacher display matches Frank (best‑effort filter)
SELECT s.id AS student_membership_id, u.email, u.name, s."schoolTeacher"
FROM "OrgMembership" s
JOIN "User" u ON u.id = s."userId"
WHERE s."role" = 'STUDENT'
  AND s."organizationId" = :org_id
  AND s."schoolTeacher" ILIKE '%rocchi%'
  AND EXISTS (SELECT 1 FROM "_ClassStudents" x WHERE x."A" = :class_1d_id AND x."B" = s.id);
```

Verification

```sql
-- After move: no student remains linked to 1D
SELECT COUNT(*) AS still_in_1d
FROM "_ClassStudents" x
WHERE x."A" = :class_1d_id AND x."B" = ANY(:moved_membership_ids);

-- After move: all are linked to 1G
SELECT COUNT(*) AS linked_to_1g
FROM "_ClassStudents" x
WHERE x."A" = :class_1g_id AND x."B" = ANY(:moved_membership_ids);

-- Group memberships in 1D withdrawn
SELECT COUNT(*) AS active_group_links_in_1d
FROM "DocumentGroupMember" dgm
JOIN "DocumentGroup" dg ON dg.id = dgm."groupId"
JOIN "ClassAssignment" ca ON ca.id = dg."classAssignmentId"
WHERE dgm."membershipId" = ANY(:moved_membership_ids)
  AND ca."classId" = :class_1d_id
  AND dgm."removedAt" IS NULL;
```

Risks

- Same as Op 1: group access in 1D is withdrawn, work preserved; ensure the correct class ids and org scope.
- Bulk move via teacher UI is faster; if not teacher on 1D, either:
  - temporarily add yourself as a teacher to 1D in `/app/organization/classes`, perform the move, then remove yourself, or
  - perform one‑by‑one edits in `/app/organization/students`.

Audit

- Use internal impersonation to get audited writes.

Operation 3 — Create a free dummy/test UA student account for Jessica Crew (jncrew@gmail.com)

Goal

- Give Jessica a student‑role membership inside the UA organization with active access, without payment.

Safest sanctioned paths

Path A (recommended, least invasive): UA signup + manual license grant (audited)

1) Have Jessica self‑register as a UA student (no data entry by support):
   - Send her to `/ua/sign-up` on the configured UA partner hostname (the app redirects non‑partner origins). She’ll receive a verification email.
   - This creates a `User` and an `OrgMembership` (role STUDENT) in the UA org after verification.
2) After she verifies (and before she hits `/billing/ua`), grant a UA student license to her membership (one‑time, manual, audited):
   - Use an internal impersonation session as a UA org owner (for audit scope) and run the small admin script below (dry‑run first, then `--apply`):

CLI (ops) — dry‑run by default; pass `--apply` to write; include `--actor-id` and `--actor-email` for audit

```bash
# Preview the planned grant (no writes)
bun run packages/prisma/scripts/grant-ua-student-license.ts \
  --email jncrew@gmail.com \
  --organization-id <UA_ORG_ID> \
  --actor-id <YOUR_STAFF_OR_MEMBERSHIP_ID> \
  --actor-email you@yawp.school

# Commit the grant (writes), once preview looks correct
bun run packages/prisma/scripts/grant-ua-student-license.ts \
  --email jncrew@gmail.com \
  --organization-id <UA_ORG_ID> \
  --actor-id <YOUR_STAFF_OR_MEMBERSHIP_ID> \
  --actor-email you@yawp.school \
  --apply
```

What it does

- Looks up `User` by email (case‑insensitive), resolves the active STUDENT `OrgMembership` in the given UA org, then upserts a `StudentLicense` for cohort `ua-2026` with `status='ACTIVE'` and `validUntil` set to the configured UA license end date. Source is recorded as `MANUAL`. Dry‑run prints the target ids and values without writing. On `--apply` it appends an audit row to `InternalImpersonationEvent` and prints a SQL rollback plan.

Preview (read‑only) SQL

```sql
-- Resolve UA org id (if not already known)
SELECT id, name FROM "Organization" WHERE name ILIKE '%alabama%';

-- Resolve user + UA membership
SELECT m.id AS membership_id, u.id AS user_id, u.email, u.name, m."organizationId"
FROM "OrgMembership" m
JOIN "User" u ON u.id = m."userId"
WHERE u.email ILIKE 'jncrew@gmail.com'
  AND m."role" = 'STUDENT'
  AND m."organizationId" = :ua_org_id
  AND m."isActive" = TRUE;

-- Any existing UA license (cohort is fixed)
SELECT id, "status", "cohort", "validUntil"
FROM "StudentLicense"
WHERE "membershipId" = :membership_id AND cohort = 'ua-2026';
```

Verification

```sql
SELECT id, "status", "cohort", "validUntil"
FROM "StudentLicense"
WHERE "membershipId" = :membership_id AND cohort = 'ua-2026';
```

Path B (fallback): internal QA account (different email)

- If using her real Gmail is not required, create a temporary QA student for UA org via Yawp Internal (`/api.internal.v1.qa.accounts`) and share the generated email/password. This avoids licensing entirely but does not use her address.

Unsupported/avoid

- Charging a card on production for a test (use Stripe test only in non‑prod).
- Direct SQL writes for licenses — prefer the audited script.

Included small admin script (safe, dry‑run default)

- File: `packages/prisma/scripts/grant-ua-student-license.ts`
- Test: `packages/prisma/scripts/grant-ua-student-license.test.ts`
- Behavior: dry‑run unless `--apply`; idempotent upsert on (`membershipId`,`cohort`); logs exactly what will change; writes an append‑only audit row and prints an exact rollback SQL plan.

General audit/logging

- Use internal impersonation whenever you need to perform writes on behalf of staff; it records `InternalImpersonationEvent` rows and enforces trigger coverage on all tables.

Appendix — exact UI routes and required roles

- Remove/move students (teacher): `/app/my-classes/:classId` — role TEACHER on that class.
- Edit student classes (owner): `/app/organization/students` — role ORG OWNER.
- Edit classes/teachers (owner): `/app/organization/classes` — role ORG OWNER.
- UA student signup: `/ua/sign-up` (UA partner host; code captured via cookie).
- Internal impersonation handoff: `/auth/internal-impersonation` (link from Yawp Internal).

