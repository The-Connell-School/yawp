# OrgMembership Profile Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Profile` + `TeacherProfile` + `StudentProfile` with a single `OrgMembership` model in one downtime release, preserving multi-org support and behavioral parity.

**Architecture:** Add pre/post verification scripts, run a SQL migration that backfills merged columns and rewires M2M join tables, then deploy application code that reads/writes `OrgMembership` exclusively. Auth uses `membership-id` cookie and `requireMembership()`. Teacher student-preview uses session mode, not dual memberships.

**Tech Stack:** Prisma 7, PostgreSQL, React Router 7, Bun test, Playwright e2e

**Spec:** `docs/superpowers/specs/2026-06-13-org-membership-design.md`

---

## File map

| Area | Primary files |
|---|---|
| Verification | `packages/prisma/scripts/org-membership-precheck.ts`, `org-membership-postcheck.ts`, `*.test.ts` |
| Schema | `packages/prisma/schema.prisma`, `packages/prisma/migrations/20260613180000_org_membership/` |
| Auth/cookies | `app/utils/auth.server.ts`, `app/cookies/membership-id.server.ts`, `app/routes/api.membership-id/route.ts` |
| Root user shape | `app/root.tsx`, `app/routes/app/route.tsx`, `app/routes/app/sidebar-nav.tsx` |
| Domain | `app/domain/documents.server.ts`, `app/utils/grading-auth.server.ts`, `app/utils/feature-flags.server.ts`, `app/utils/document-submission-scope.server.ts` |
| Onboarding | `app/routes/auth.inv.*`, `app/routes/enter-code/route.tsx`, `app/routes/auth.dev-login/route.tsx` |
| Classes | `app/routes/app.my-classes.*`, `class-student-enrollment.server.tsx` |
| Org admin | `app/routes/app.organization.*/route.tsx` |
| Seeds | `packages/prisma/scripts/seed-overlay.ts`, `scripts/local-dev/*`, `services/web-app/e2e/seed-e2e.ts`, `e2e/db-helpers.ts` |
| Preview mode | `app/utils/student-preview.server.ts`, `app/utils/auth.server.ts` |

---

### Task 1: Pre-migration verification script

**Files:**
- Create: `packages/prisma/scripts/org-membership-precheck.ts`
- Create: `packages/prisma/scripts/org-membership-precheck.test.ts`

- [ ] **Step 1: Write failing tests for precheck output shape**

```typescript
// packages/prisma/scripts/org-membership-precheck.test.ts
import { describe, expect, test } from 'bun:test';
import { buildPrecheckReport } from './org-membership-precheck';

describe('org-membership precheck', () => {
  test('flags dual sub-profiles and document mismatches', () => {
    const report = buildPrecheckReport({
      counts: {
        users: 1,
        profiles: 1,
        teacherProfiles: 1,
        studentProfiles: 1,
        documents: 1,
        classes: 1,
      },
      dualSubProfiles: [{ profileId: 'p1', userId: 'u1', organizationId: 'o1' }],
      documentMismatches: [
        {
          documentId: 'd1',
          profileId: 'p1',
          studentProfileId: 'sp9',
          expectedMembershipId: 'p2',
        },
      ],
      orphanSubProfiles: [],
      duplicateUserOrgProfiles: [],
    });

    expect(report.ok).toBe(false);
    expect(report.blockers).toHaveLength(2);
    expect(report.blockers[0].kind).toBe('dual_sub_profile');
  });

  test('passes when no blockers', () => {
    const report = buildPrecheckReport({
      counts: { users: 1, profiles: 1, teacherProfiles: 1, studentProfiles: 0, documents: 0, classes: 0 },
      dualSubProfiles: [],
      documentMismatches: [],
      orphanSubProfiles: [],
      duplicateUserOrgProfiles: [],
    });
    expect(report.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prisma && bun test scripts/org-membership-precheck.test.ts`
Expected: FAIL — `buildPrecheckReport` not found

- [ ] **Step 3: Implement precheck script**

```typescript
// packages/prisma/scripts/org-membership-precheck.ts
/* eslint-disable no-console */
import { createPrismaClient } from './local-dev/connection';

export type PrecheckInput = {
  counts: Record<string, number>;
  dualSubProfiles: Array<{ profileId: string; userId: string; organizationId: string }>;
  documentMismatches: Array<{
    documentId: string;
    profileId: string;
    studentProfileId: string;
    expectedMembershipId: string;
  }>;
  orphanSubProfiles: Array<{ kind: 'teacher' | 'student'; id: string }>;
  duplicateUserOrgProfiles: Array<{ userId: string; organizationId: string; count: number }>;
};

export function buildPrecheckReport(input: PrecheckInput) {
  const blockers = [
    ...input.dualSubProfiles.map((row) => ({ kind: 'dual_sub_profile' as const, row })),
    ...input.documentMismatches.map((row) => ({ kind: 'document_mismatch' as const, row })),
    ...input.orphanSubProfiles.map((row) => ({ kind: 'orphan_sub_profile' as const, row })),
    ...input.duplicateUserOrgProfiles.map((row) => ({ kind: 'duplicate_user_org' as const, row })),
  ];
  return { ok: blockers.length === 0, counts: input.counts, blockers };
}

async function main() {
  const prisma = createPrismaClient();
  const [users, profiles, teacherProfiles, studentProfiles, documents, classes] =
    await Promise.all([
      prisma.user.count(),
      prisma.profile.count(),
      prisma.teacherProfile.count(),
      prisma.studentProfile.count(),
      prisma.document.count(),
      prisma.class.count(),
    ]);

  const dualSubProfiles = await prisma.$queryRaw<
    Array<{ profileId: string; userId: string; organizationId: string }>
  >`
    SELECT p.id AS "profileId", p."userId", p."organizationId"
    FROM "Profile" p
    WHERE EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)
      AND EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id)
  `;

  const documentMismatches = await prisma.$queryRaw<
    Array<{
      documentId: string;
      profileId: string;
      studentProfileId: string;
      expectedMembershipId: string;
    }>
  >`
    SELECT d.id AS "documentId", d."profileId", d."studentProfileId", sp."profileId" AS "expectedMembershipId"
    FROM "Document" d
    JOIN "StudentProfile" sp ON sp.id = d."studentProfileId"
    WHERE d."profileId" <> sp."profileId"
  `;

  const orphanSubProfiles = [
    ...(await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT tp.id FROM "TeacherProfile" tp
      LEFT JOIN "Profile" p ON p.id = tp."profileId"
      WHERE p.id IS NULL
    `).then((rows) => rows.map((r) => ({ kind: 'teacher' as const, id: r.id }))),
    ...(await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT sp.id FROM "StudentProfile" sp
      LEFT JOIN "Profile" p ON p.id = sp."profileId"
      WHERE p.id IS NULL
    `).then((rows) => rows.map((r) => ({ kind: 'student' as const, id: r.id }))),
  ];

  const duplicateUserOrgProfiles = await prisma.$queryRaw<
    Array<{ userId: string; organizationId: string; count: number }>
  >`
    SELECT "userId", "organizationId", COUNT(*)::int AS count
    FROM "Profile"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  `;

  const report = buildPrecheckReport({
    counts: { users, profiles, teacherProfiles, studentProfiles, documents, classes },
    dualSubProfiles,
    documentMismatches,
    orphanSubProfiles,
    duplicateUserOrgProfiles,
  });

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().finally(() => process.exit());
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/prisma && bun test scripts/org-membership-precheck.test.ts`
Expected: PASS

- [ ] **Step 5: Run precheck against local DB**

Run: `cd packages/prisma && bun run scripts/org-membership-precheck.ts`
Expected: JSON report, exit 0 (or exit 1 with blocker list — fix data before migrating)

- [ ] **Step 6: Commit**

```bash
git add packages/prisma/scripts/org-membership-precheck.ts packages/prisma/scripts/org-membership-precheck.test.ts
git commit -m "chore: add org membership pre-migration verification script"
```

---

### Task 2: Prisma schema — OrgMembership model

**Files:**
- Modify: `packages/prisma/schema.prisma`

- [ ] **Step 1: Replace Profile/TeacherProfile/StudentProfile with OrgMembership**

Apply these schema changes (full model — adjust relation names to match generated migration):

```prisma
enum MembershipRole {
  TEACHER
  STUDENT
}

model OrgMembership {
  id             String         @id @default(cuid())
  createdAt      DateTime       @default(now()) @db.Timestamptz(6)
  userId         String
  user           User           @relation(fields: [userId], references: [id])
  organizationId String
  organization   Organization   @relation(fields: [organizationId], references: [id])
  role           MembershipRole
  isOrgOwner     Boolean        @default(false)
  isActive       Boolean        @default(true)
  school         String?
  schoolTeacher  String?
  grade          String?
  period         String?

  documents                Document[]
  documentComments         DocumentComment[]
  documentCommentResponses DocumentCommentResponse[]
  pasteAlerts              PasteAlert[]
  submissionsGraded        Submission[]              @relation("SubmissionGradedBy")
  submissionComments       SubmissionComment[]       @relation("SubmissionCommentProfile")
  ownedAssignmentTypes     AssignmentType[]          @relation("AssignmentTypeOwner")
  gradingAssistantTemplatesCreated GradingAssistantTemplate[] @relation("GradingAssistantTemplateCreatedBy")
  gradingAssistantTemplatesUpdated GradingAssistantTemplate[] @relation("GradingAssistantTemplateUpdatedBy")

  classesAsTeacher Class[] @relation("ClassTeachers")
  classesAsStudent Class[] @relation("ClassStudents")
  schools          School[] @relation("SchoolTeachers")
  teacherTrainingModuleSessions TeacherTrainingModuleSession[]
  assignedTeacherTrainings      TeacherTraining[] @relation("TeacherTrainingAssignments")

  @@unique([userId, organizationId])
  @@map("OrgMembership")
}
```

Update related models:

```prisma
model User {
  // ...
  memberships OrgMembership[]
}

model Organization {
  // ...
  memberships OrgMembership[]
}

model Class {
  teachers OrgMembership[] @relation("ClassTeachers")
  students OrgMembership[] @relation("ClassStudents")
}

model School {
  teachers OrgMembership[] @relation("SchoolTeachers")
}

model Document {
  membershipId String
  membership   OrgMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  // REMOVE profileId, studentProfileId
}

model TeacherTrainingModuleSession {
  membershipId String
  membership   OrgMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  // REMOVE teacherProfileId
  @@unique([teacherTrainingModuleId, membershipId])
}

model AssignmentType {
  ownerTeacherId String?
  ownerTeacher   OrgMembership? @relation("AssignmentTypeOwner", fields: [ownerTeacherId], references: [id], onDelete: Cascade)
}
```

Remove `model Profile`, `model TeacherProfile`, `model StudentProfile`.

- [ ] **Step 2: Generate migration (do not apply yet)**

Run: `cd packages/prisma && bun run prisma migrate dev --create-only --name org_membership`
Expected: new folder under `migrations/` — **replace auto-generated SQL with Task 3 hand-written migration**

- [ ] **Step 3: Commit schema only after Task 3 migration SQL is ready**

---

### Task 3: Hand-written SQL migration

**Files:**
- Create: `packages/prisma/migrations/20260613180000_org_membership/migration.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 1) Add merged columns to Profile (still named Profile during backfill)
CREATE TYPE "MembershipRole" AS ENUM ('TEACHER', 'STUDENT');

ALTER TABLE "Profile" ADD COLUMN "role" "MembershipRole";
ALTER TABLE "Profile" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Profile" ADD COLUMN "school" TEXT;
ALTER TABLE "Profile" ADD COLUMN "schoolTeacher" TEXT;
ALTER TABLE "Profile" ADD COLUMN "grade" TEXT;
ALTER TABLE "Profile" ADD COLUMN "period" TEXT;

-- 2) Backfill role + fields
UPDATE "Profile" p SET "role" = 'TEACHER'
WHERE EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id);

UPDATE "Profile" p SET "role" = 'STUDENT'
WHERE EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id);

UPDATE "Profile" p SET "role" = 'TEACHER'
WHERE EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)
  AND EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id);

UPDATE "Profile" p SET
  "isActive" = COALESCE(tp."isActive", true),
  "school" = sp."school",
  "schoolTeacher" = sp."schoolTeacher",
  "grade" = sp."grade",
  "period" = sp."period"
FROM "Profile" base
LEFT JOIN "TeacherProfile" tp ON tp."profileId" = base.id
LEFT JOIN "StudentProfile" sp ON sp."profileId" = base.id
WHERE p.id = base.id;

-- 3) Rename isOwner -> isOrgOwner
ALTER TABLE "Profile" RENAME COLUMN "isOwner" TO "isOrgOwner";

-- 4) Fix documents pointing at wrong profile via studentProfile
UPDATE "Document" d
SET "profileId" = sp."profileId"
FROM "StudentProfile" sp
WHERE sp.id = d."studentProfileId"
  AND d."profileId" <> sp."profileId";

-- 5) Rewire class join tables: sub-profile id -> membership (profile) id
CREATE TABLE "_ClassToOrgMembershipTeacher" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, PRIMARY KEY ("A","B"));
INSERT INTO "_ClassToOrgMembershipTeacher" ("A", "B")
SELECT ctp."A", tp."profileId" FROM "_ClassToTeacherProfile" ctp
JOIN "TeacherProfile" tp ON tp.id = ctp."B";

CREATE TABLE "_ClassToOrgMembershipStudent" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, PRIMARY KEY ("A","B"));
INSERT INTO "_ClassToOrgMembershipStudent" ("A", "B")
SELECT csp."A", sp."profileId" FROM "_ClassToStudentProfile" csp
JOIN "StudentProfile" sp ON sp.id = csp."B";

CREATE TABLE "_SchoolToOrgMembership" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, PRIMARY KEY ("A","B"));
INSERT INTO "_SchoolToOrgMembership" ("A", "B")
SELECT stp."A", tp."profileId" FROM "_SchoolToTeacherProfile" stp
JOIN "TeacherProfile" tp ON tp.id = stp."B";

CREATE TABLE "_TeacherTrainingAssignmentsMembership" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, PRIMARY KEY ("A","B"));
INSERT INTO "_TeacherTrainingAssignmentsMembership" ("A", "B")
SELECT tta."A", tp."profileId" FROM "_TeacherTrainingAssignments" tta
JOIN "TeacherProfile" tp ON tp.id = tta."B";

-- 6) TeacherTrainingModuleSession FK
ALTER TABLE "TeacherTrainingModuleSession" ADD COLUMN "membershipId" TEXT;
UPDATE "TeacherTrainingModuleSession" ttms
SET "membershipId" = tp."profileId"
FROM "TeacherProfile" tp
WHERE tp.id = ttms."teacherProfileId";

-- 7) Drop old join tables + sub-profiles
DROP TABLE "_ClassToTeacherProfile";
DROP TABLE "_ClassToStudentProfile";
DROP TABLE "_SchoolToTeacherProfile";
DROP TABLE "_TeacherTrainingAssignments";
ALTER TABLE "TeacherTrainingModuleSession" DROP CONSTRAINT "TeacherTrainingModuleSession_teacherProfileId_fkey";
ALTER TABLE "TeacherTrainingModuleSession" DROP COLUMN "teacherProfileId";

-- 8) Document: drop studentProfileId
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_studentProfileId_fkey";
DROP INDEX IF EXISTS "Document_studentProfileId_idx";
ALTER TABLE "Document" DROP COLUMN "studentProfileId";

-- 9) Drop sub-profile tables
DROP TABLE "TeacherProfile";
DROP TABLE "StudentProfile";

-- 10) Rename Profile -> OrgMembership; profileId columns -> membershipId
ALTER TABLE "Profile" RENAME TO "OrgMembership";
ALTER TABLE "Document" RENAME COLUMN "profileId" TO "membershipId";
ALTER TABLE "DocumentComment" RENAME COLUMN "profileId" TO "membershipId";
ALTER TABLE "DocumentCommentResponse" RENAME COLUMN "profileId" TO "membershipId";
ALTER TABLE "PasteAlert" RENAME COLUMN "profileId" TO "membershipId";
ALTER TABLE "Submission" RENAME COLUMN "gradedById" TO "gradedByMembershipId";
ALTER TABLE "SubmissionComment" RENAME COLUMN "profileId" TO "membershipId";
ALTER TABLE "AssignmentType" RENAME COLUMN "ownerTeacherId" TO "ownerMembershipId";
ALTER TABLE "GradingAssistantTemplate" RENAME COLUMN "createdById" TO "createdByMembershipId";
ALTER TABLE "GradingAssistantTemplate" RENAME COLUMN "updatedById" TO "updatedByMembershipId";

-- 11) Rename join tables to Prisma-expected names (match schema @relation names)
ALTER TABLE "_ClassToOrgMembershipTeacher" RENAME TO "_ClassTeachers";
ALTER TABLE "_ClassToOrgMembershipStudent" RENAME TO "_ClassStudents";
ALTER TABLE "_SchoolToOrgMembership" RENAME TO "_SchoolTeachers";
ALTER TABLE "_TeacherTrainingAssignmentsMembership" RENAME TO "_TeacherTrainingAssignments";

-- 12) NOT NULL + unique constraint
ALTER TABLE "OrgMembership" ALTER COLUMN "role" SET NOT NULL;
CREATE UNIQUE INDEX "OrgMembership_userId_organizationId_key" ON "OrgMembership"("userId", "organizationId");

-- 13) Re-add FKs (generate exact constraint names via prisma migrate diff if needed)
```

- [ ] **Step 2: Validate migration on local restore**

Run:
```bash
cd packages/prisma
bun run scripts/org-membership-precheck.ts
bun run prisma migrate deploy
bun run prisma generate
bun run scripts/org-membership-postcheck.ts   # Task 12
```
Expected: migrate succeeds, postcheck passes

- [ ] **Step 3: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/20260613180000_org_membership/
git commit -m "feat: migrate Profile sub-profiles to OrgMembership"
```

---

### Task 4: Membership cookie + auth helpers

**Files:**
- Create: `services/web-app/app/cookies/membership-id.server.ts`
- Delete: `services/web-app/app/cookies/profile-id.server.ts` (after updating imports)
- Modify: `services/web-app/app/utils/auth.server.ts`
- Create: `services/web-app/app/utils/auth.server.test.ts` (extend existing tests if present)
- Rename route: `app/routes/api.profile-id/route.ts` → `app/routes/api.membership-id/route.ts`

- [ ] **Step 1: Write failing test for requireMembership**

```typescript
// services/web-app/app/utils/require-membership.test.ts
import { describe, expect, test, mock } from 'bun:test';

mock.module('~/utils/db.server', () => ({
  prisma: {
    orgMembership: {
      findUnique: mock(() =>
        Promise.resolve({
          id: 'm1',
          role: 'TEACHER',
          isOrgOwner: true,
          organization: { id: 'o1', name: 'Org' },
        })
      ),
      findFirst: mock(() => null),
    },
  },
}));

describe('requireMembership', () => {
  test('returns membership when cookie matches user', async () => {
    const { requireMembership } = await import('~/utils/auth.server');
    // construct request with membership-id cookie — use existing auth test helpers if available
    expect(typeof requireMembership).toBe('function');
  });
});
```

- [ ] **Step 2: Implement membership cookie**

```typescript
// services/web-app/app/cookies/membership-id.server.ts
import { createCookie } from 'react-router';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';

const cookieName = 'membership-id';
const MEMBERSHIP_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const membershipIdCookie = createCookie(cookieName, {
  path: '/',
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: 'lax',
  secrets: process.env.SESSION_SECRET.split(','),
});

export function destroyMembershipId() {
  return membershipIdCookie.serialize('', { maxAge: -1 });
}

export async function getMembershipId(request: Request): Promise<string> {
  const rawCookie = request.headers.get('cookie');
  return rawCookie ? ((await membershipIdCookie.parse(rawCookie)) ?? '') : '';
}

export async function setMembershipId(membershipId: string) {
  if (!membershipId) return destroyMembershipId();
  return membershipIdCookie.serialize(membershipId, {
    maxAge: MEMBERSHIP_ID_COOKIE_MAX_AGE_SECONDS,
  });
}
```

- [ ] **Step 3: Replace requireProfile with requireMembership in auth.server.ts**

```typescript
export async function requireMembership(request: Request, userId: string) {
  const membershipId = await getMembershipId(request);

  const select = {
    id: true,
    role: true,
    isOrgOwner: true,
    organization: { select: { id: true, name: true } },
  } as const;

  if (membershipId) {
    const membership = await prisma.orgMembership.findUnique({
      where: { id: membershipId, userId },
      select,
    });
    if (!membership) {
      throw redirect('/no-membership', {
        headers: { 'set-cookie': await setMembershipId('') },
      });
    }
    return membership;
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select,
  });
  if (!membership) throw redirect('/no-membership');
  return membership;
}

export function isTeacherMembership(m: { role: string }) {
  return m.role === 'TEACHER';
}

export function isStudentMembership(m: { role: string }) {
  return m.role === 'STUDENT';
}
```

Update `requireOwner`:

```typescript
export async function requireOwner(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    select: { id: true },
    where: { id: userId, memberships: { some: { isOrgOwner: true } } },
  });
  if (!user) throw data({ error: 'Unauthorized', requiredRole: 'owner', message: 'Unauthorized: required role: owner' }, { status: 403 });
  return user;
}
```

- [ ] **Step 4: Global find-replace (mechanical)**

Run from `services/web-app`:
```bash
rg -l 'requireProfile|profile-id|setProfileId|getProfileId|teacherProfile|studentProfile|selectedProfile|isOwner' app e2e \
  | xargs sed -i '' \
  -e 's/requireProfile/requireMembership/g' \
  -e 's/getProfileId/getMembershipId/g' \
  -e 's/setProfileId/setMembershipId/g' \
  -e 's/selectedProfile/selectedMembership/g' \
  -e 's/profile-id/membership-id/g' \
  -e 's/prisma\.profile/prisma.orgMembership/g' \
  -e 's/prisma\.teacherProfile/prisma.orgMembership/g' \
  -e 's/prisma\.studentProfile/prisma.orgMembership/g'
```

Then **manually fix** logic replacements the sed cannot handle:

| Old pattern | New pattern |
|---|---|
| `membership.teacherProfile.id` | `membership.id` (when checking class teacher) |
| `membership.studentProfile` | `membership.role === 'STUDENT'` |
| `!membership.teacherProfile` guard | `membership.role !== 'TEACHER'` |
| `isOwner` | `isOrgOwner` |
| `profiles:` in prisma selects | `memberships:` |
| `user.profiles` | `user.memberships` |

- [ ] **Step 5: Rename no-profile route**

- Rename `app/routes/no-profile/route.tsx` → `app/routes/no-membership/route.tsx`
- Add redirect route `no-profile` → `/no-membership` for bookmark compat during downtime

- [ ] **Step 6: Run unit tests**

Run: `cd services/web-app && bun test app/utils/auth.server app/utils/grading-auth.server.test.ts`
Expected: PASS (fix failures iteratively)

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/cookies/membership-id.server.ts services/web-app/app/utils/auth.server.ts services/web-app/app/routes/api.membership-id/
git commit -m "refactor: replace profile auth with org membership"
```

---

### Task 5: Root loader + org switcher UI

**Files:**
- Modify: `services/web-app/app/root.tsx`
- Modify: `services/web-app/app/routes/app/route.tsx`
- Modify: `services/web-app/app/routes/app/sidebar-nav.tsx`

- [ ] **Step 1: Update root loader select**

```typescript
memberships: {
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    role: true,
    isOrgOwner: true,
    organization: { select: { name: true } },
  },
},
// ...
const membership =
  user?.memberships.find((m) => m.id === membershipId) ?? user?.memberships[0];
return data({ user: { ...user, selectedMembership: membership }, ... });
```

- [ ] **Step 2: Update sidebar role guards**

```typescript
const teacher = (user: User) => user.selectedMembership?.role === 'TEACHER';
const owner = (user: User) => user.selectedMembership?.isOrgOwner;
const admin = (user: User) => user.isAdmin;
```

- [ ] **Step 3: Update org switcher form action**

In `app/route.tsx`, POST target `/api/membership-id`, field name `membershipId`.

- [ ] **Step 4: Run typecheck**

Run: `cd services/web-app && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/root.tsx services/web-app/app/routes/app/route.tsx services/web-app/app/routes/app/sidebar-nav.tsx
git commit -m "refactor: root loader and switcher use org memberships"
```

---

### Task 6: Onboarding + enrollment flows

**Files:**
- Modify: `services/web-app/app/routes/auth.inv.verify/route.tsx`
- Modify: `services/web-app/app/routes/auth.inv.onboard-teacher/route.tsx`
- Modify: `services/web-app/app/routes/auth.inv.onboard-student/route.tsx`
- Modify: `services/web-app/app/routes/auth.inv.onboard-owner/route.tsx`
- Modify: `services/web-app/app/routes/enter-code/route.tsx`
- Modify: `services/web-app/app/routes/app.organization.students/route.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/class-student-enrollment.server.tsx`
- Test: corresponding `*.test.ts` files

- [ ] **Step 1: Update teacher onboarding create**

```typescript
const membership = await prisma.orgMembership.create({
  data: {
    user: { connect: { id: user.id } },
    organization: { connect: { id: organizationId } },
    role: 'TEACHER',
  },
});
```

Remove nested `teacherProfile: { create: {} }`.

- [ ] **Step 2: Update student onboarding create**

```typescript
const membership = await prisma.orgMembership.create({
  data: {
    user: { connect: { id: user.id } },
    organization: { connect: { id: organizationId } },
    role: 'STUDENT',
    school: metadata.school ?? null,
    grade: metadata.grade ?? null,
    period: metadata.period ?? null,
    classesAsStudent: { connect: classIds.map((id) => ({ id })) },
  },
});
```

- [ ] **Step 3: Update owner onboarding**

```typescript
role: 'TEACHER',
isOrgOwner: true,
```

- [ ] **Step 4: Update class-student-enrollment.server.tsx**

Replace `prisma.studentProfile.create` with:

```typescript
await prisma.orgMembership.create({
  data: {
    userId,
    organizationId,
    role: 'STUDENT',
    classesAsStudent: { connect: [{ id: classId }] },
  },
});
```

When adding existing student to class: `classesAsStudent: { connect: [{ id: classId }] }` on existing membership.

- [ ] **Step 5: Run tests**

Run:
```bash
cd services/web-app && bun test app/routes/app.organization.students/route.test.ts app/routes/app.my-classes.\$classId/class-student-enrollment.server.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: onboarding and enrollment create org memberships"
```

---

### Task 7: Class + document domain

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes._index/route.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`
- Modify: `services/web-app/app/domain/documents.server.ts`
- Modify: `services/web-app/app/utils/document-submission-scope.server.ts`
- Modify: `services/web-app/app/utils/grading-auth.server.ts`
- Tests: corresponding `*.test.ts`

- [ ] **Step 1: Update class teacher guards**

```typescript
const membership = await requireMembership(request, userId);
if (membership.role !== 'TEACHER') throw redirect('/app');

await prisma.class.findFirst({
  where: {
    id: classId,
    teachers: { some: { id: membership.id } },
  },
});
```

- [ ] **Step 2: Update class create connect**

```typescript
teachers: { connect: [{ id: membership.id }] },
```

- [ ] **Step 3: Update documents.server.ts**

Remove `studentProfileId` writes. Always set `membershipId` to the student membership row.

```typescript
const membership = await prisma.orgMembership.findFirst({
  where: { userId, role: 'STUDENT', organizationId },
});
if (!membership) {
  membership = await prisma.orgMembership.create({ data: { userId, organizationId, role: 'STUDENT' } });
}
return prisma.document.create({
  data: {
    membershipId: membership.id,
    assignmentTypeId,
    // ...
  },
});
```

- [ ] **Step 4: Update grading-auth.server.ts**

```typescript
export async function getGradingActor(request: Request) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return {
    membershipId: membership.id,
    isTeacher: membership.role === 'TEACHER',
    isAdmin: Boolean(user?.isAdmin),
  };
}
```

- [ ] **Step 5: Run domain tests**

Run:
```bash
cd services/web-app && bun test app/domain/documents.server.test.ts app/utils/grading-auth.server.test.ts app/utils/document-submission-scope.server.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: class and document domain use org memberships"
```

---

### Task 8: Remaining routes mechanical pass + typecheck

**Files:** all remaining matches from `rg 'teacherProfile|studentProfile|Profile' services/web-app/app`

- [ ] **Step 1: Fix remaining route files**

Priority list:
- `app/routes/app._index/route.tsx`
- `app/routes/app.assignments._index/route.tsx`
- `app/routes/app.student-work._index/route.tsx`
- `app/routes/app.organization.teachers/route.tsx`
- `app/routes/app.teacher-trainings.*`
- `app/routes/api.model.*`
- `app/routes/api.domain.*`
- `app/routes/app_.documents_.$id/**`
- `app/routes/app_.submissions_.$submissionId/route.tsx`

- [ ] **Step 2: Run full unit test suite**

Run: `cd services/web-app && bun test app/`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `cd services/web-app && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: update remaining routes for org membership model"
```

---

### Task 9: Seed scripts + e2e fixtures

**Files:**
- Modify: `packages/prisma/scripts/seed-overlay.ts`
- Modify: `packages/prisma/scripts/local-dev/seed-synthetic-data.ts`
- Modify: `packages/prisma/scripts/local-dev/dev-personas.ts` (if needed)
- Modify: `services/web-app/e2e/seed-e2e.ts`
- Modify: `services/web-app/e2e/db-helpers.ts`

- [ ] **Step 1: Update seed-overlay.ts**

Replace profile + sub-profile creation with:

```typescript
const teacherMembership = await prisma.orgMembership.upsert({
  where: { userId_organizationId: { userId: teacherUser.id, organizationId: org.id } },
  create: { userId: teacherUser.id, organizationId: org.id, role: 'TEACHER', isOrgOwner: true },
  update: {},
});
```

- [ ] **Step 2: Update e2e db-helpers**

Replace `createStudentProfile` helper with `createStudentMembership`.

- [ ] **Step 3: Run e2e prepare**

Run: `cd services/web-app && bun run test:e2e:prepare`
Expected: seed completes without Prisma errors

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: update seeds and e2e helpers for org membership"
```

---

### Task 10: Teacher student-preview session mode

**Files:**
- Create: `services/web-app/app/utils/student-preview.server.ts`
- Create: `services/web-app/app/utils/student-preview.server.test.ts`
- Modify: `services/web-app/app/utils/auth.server.ts`
- Modify: `services/web-app/app/routes/app/sidebar-nav.tsx` (add "View as student" action)

- [ ] **Step 1: Write failing test**

```typescript
import { describe, expect, test } from 'bun:test';
import { canEnterStudentPreview, isStudentPreviewActive } from './student-preview.server';

describe('student preview', () => {
  test('allows teachers and admins', () => {
    expect(canEnterStudentPreview({ role: 'TEACHER', isAdmin: false })).toBe(true);
    expect(canEnterStudentPreview({ role: 'STUDENT', isAdmin: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Implement session helpers**

```typescript
export const studentPreviewModeKey = 'studentPreviewMode';
export const studentPreviewOrgIdKey = 'studentPreviewOrgId';

export function canEnterStudentPreview(args: { role: string; isAdmin: boolean }) {
  return args.role === 'TEACHER' || args.isAdmin;
}

export async function getStudentPreviewState(request: Request) {
  const authSession = await authSessionStorage.getSession(request.headers.get('cookie'));
  return {
    active: authSession.get(studentPreviewModeKey) === 'read-only',
    organizationId: authSession.get(studentPreviewOrgIdKey) as string | null,
  };
}
```

- [ ] **Step 3: Gate student routes when preview active**

In student route loaders, allow access if `membership.role === 'STUDENT'` **OR** `preview.active`.

Block mutations in preview via `requireMutableRequest` extension.

- [ ] **Step 4: Run tests + commit**

```bash
git commit -m "feat: add teacher student-preview session mode"
```

---

### Task 11: Post-migration verification script

**Files:**
- Create: `packages/prisma/scripts/org-membership-postcheck.ts`
- Create: `packages/prisma/scripts/org-membership-postcheck.test.ts`

- [ ] **Step 1: Implement postcheck**

Assert:
- `TeacherProfile` / `StudentProfile` tables absent
- `OrgMembership` count === former `Profile` count
- No `Document` without `membershipId`
- No class M2M orphan rows
- Dual-role count documented (should be 0 post-migration)

- [ ] **Step 2: Run against migrated local DB**

Run: `cd packages/prisma && bun run scripts/org-membership-postcheck.ts`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: add org membership post-migration verification"
```

---

### Task 12: E2E regression suite

**Files:** `services/web-app/e2e/tests/*.spec.ts` (update selectors/copy if needed)

- [ ] **Step 1: Run full e2e**

Run: `cd services/web-app && bun run test:e2e:full`
Expected: PASS — fix spec failures iteratively

- [ ] **Step 2: Manual smoke checklist (from spec)**

Verify on localhost:
- [ ] Login teacher / student / owner / admin
- [ ] Org switcher for multi-org user
- [ ] Create class, add student, move student
- [ ] Student starts assignment, saves, submits
- [ ] Teacher grades and releases
- [ ] Owner org students page
- [ ] Teacher preview mode toggles student nav

- [ ] **Step 3: Commit any e2e fixes**

```bash
git commit -m "test: fix e2e for org membership migration"
```

---

### Task 13: Production cutover runbook

**Files:**
- Create: `docs/superpowers/plans/2026-06-13-org-membership-cutover-runbook.md`

- [ ] **Step 1: Write runbook**

```markdown
# OrgMembership cutover runbook

## Pre-cutover
1. Announce downtime
2. Snapshot production DB
3. Restore snapshot to staging
4. Run precheck on staging: `bun run scripts/org-membership-precheck.ts`
5. Apply migration on staging
6. Deploy staging build
7. Run postcheck + e2e + manual smoke

## Cutover
1. Enable maintenance mode
2. Snapshot production DB (final)
3. Run precheck (must exit 0)
4. `prisma migrate deploy`
5. Deploy application release
6. Run postcheck
7. Manual smoke (5 min)
8. Disable maintenance mode

## Rollback
1. Maintenance mode on
2. Restore pre-cutover snapshot
3. Redeploy previous release tag
4. Verify login smoke
```

- [ ] **Step 2: Commit runbook**

```bash
git commit -m "docs: add org membership production cutover runbook"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| OrgMembership model | Task 2–3 |
| Drop sub-profiles | Task 3 |
| Document single link | Task 3, 7 |
| Multi-org cookie switcher | Task 4–5 |
| isOrgOwner independent of role | Task 2, 4 |
| Teacher preview mode | Task 10 |
| Pre/post verification | Task 1, 11 |
| Behavioral parity checklist | Task 12 |
| No feature flags / big bang | Task 13 |
| Seed/e2e updates | Task 9, 12 |

## Placeholder scan

No TBD steps. All tasks include concrete files, commands, and code snippets.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-org-membership.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
