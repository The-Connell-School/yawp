# Teacher Documents Redesign From Granola Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Commit after every task that passes its verification command. Commit sooner before any risky route, migration, or data-shape change.

**Goal:** Ship the teacher dashboard, classes, assignments, and documents/grading redesign discussed in the June 9, 2026 Granola call.

**Architecture:** Put documents at the center of teacher workflows, while preserving class-scoped `Assignment` rows for student documents. Add teacher-owned reusable assignment templates and dual-write class assignment deployments so old document, submission, and grading paths continue to work. Gate the redesign behind a pilot feature flag and keep old `/app/my-classes` and assignment creation behavior available when the flag is off.

**Tech Stack:** React Router 7 file routes, React 18, TypeScript, Prisma/Postgres, Bun tests, Playwright e2e, Tailwind, existing Yawp UI primitives.

---

## Source Context

Granola meeting: `081f8025-4e16-416d-8f95-8a8f23ecf1b0`, "Teacher dashboard and documents UI - my classes, grading, and student work", June 9, 2026 2:03 PM CDT.

This plan supersedes the conflicting assignment-model parts of `docs/superpowers/specs/2026-06-09-document-centered-redesign.md`. That earlier spec said to enforce single-class assignment creation. The Granola call settled the opposite product direction: assignments should be teacher-owned reusable assets that can be pushed to one or more classes, with no due dates.

## Decisions From The Call

- Dashboard becomes an action surface: Classes, Assignments, and Grading are the first teacher paths.
- Teacher's Lounge stays in the left nav only and is removed from the dashboard.
- Classes move to the top of the dashboard and use persistent database-backed gradients.
- The class page has three tabs: Students, Assignments, Documents.
- The Students tab manages roster work: add student by email/password, move student to another class, remove student from this class without deleting data.
- Student "View details" no longer opens a side sheet. It routes to the class Documents tab filtered to that student.
- The Documents tab is the central view of class work. It filters by student, assignment, and status; groups by student or assignment; and supports collapsible prominent group headings.
- Document statuses are Draft, Submitted, Graded, Released. Draft is gray, Submitted is yellow, Graded is blue, Released is green.
- Graded and Released status pills include the grade inside the pill.
- A V1/V2/V3 label appears only when a document has multiple non-archived submissions.
- "Last updated" becomes "Edited".
- The contextual open action routes to grading for a document with submissions and to the document editor for a draft with no submission.
- The Assignments tab is only for creating, editing, deleting, duplicating, and assigning teacher assignments. It must not show per-student document status columns.
- Teacher assignments are class-agnostic reusable assets that stick to the teacher profile across years.
- Due dates are removed from the redesigned assignment flow.
- Deleting a class assignment must preserve student documents. Documents may lose their assignment link, but no writing or submission data is deleted.
- Seed at least one student with roughly 50 graded documents across assignment types to stress the layout.

## Deferred Work

- The prewriting carry-over feedback mentioned during the call is a separate student writing-flow issue.
- Bulk grading from the Documents view is not part of this first implementation unless an existing grading assistant API already supports the operation safely.
- The future "Yawp Reporter" feature should reuse the Documents query/grouping layer, but no report generation UI is included here.

## Execution Contract

- Use a fresh branch, for example `codex/teacher-documents-redesign`.
- Keep changes behind a new pilot feature key: `teacher_documents_redesign`.
- Tests come first for every behavior. For UI and flows, write Playwright e2e before implementation. For backend helpers and services, write Bun unit tests before implementation.
- Preserve current behavior when `teacher_documents_redesign` is disabled.
- Commit after each completed task. If a task touches more than one subsystem, split the work and commit each verified subsystem separately.
- Use commit messages that make rollback easy, for example:
  - `test: capture teacher documents redesign flows`
  - `feat: add teacher assignment templates`
  - `feat: add shared teacher documents view`
  - `feat: add class cards and dashboard action surface`
  - `test: cover redesign rollout fallback`
- Before every commit, run the exact task-level test command listed in that task.
- Before the final commit, run the full verification block near the end of this plan.

## File Structure

Create these files:

- `packages/prisma/migrations/20260609211500_teacher_documents_redesign/migration.sql` - Postgres migration for `Class.gradientKey`, `AssignmentTemplate`, and `Assignment.templateId`.
- `packages/prisma/scripts/backfill-assignment-templates.ts` - one-time backfill that creates teacher assignment templates from existing class-scoped assignments and links deployments.
- `packages/prisma/scripts/backfill-assignment-templates.test.ts` - unit coverage for backfill grouping and no-document-loss behavior.
- `services/web-app/app/domain/classes/class-gradients.ts` - stable gradient keys and Tailwind class mapping.
- `services/web-app/app/domain/classes/class-gradients.test.ts` - deterministic gradient tests.
- `services/web-app/app/domain/assignments/assignment-templates.server.ts` - server API for teacher assignment templates and class deployments.
- `services/web-app/app/domain/assignments/assignment-templates.server.test.ts` - unit coverage for create/edit/deploy/archive/delete-deployment behavior.
- `services/web-app/app/domain/students/class-students.server.ts` - reusable student enroll, move, and remove-class-membership helpers.
- `services/web-app/app/domain/students/class-students.server.test.ts` - unit coverage for teacher-scoped student roster actions.
- `services/web-app/app/domain/documents/document-status.ts` - document status, grade display, latest-submission, version-label, and action-target helpers.
- `services/web-app/app/domain/documents/document-status.test.ts` - unit coverage for status derivation and labels.
- `services/web-app/app/domain/documents/teacher-documents.server.ts` - Prisma query and filter normalization for the master Documents view and class Documents tab.
- `services/web-app/app/domain/documents/teacher-documents.server.test.ts` - unit coverage for query filters, ordering, and access boundaries.
- `services/web-app/app/components/classes/class-card.tsx` - reusable class card with gradient, counts, and action links.
- `services/web-app/app/components/documents/document-status-pill.tsx` - status pill including grade and version label.
- `services/web-app/app/components/documents/documents-view.tsx` - shared filter bar, grouping controls, card/table toggle, collapsible groups, and document table.
- `services/web-app/app/routes/api.preferences.documents-view/route.tsx` - cookie preference endpoint for card/table view and group mode.
- `services/web-app/app/routes/api.preferences.documents-view/cookie.server.ts` - cookie helpers for Documents view preferences.
- `services/web-app/app/routes/app.classes._index/route.tsx` - redesigned teacher Classes index at `/app/classes`.
- `services/web-app/app/routes/app.classes.$classId/route.tsx` - redesigned class detail at `/app/classes/:classId`.
- `services/web-app/app/routes/app.documents._index/route.tsx` - master teacher Documents/Grading route at `/app/documents`.
- `services/web-app/app/routes/app.assignments._index/route.tsx` - teacher assignment library route at `/app/assignments`.
- `services/web-app/e2e/tests/teacher.documents-redesign.spec.ts` - end-to-end coverage for the redesigned dashboard/classes/documents/assignments flows.

Modify these files:

- `packages/prisma/schema.prisma` - add `AssignmentTemplate`, `Class.gradientKey`, and `Assignment.templateId`.
- `services/web-app/app/utils/feature-flags.server.ts` - add `PILOT_FEATURE_KEYS.TEACHER_DOCUMENTS_REDESIGN` and helper.
- `services/web-app/e2e/db-helpers.ts` - add the new pilot feature key to e2e helpers.
- `services/web-app/e2e/seed-e2e.ts` - seed the redesign flag and heavy document stress data.
- `services/web-app/app/routes/app/route.tsx` - update teacher nav labels and links when the redesign flag is on.
- `services/web-app/app/routes/app._index/route.tsx` - redesign teacher dashboard behind the feature flag; leave old dashboard when flag is off.
- `services/web-app/app/routes/app.my-classes._index/route.tsx` - redirect to `/app/classes` when the flag is on; preserve old route when off.
- `services/web-app/app/routes/app.my-classes.$classId/route.tsx` - redirect to `/app/classes/:classId` when the flag is on; preserve old route when off.
- `services/web-app/app/routes/api.assignments.create/route.ts` - support the new template/deployment flow while preserving old bulk create when the redesign flag is off.
- `services/web-app/app/components/assignments/assignment-creation-sheet.tsx` - remove due date and switch class selection copy when the redesign flag is on.
- `services/web-app/app/components/document-link.tsx` - use the new status helpers without breaking student view.
- Existing tests in `services/web-app/e2e/tests/teacher.dashboard-assignment-types.spec.ts`, `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts`, and `services/web-app/e2e/tests/teacher.grading-flow.spec.ts` - update only expectations that are intentionally different under the redesign flag.

## Data Model

Use this Prisma shape:

```prisma
model Class {
  id          String           @id @default(cuid())
  createdAt   DateTime         @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime         @default(now()) @db.Timestamptz(6)
  code        String
  schoolYear  String           @default("2024-2025")
  period      String
  grade       String
  title       String?
  isArchived  Boolean          @default(false)
  gradientKey String           @default("aurora")
  students    StudentProfile[]
  teachers    TeacherProfile[]
  schoolId    String
  school      School           @relation(fields: [schoolId], references: [id])
  assignments Assignment[]

  @@unique([schoolId, code])
  @@index([schoolId, schoolYear, period, grade])
}

model AssignmentTemplate {
  id               String         @id @default(cuid())
  createdAt        DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime       @updatedAt @db.Timestamptz(6)
  archivedAt       DateTime?      @db.Timestamptz(6)
  teacherProfileId String
  teacherProfile   TeacherProfile @relation(fields: [teacherProfileId], references: [id], onDelete: Cascade)
  assignmentTypeId String
  assignmentType   AssignmentType @relation(fields: [assignmentTypeId], references: [id], onDelete: Restrict)
  title            String?
  prompt           String
  tutorContext     String?
  submitForGrade   Boolean        @default(true)
  pointValue       Int?           @default(100)
  apHistorySnapshot Json?
  deployments      Assignment[]

  @@index([teacherProfileId, archivedAt, updatedAt(sort: Desc)])
  @@index([assignmentTypeId])
}

model Assignment {
  id               String              @id @default(cuid())
  createdAt        DateTime            @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime            @default(now()) @db.Timestamptz(6)
  classId          String
  class            Class               @relation(fields: [classId], references: [id], onDelete: Cascade)
  templateId       String?
  template         AssignmentTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  assignmentTypeId String
  assignmentType   AssignmentType      @relation(fields: [assignmentTypeId], references: [id], onDelete: Cascade)
  title            String?
  prompt           String
  tutorContext     String?
  submitForGrade   Boolean             @default(true)
  pointValue       Int?                @default(100)
  dueDate          DateTime?           @db.Timestamptz(6)
  apHistorySnapshot Json?
  documents        Document[]

  @@unique([templateId, classId])
  @@index([classId, createdAt(sort: Desc)])
  @@index([assignmentTypeId])
  @@index([templateId])
  @@index([dueDate])
}

model TeacherProfile {
  id                            String               @id @default(cuid())
  createdAt                     DateTime             @default(now()) @db.Timestamptz(6)
  isActive                      Boolean              @default(true)
  profileId                     String               @unique
  profile                       Profile              @relation(fields: [profileId], references: [id], onDelete: Cascade)
  teacherTrainingModuleSessions TeacherTrainingModuleSession[]
  assignedTeacherTrainings      TeacherTraining[]    @relation("TeacherTrainingAssignments")
  classes                       Class[]
  schools                       School[]
  assignmentTemplates           AssignmentTemplate[]
}
```

Important behavior:

- `AssignmentTemplate` is the teacher-owned reusable assignment.
- `Assignment` remains the class-scoped deployment that documents point to.
- New redesigned assignment create/edit flows write `AssignmentTemplate` and one `Assignment` deployment per selected class.
- New redesigned assignment flows always write `Assignment.dueDate = null`.
- Existing code paths can still read and write `Assignment.dueDate`; the field is not removed.
- Deleting a class-scoped `Assignment` remains safe because `Document.assignmentId` already uses `onDelete: SetNull`.
- Archiving an `AssignmentTemplate` hides it from the teacher library and future assignment pickers but does not delete deployments or documents.

## Task 1: Baseline, Branch, And Granola Spec Snapshot

**Files:**
- Modify: `docs/superpowers/plans/2026-06-09-teacher-documents-redesign-from-granola.md`

- [ ] **Step 1: Create an isolated branch**

Run:

```bash
git switch -c codex/teacher-documents-redesign
```

Expected: branch switches successfully.

- [ ] **Step 2: Record baseline status**

Run:

```bash
git status --short
bun run web-app:typecheck
bun run --cwd services/web-app test app/utils/feature-flags.server.test.ts app/components/assignments/assignment-creation-sheet.test.tsx
```

Expected: typecheck and targeted tests pass before changes. If unrelated baseline failures appear, record them in the commit message body for the first commit and continue only if they do not block this work.

- [ ] **Step 3: Commit the plan**

Run:

```bash
git add docs/superpowers/plans/2026-06-09-teacher-documents-redesign-from-granola.md
git commit -m "docs: plan teacher documents redesign"
```

Expected: a documentation-only commit.

## Task 2: Write The Redesign E2E Tests First

**Files:**
- Create: `services/web-app/e2e/tests/teacher.documents-redesign.spec.ts`
- Modify: `services/web-app/e2e/db-helpers.ts`
- Modify: `services/web-app/e2e/seed-e2e.ts`

- [ ] **Step 1: Add the e2e feature key to helpers**

In `services/web-app/e2e/db-helpers.ts`, extend `PILOT_FEATURE_KEYS`:

```ts
const PILOT_FEATURE_KEYS = [
  'assignments',
  'assignment_creation_standardization',
  'document_submission_grading',
  'ap_history_essay',
  'teacher_documents_redesign',
] as const;
```

- [ ] **Step 2: Add failing e2e coverage**

Create `services/web-app/e2e/tests/teacher.documents-redesign.spec.ts` with these tests:

```ts
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setPilotFeatureAccessTarget } from '../db-helpers';

async function enableRedesignForTeacher(teacherProfileId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await setPilotFeatureAccessTarget({
      prisma,
      featureKey: 'teacher_documents_redesign',
      targetKind: 'teacher',
      targetId: teacherProfileId,
      enabled: true,
      note: 'E2E teacher documents redesign',
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function createSecondClassForTeacher(params: {
  schoolId: string;
  teacherProfileId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.class.create({
      data: {
        code: `E2E-RD-${Date.now().toString().slice(-6)}`,
        schoolYear: '2026-2027',
        period: '2nd',
        grade: '10th',
        title: 'Redesign Second Class',
        schoolId: params.schoolId,
        teachers: { connect: { id: params.teacherProfileId } },
      },
      select: { id: true, title: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Teacher documents redesign', () => {
  test.beforeEach(async ({ e2eContext }) => {
    await enableRedesignForTeacher(e2eContext.teacherProfileId);
  });

  test('dashboard shows action cards and no teacher lounge section', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');

    await expect(page.getByRole('link', { name: /classes/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /assignments/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /grading/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /teacher's lounge/i })).toHaveCount(0);
    await expect(page.getByRole('navigation').getByText(/lounge/i)).toBeVisible();
  });

  test('classes index uses cards with persistent gradient styling', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/classes');

    const classCard = page.getByRole('link', { name: /grade 9th.*period 1st/i });
    await expect(classCard).toBeVisible();
    await expect(classCard).toHaveAttribute('data-gradient-key', /.+/);
    const firstGradient = await classCard.getAttribute('data-gradient-key');

    await page.reload();
    await expect(classCard).toHaveAttribute('data-gradient-key', firstGradient!);
  });

  test('class detail has students assignments and documents tabs', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/classes/${e2eContext.classId}`);

    await expect(page.getByRole('tab', { name: /students/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /assignments/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /documents/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /submitted/i })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /released/i })).toHaveCount(0);
  });

  test('student view routes to documents tab filtered by that student', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/classes/${e2eContext.classId}`);

    await page.getByRole('button', { name: /view.*john doe/i }).click();
    await expect(page).toHaveURL(/\/app\/classes\/.*tab=documents.*studentId=/);
    await expect(page.getByRole('tab', { name: /documents/i })).toHaveAttribute('data-state', 'active');
    await expect(page.getByText(/john doe/i)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('documents tab filters groups and routes contextual open actions', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/classes/${e2eContext.classId}?tab=documents`);

    await expect(page.getByLabel(/status/i)).toBeVisible();
    await expect(page.getByLabel(/student/i)).toBeVisible();
    await expect(page.getByLabel(/assignment/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /group by assignment/i })).toBeVisible();

    await page.getByRole('button', { name: /group by assignment/i }).click();
    await expect(page.getByRole('button', { name: /collapse/i }).first()).toBeVisible();
    await expect(page.getByText(/edited/i)).toBeVisible();
    await expect(page.getByText(/graded.*77|77.*graded/i)).toBeVisible();

    await page.getByRole('link', { name: /open.*graded document/i }).click();
    await expect(page).toHaveURL(/\/app\/submissions\//);
  });

  test('assignments are reusable teacher assets and can deploy to multiple classes without due dates', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const secondClass = await createSecondClassForTeacher({
      schoolId: e2eContext.schoolId,
      teacherProfileId: e2eContext.teacherProfileId,
    });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/assignments');

    await page.getByRole('button', { name: /new assignment/i }).click();
    await expect(page.getByLabel(/due date/i)).toHaveCount(0);
    await page.getByLabel(/title/i).fill('Reusable Animal Farm Essay');
    await page.getByLabel(/prompt/i).fill('Explain how power changes the farm.');
    await page.getByLabel(/grade 9th.*period 1st/i).check();
    await page.getByLabel(secondClass.title!).check();
    await page.getByRole('button', { name: /create assignment/i }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Reusable Animal Farm Essay')).toBeVisible();

    const prisma = createE2EPrismaClient();
    try {
      const template = await prisma.assignmentTemplate.findFirstOrThrow({
        where: { title: 'Reusable Animal Farm Essay' },
        include: { deployments: true },
      });
      expect(template.deployments.map((deployment) => deployment.classId).sort()).toEqual(
        [e2eContext.classId, secondClass.id].sort()
      );
      expect(template.deployments.every((deployment) => deployment.dueDate === null)).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('deleting a class assignment preserves student documents', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/classes/${e2eContext.classId}?tab=assignments`);

    await page.getByRole('button', { name: /delete/i }).first().click();
    await page.getByRole('button', { name: /confirm delete/i }).click();
    await page.goto(`/app/classes/${e2eContext.classId}?tab=documents`);

    await expect(page.getByText(/graded document/i)).toBeVisible();
    await expect(page.getByText(/no assignment/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the new e2e test and verify it fails**

Run:

```bash
bun run web-app:test:e2e:prepare
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/teacher.documents-redesign.spec.ts
```

Expected: FAIL because routes, feature key, `AssignmentTemplate`, and redesigned UI do not exist yet.

- [ ] **Step 4: Commit failing tests**

Run:

```bash
git add services/web-app/e2e/tests/teacher.documents-redesign.spec.ts services/web-app/e2e/db-helpers.ts services/web-app/e2e/seed-e2e.ts
git commit -m "test: capture teacher documents redesign flows"
```

Expected: commit contains failing e2e coverage only. State in the commit body that the tests fail pending implementation.

## Task 3: Add Feature Flag Plumbing

**Files:**
- Modify: `services/web-app/app/utils/feature-flags.server.ts`
- Modify: `services/web-app/app/utils/feature-flags.server.test.ts`
- Modify: `services/web-app/app/routes/app.admin.feature-flags/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.feature-flags/route.test.ts`

- [ ] **Step 1: Write unit tests for the new flag helper**

Add tests to `services/web-app/app/utils/feature-flags.server.test.ts`:

```ts
test('teacher documents redesign can be enabled for a teacher target', async () => {
  prisma.featureAccessTarget.findFirst.mockResolvedValue({ id: 'flag-1' });

  const enabled = await isTeacherDocumentsRedesignEnabledForContext({
    organizationId: 'org-1',
    schoolId: 'school-1',
    teacherProfileId: 'teacher-1',
    classIds: ['class-1'],
  });

  expect(enabled).toBe(true);
  expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        featureKey: 'teacher_documents_redesign',
        enabled: true,
      }),
    })
  );
});

test('teacher documents redesign is disabled without a matching target', async () => {
  prisma.featureAccessTarget.findFirst.mockResolvedValue(null);

  await expect(
    isTeacherDocumentsRedesignEnabledForContext({
      organizationId: 'org-1',
      schoolId: 'school-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    })
  ).resolves.toBe(false);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/utils/feature-flags.server.test.ts app/routes/app.admin.feature-flags/route.test.ts
```

Expected: FAIL because `isTeacherDocumentsRedesignEnabledForContext` and admin flag metadata are not defined.

- [ ] **Step 3: Implement the feature key and helper**

In `services/web-app/app/utils/feature-flags.server.ts`:

```ts
export const PILOT_FEATURE_KEYS = {
  ASSIGNMENTS: 'assignments',
  ASSIGNMENT_CREATION_STANDARDIZATION: 'assignment_creation_standardization',
  DOCUMENT_SUBMISSION_GRADING: 'document_submission_grading',
  AP_HISTORY_ESSAY: 'ap_history_essay',
  TEACHER_DOCUMENTS_REDESIGN: 'teacher_documents_redesign',
} as const;

export async function isTeacherDocumentsRedesignEnabledForContext({
  organizationId,
  organizationIds,
  schoolId,
  schoolIds,
  teacherProfileId,
  teacherProfileIds,
  classIds,
}: {
  organizationId: string | null | undefined;
  organizationIds?: Array<string | null | undefined>;
  schoolId?: string | null;
  schoolIds?: Array<string | null | undefined>;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  const scopedOrganizationIds = distinctIds([
    organizationId,
    ...(organizationIds ?? []),
  ]);

  return isPilotFeatureEnabledForTargets(
    PILOT_FEATURE_KEYS.TEACHER_DOCUMENTS_REDESIGN,
    buildFeatureAccessTargets({
      organizationIds: scopedOrganizationIds,
      schoolIds: [schoolId, ...(schoolIds ?? [])],
      teacherProfileIds: [teacherProfileId, ...(teacherProfileIds ?? [])],
      classIds,
    })
  );
}
```

In `services/web-app/app/routes/app.admin.feature-flags/route.tsx`, add this pilot feature to the existing `PILOT_FEATURES` array:

```ts
{
  key: PILOT_FEATURE_KEYS.TEACHER_DOCUMENTS_REDESIGN,
  label: 'Teacher documents redesign',
  description:
    'Enables the redesigned teacher dashboard, classes, documents, and reusable assignments workflows.',
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/utils/feature-flags.server.test.ts app/routes/app.admin.feature-flags/route.test.ts
git add services/web-app/app/utils/feature-flags.server.ts services/web-app/app/utils/feature-flags.server.test.ts services/web-app/app/routes/app.admin.feature-flags/route.tsx services/web-app/app/routes/app.admin.feature-flags/route.test.ts services/web-app/e2e/db-helpers.ts
git commit -m "feat: add teacher documents redesign flag"
```

Expected: targeted tests pass and the flag is visible in admin flag metadata.

## Task 4: Add Schema, Migration, And Assignment Template Backfill

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260609211500_teacher_documents_redesign/migration.sql`
- Create: `packages/prisma/scripts/backfill-assignment-templates.ts`
- Create: `packages/prisma/scripts/backfill-assignment-templates.test.ts`

- [ ] **Step 1: Write migration and backfill tests**

Create `packages/prisma/scripts/backfill-assignment-templates.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { buildAssignmentTemplateBackfillPlan } from './backfill-assignment-templates';

describe('assignment template backfill', () => {
  test('creates one template per existing assignment and links the deployment', () => {
    const plan = buildAssignmentTemplateBackfillPlan([
      {
        id: 'assignment-1',
        classId: 'class-1',
        assignmentTypeId: 'type-1',
        title: 'Animal Farm Essay',
        prompt: 'Write about power.',
        tutorContext: 'Coach thesis clarity.',
        submitForGrade: true,
        pointValue: 100,
        apHistorySnapshot: null,
        class: { teachers: [{ id: 'teacher-1' }] },
      },
    ]);

    expect(plan).toEqual([
      {
        assignmentId: 'assignment-1',
        teacherProfileId: 'teacher-1',
        assignmentTypeId: 'type-1',
        title: 'Animal Farm Essay',
        prompt: 'Write about power.',
        tutorContext: 'Coach thesis clarity.',
        submitForGrade: true,
        pointValue: 100,
        apHistorySnapshot: null,
      },
    ]);
  });

  test('skips assignments without a teacher owner so no unsafe ownership is invented', () => {
    const plan = buildAssignmentTemplateBackfillPlan([
      {
        id: 'assignment-1',
        classId: 'class-1',
        assignmentTypeId: 'type-1',
        title: null,
        prompt: 'Prompt',
        tutorContext: null,
        submitForGrade: true,
        pointValue: 100,
        apHistorySnapshot: null,
        class: { teachers: [] },
      },
    ]);

    expect(plan).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd packages/prisma test scripts/backfill-assignment-templates.test.ts
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Update Prisma schema**

Apply the data model shown in the Data Model section to `packages/prisma/schema.prisma`.

- [ ] **Step 4: Add migration SQL**

Create `packages/prisma/migrations/20260609211500_teacher_documents_redesign/migration.sql`:

```sql
ALTER TABLE "Class" ADD COLUMN "gradientKey" TEXT NOT NULL DEFAULT 'aurora';

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (ORDER BY "createdAt", id) AS rn
  FROM "Class"
)
UPDATE "Class" AS c
SET "gradientKey" = CASE ((ranked.rn - 1) % 8)
  WHEN 0 THEN 'aurora'
  WHEN 1 THEN 'sage'
  WHEN 2 THEN 'cobalt'
  WHEN 3 THEN 'rose'
  WHEN 4 THEN 'amber'
  WHEN 5 THEN 'teal'
  WHEN 6 THEN 'violet'
  ELSE 'slate'
END
FROM ranked
WHERE c.id = ranked.id;

CREATE TABLE "AssignmentTemplate" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMPTZ(6),
  "teacherProfileId" TEXT NOT NULL,
  "assignmentTypeId" TEXT NOT NULL,
  "title" TEXT,
  "prompt" TEXT NOT NULL,
  "tutorContext" TEXT,
  "submitForGrade" BOOLEAN NOT NULL DEFAULT true,
  "pointValue" INTEGER DEFAULT 100,
  "apHistorySnapshot" JSONB,
  CONSTRAINT "AssignmentTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Assignment"
  ADD COLUMN "templateId" TEXT;

CREATE INDEX "AssignmentTemplate_teacherProfileId_archivedAt_updatedAt_idx"
  ON "AssignmentTemplate"("teacherProfileId", "archivedAt", "updatedAt" DESC);

CREATE INDEX "AssignmentTemplate_assignmentTypeId_idx"
  ON "AssignmentTemplate"("assignmentTypeId");

CREATE INDEX "Assignment_templateId_idx"
  ON "Assignment"("templateId");

CREATE UNIQUE INDEX "Assignment_templateId_classId_key"
  ON "Assignment"("templateId", "classId");

ALTER TABLE "AssignmentTemplate"
  ADD CONSTRAINT "AssignmentTemplate_teacherProfileId_fkey"
  FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentTemplate"
  ADD CONSTRAINT "AssignmentTemplate_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "AssignmentTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Add the backfill script**

Create `packages/prisma/scripts/backfill-assignment-templates.ts`:

```ts
import { createId } from '@paralleldrive/cuid2';
import { PrismaClient } from '../generated/prisma';

type ExistingAssignment = {
  id: string;
  classId: string;
  assignmentTypeId: string;
  title: string | null;
  prompt: string;
  tutorContext: string | null;
  submitForGrade: boolean;
  pointValue: number | null;
  apHistorySnapshot: unknown | null;
  class: { teachers: Array<{ id: string }> };
};

export function buildAssignmentTemplateBackfillPlan(
  assignments: ExistingAssignment[]
) {
  return assignments.flatMap((assignment) => {
    const teacherProfileId = assignment.class.teachers[0]?.id;
    if (!teacherProfileId) return [];

    return [
      {
        assignmentId: assignment.id,
        teacherProfileId,
        assignmentTypeId: assignment.assignmentTypeId,
        title: assignment.title,
        prompt: assignment.prompt,
        tutorContext: assignment.tutorContext,
        submitForGrade: assignment.submitForGrade,
        pointValue: assignment.pointValue,
        apHistorySnapshot: assignment.apHistorySnapshot,
      },
    ];
  });
}

export async function backfillAssignmentTemplates(prisma = new PrismaClient()) {
  const assignments = await prisma.assignment.findMany({
    where: { templateId: null },
    select: {
      id: true,
      classId: true,
      assignmentTypeId: true,
      title: true,
      prompt: true,
      tutorContext: true,
      submitForGrade: true,
      pointValue: true,
      apHistorySnapshot: true,
      class: {
        select: {
          teachers: { select: { id: true }, orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  const plan = buildAssignmentTemplateBackfillPlan(assignments);

  for (const item of plan) {
    await prisma.$transaction(async (tx) => {
      const template = await tx.assignmentTemplate.create({
        data: {
          id: createId(),
          teacherProfileId: item.teacherProfileId,
          assignmentTypeId: item.assignmentTypeId,
          title: item.title,
          prompt: item.prompt,
          tutorContext: item.tutorContext,
          submitForGrade: item.submitForGrade,
          pointValue: item.pointValue,
          apHistorySnapshot: item.apHistorySnapshot as never,
        },
        select: { id: true },
      });

      await tx.assignment.update({
        where: { id: item.assignmentId },
        data: { templateId: template.id },
      });
    });
  }

  return { linkedAssignments: plan.length, skippedAssignments: assignments.length - plan.length };
}

if (import.meta.main) {
  const prisma = new PrismaClient();
  backfillAssignmentTemplates(prisma)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
```

- [ ] **Step 6: Generate Prisma client and run tests**

Run:

```bash
bun prisma:generate
bun run --cwd packages/prisma test scripts/backfill-assignment-templates.test.ts
bun run web-app:typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit schema and backfill**

Run:

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/20260609211500_teacher_documents_redesign/migration.sql packages/prisma/scripts/backfill-assignment-templates.ts packages/prisma/scripts/backfill-assignment-templates.test.ts packages/prisma/generated
git commit -m "feat: add teacher assignment templates"
```

Expected: commit includes schema, migration, generated Prisma changes, and backfill tests.

## Task 5: Add Class Gradient Domain Helper

**Files:**
- Create: `services/web-app/app/domain/classes/class-gradients.ts`
- Create: `services/web-app/app/domain/classes/class-gradients.test.ts`
- Modify: `services/web-app/app/routes/app.organization.classes/route.tsx`

- [ ] **Step 1: Write failing tests**

Create `services/web-app/app/domain/classes/class-gradients.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  CLASS_GRADIENTS,
  classGradientForKey,
  deterministicGradientKey,
} from './class-gradients';

describe('class gradients', () => {
  test('returns stable keys for the same class id', () => {
    expect(deterministicGradientKey('class-1')).toBe(
      deterministicGradientKey('class-1')
    );
  });

  test('falls back to aurora for unknown keys', () => {
    expect(classGradientForKey('not-real')).toEqual(CLASS_GRADIENTS.aurora);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/domain/classes/class-gradients.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement gradient helper**

Create `services/web-app/app/domain/classes/class-gradients.ts`:

```ts
export const CLASS_GRADIENTS = {
  aurora: 'from-sky-100 via-white to-emerald-100 text-slate-950',
  sage: 'from-lime-100 via-white to-teal-100 text-slate-950',
  cobalt: 'from-blue-100 via-white to-cyan-100 text-slate-950',
  rose: 'from-rose-100 via-white to-orange-100 text-slate-950',
  amber: 'from-amber-100 via-white to-yellow-50 text-slate-950',
  teal: 'from-teal-100 via-white to-sky-100 text-slate-950',
  violet: 'from-violet-100 via-white to-fuchsia-100 text-slate-950',
  slate: 'from-slate-100 via-white to-zinc-100 text-slate-950',
} as const;

export type ClassGradientKey = keyof typeof CLASS_GRADIENTS;

const keys = Object.keys(CLASS_GRADIENTS) as ClassGradientKey[];

export function deterministicGradientKey(seed: string): ClassGradientKey {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return keys[hash % keys.length];
}

export function classGradientForKey(
  key: string | null | undefined
): string {
  if (key && key in CLASS_GRADIENTS) {
    return CLASS_GRADIENTS[key as ClassGradientKey];
  }
  return CLASS_GRADIENTS.aurora;
}
```

Modify class creation in `services/web-app/app/routes/app.organization.classes/route.tsx` to set a gradient when creating a class:

```ts
import { deterministicGradientKey } from '~/domain/classes/class-gradients';

// inside create-class data:
gradientKey: deterministicGradientKey(`${schoolId}:${schoolYear}:${grade}:${period}:${title ?? code}`),
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/domain/classes/class-gradients.test.ts app/routes/app.organization.classes/route.test.ts
bun run web-app:typecheck
git add services/web-app/app/domain/classes/class-gradients.ts services/web-app/app/domain/classes/class-gradients.test.ts services/web-app/app/routes/app.organization.classes/route.tsx services/web-app/app/routes/app.organization.classes/route.test.ts
git commit -m "feat: add persistent class gradients"
```

Expected: tests and typecheck pass.

## Task 6: Build Assignment Template Server API

**Files:**
- Create: `services/web-app/app/domain/assignments/assignment-templates.server.ts`
- Create: `services/web-app/app/domain/assignments/assignment-templates.server.test.ts`
- Modify: `services/web-app/app/routes/api.assignments.create/route.ts`
- Modify: `services/web-app/app/routes/api.assignments.create/route.test.ts`

- [ ] **Step 1: Write unit tests for template create/edit/deploy/delete**

Create `services/web-app/app/domain/assignments/assignment-templates.server.test.ts` with tests that mock Prisma and assert:

```ts
test('creates a teacher template and one deployment per selected owned class', async () => {
  await createAssignmentTemplateWithDeployments({
    teacherProfileId: 'teacher-1',
    classIds: ['class-1', 'class-2'],
    assignmentTypeId: 'type-1',
    title: 'Animal Farm Essay',
    prompt: 'Write about power.',
    tutorContext: null,
    submitForGrade: true,
    pointValue: 100,
    apHistorySnapshot: null,
  });

  expect(prisma.assignmentTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        teacherProfileId: 'teacher-1',
        dueDate: undefined,
      }),
    })
  );
  expect(prisma.assignment.upsert).toHaveBeenCalledTimes(2);
  expect(prisma.assignment.upsert.mock.calls[0][0].create).toMatchObject({
    classId: 'class-1',
    dueDate: null,
  });
});

test('deletes a class deployment without deleting documents directly', async () => {
  await deleteAssignmentDeploymentForClass({
    teacherProfileId: 'teacher-1',
    classId: 'class-1',
    assignmentId: 'assignment-1',
  });

  expect(prisma.assignment.delete).toHaveBeenCalledWith({
    where: { id: 'assignment-1' },
  });
  expect(prisma.document.deleteMany).not.toHaveBeenCalled();
  expect(prisma.submission.deleteMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/domain/assignments/assignment-templates.server.test.ts app/routes/api.assignments.create/route.test.ts
```

Expected: FAIL because the server API does not exist and the route still only bulk-creates class-scoped assignments.

- [ ] **Step 3: Implement server API**

Create `services/web-app/app/domain/assignments/assignment-templates.server.ts`:

```ts
import { prisma } from '~/utils/db.server';

export type AssignmentTemplateInput = {
  teacherProfileId: string;
  classIds: string[];
  assignmentTypeId: string;
  title: string | null;
  prompt: string;
  tutorContext: string | null;
  submitForGrade: boolean;
  pointValue: number | null;
  apHistorySnapshot: unknown | null;
};

function deploymentData(input: AssignmentTemplateInput, classId: string) {
  return {
    classId,
    assignmentTypeId: input.assignmentTypeId,
    title: input.title,
    prompt: input.prompt,
    tutorContext: input.tutorContext,
    submitForGrade: input.submitForGrade,
    pointValue: input.pointValue,
    dueDate: null,
    apHistorySnapshot: input.apHistorySnapshot as never,
  };
}

export async function createAssignmentTemplateWithDeployments(
  input: AssignmentTemplateInput
) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.assignmentTemplate.create({
      data: {
        teacherProfileId: input.teacherProfileId,
        assignmentTypeId: input.assignmentTypeId,
        title: input.title,
        prompt: input.prompt,
        tutorContext: input.tutorContext,
        submitForGrade: input.submitForGrade,
        pointValue: input.pointValue,
        apHistorySnapshot: input.apHistorySnapshot as never,
      },
      select: { id: true },
    });

    for (const classId of input.classIds) {
      await tx.assignment.upsert({
        where: {
          templateId_classId: {
            templateId: template.id,
            classId,
          },
        },
        create: {
          ...deploymentData(input, classId),
          templateId: template.id,
        },
        update: deploymentData(input, classId),
      });
    }

    return template;
  });
}

export async function archiveAssignmentTemplate(params: {
  teacherProfileId: string;
  templateId: string;
}) {
  const template = await prisma.assignmentTemplate.findFirst({
    where: {
      id: params.templateId,
      teacherProfileId: params.teacherProfileId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!template) return { success: false as const, message: 'Assignment not found.' };

  await prisma.assignmentTemplate.update({
    where: { id: template.id },
    data: { archivedAt: new Date() },
  });
  return { success: true as const };
}

export async function deleteAssignmentDeploymentForClass(params: {
  teacherProfileId: string;
  classId: string;
  assignmentId: string;
}) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: params.assignmentId,
      classId: params.classId,
      class: { teachers: { some: { id: params.teacherProfileId } } },
    },
    select: { id: true },
  });
  if (!assignment) return { success: false as const, message: 'Assignment not found.' };

  await prisma.assignment.delete({ where: { id: assignment.id } });
  return { success: true as const };
}
```

- [ ] **Step 4: Update `/api/assignments/create` for flag-aware behavior**

In `services/web-app/app/routes/api.assignments.create/route.ts`:

- Keep the current `classIds[]` + `createMany` path when `teacher_documents_redesign` is disabled.
- When enabled for the teacher context, call `createAssignmentTemplateWithDeployments`.
- Ignore `dueDate` in the redesign path and write null to deployments.
- Keep AP History library validation intact. AP History templates should copy `apHistorySnapshot` into template and deployments.
- Return `Assignments created successfully.` for compatibility.

- [ ] **Step 5: Update route unit tests**

In `services/web-app/app/routes/api.assignments.create/route.test.ts`, keep current tests for flag-off behavior and add flag-on tests:

```ts
test('creates a reusable assignment template when redesign is enabled', async () => {
  isTeacherDocumentsRedesignEnabledForContext.mockResolvedValue(true);

  const response = await action({
    request: requestFor({
      intent: 'create-assignment',
      assignmentTypeId: 'at-1',
      classIds: ['class-1', 'class-2'],
      prompt: 'Write the essay.',
      title: 'Essay',
      dueDate: '2026-05-20',
    }),
    params: {},
  } as any);

  const body = await readBody(response);
  expect(body.success).toBe(true);
  expect(createAssignmentTemplateWithDeployments).toHaveBeenCalledWith(
    expect.objectContaining({
      teacherProfileId: 'teacher-1',
      classIds: ['class-1', 'class-2'],
      title: 'Essay',
      prompt: 'Write the essay.',
    })
  );
  expect(prisma.assignment.createMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/domain/assignments/assignment-templates.server.test.ts app/routes/api.assignments.create/route.test.ts app/components/assignments/assignment-creation-sheet.test.tsx
bun run web-app:typecheck
git add services/web-app/app/domain/assignments/assignment-templates.server.ts services/web-app/app/domain/assignments/assignment-templates.server.test.ts services/web-app/app/routes/api.assignments.create/route.ts services/web-app/app/routes/api.assignments.create/route.test.ts
git commit -m "feat: add reusable assignment template service"
```

Expected: unit tests and typecheck pass.

## Task 7: Add Student Roster Server Helpers

**Files:**
- Create: `services/web-app/app/domain/students/class-students.server.ts`
- Create: `services/web-app/app/domain/students/class-students.server.test.ts`
- Modify: `services/web-app/app/routes/app.organization.students/route.tsx`

- [ ] **Step 1: Extract tests from existing organization student behavior**

Create `services/web-app/app/domain/students/class-students.server.test.ts` with tests for:

- Existing org student email-only enroll connects class and does not require a password.
- New student requires name, email, and password, then creates a user/profile/studentProfile connected to the class.
- Move student disconnects from source class and connects to target class.
- Remove student disconnects only this class and does not delete profile, documents, or submissions.
- Teacher access requires the target class to belong to the teacher.

Use assertions matching the existing organization students tests:

```ts
expect(prisma.studentProfile.update).toHaveBeenCalledWith({
  where: { id: 'student-profile-1' },
  data: { classes: { connect: { id: 'class-1' } } },
});

expect(prisma.studentProfile.update).toHaveBeenCalledWith({
  where: { id: 'student-profile-1' },
  data: {
    classes: {
      disconnect: { id: 'class-1' },
      connect: { id: 'class-2' },
    },
  },
});

expect(prisma.document.deleteMany).not.toHaveBeenCalled();
expect(prisma.submission.deleteMany).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/domain/students/class-students.server.test.ts app/routes/app.organization.students/route.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the shared helper**

Create `services/web-app/app/domain/students/class-students.server.ts` using the existing logic from `app.organization.students/route.tsx`:

```ts
import { getPasswordHash } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export const normalizeStudentEmail = (email: string) =>
  email.trim().toLowerCase();

export async function createOrEnrollStudentInClass(input: {
  organizationId: string;
  classId: string;
  name: string;
  email: string;
  password: string;
}) {
  const email = normalizeStudentEmail(input.email);
  const name = input.name.trim();
  const password = input.password.trim();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      profiles: {
        select: {
          id: true,
          organizationId: true,
          studentProfile: {
            select: {
              id: true,
              classes: { where: { id: input.classId }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (existingUser) {
    const orgProfile = existingUser.profiles.find(
      (profile) => profile.organizationId === input.organizationId
    );
    if (!orgProfile) {
      return { success: false as const, email, error: 'User belongs to another organization.' };
    }
    if (orgProfile.studentProfile) {
      if (orgProfile.studentProfile.classes.length === 0) {
        await prisma.studentProfile.update({
          where: { id: orgProfile.studentProfile.id },
          data: { classes: { connect: { id: input.classId } } },
        });
      }
      return { success: true as const, email };
    }
    await prisma.studentProfile.create({
      data: {
        profile: { connect: { id: orgProfile.id } },
        classes: { connect: { id: input.classId } },
      },
    });
    return { success: true as const, email };
  }

  if (!name || !password) {
    return {
      success: false as const,
      email,
      error: 'Name and password are required to create a new student account.',
    };
  }

  const hashedPassword = await getPasswordHash(password);
  await prisma.profile.create({
    data: {
      user: {
        create: {
          email,
          name,
          password: { create: { hash: hashedPassword } },
        },
      },
      organization: { connect: { id: input.organizationId } },
      studentProfile: { create: { classes: { connect: { id: input.classId } } } },
    },
  });

  return { success: true as const, email };
}

export async function moveStudentBetweenTeacherClasses(input: {
  teacherProfileId: string;
  studentProfileId: string;
  fromClassId: string;
  toClassId: string;
}) {
  const classes = await prisma.class.findMany({
    where: {
      id: { in: [input.fromClassId, input.toClassId] },
      teachers: { some: { id: input.teacherProfileId } },
      isArchived: false,
    },
    select: { id: true },
  });
  if (classes.length !== 2) {
    return { success: false as const, message: 'Class not found.' };
  }

  await prisma.studentProfile.update({
    where: { id: input.studentProfileId },
    data: {
      classes: {
        disconnect: { id: input.fromClassId },
        connect: { id: input.toClassId },
      },
    },
  });
  return { success: true as const };
}

export async function removeStudentFromTeacherClass(input: {
  teacherProfileId: string;
  studentProfileId: string;
  classId: string;
}) {
  const klass = await prisma.class.findFirst({
    where: {
      id: input.classId,
      teachers: { some: { id: input.teacherProfileId } },
    },
    select: { id: true },
  });
  if (!klass) return { success: false as const, message: 'Class not found.' };

  await prisma.studentProfile.update({
    where: { id: input.studentProfileId },
    data: { classes: { disconnect: { id: input.classId } } },
  });
  return { success: true as const };
}
```

- [ ] **Step 4: Refactor organization students route to reuse helper**

Replace the local `normalizeEmail` and `createOrEnrollStudent` duplication in `services/web-app/app/routes/app.organization.students/route.tsx` with imports from `~/domain/students/class-students.server`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/domain/students/class-students.server.test.ts app/routes/app.organization.students/route.test.ts
bun run web-app:typecheck
git add services/web-app/app/domain/students/class-students.server.ts services/web-app/app/domain/students/class-students.server.test.ts services/web-app/app/routes/app.organization.students/route.tsx services/web-app/app/routes/app.organization.students/route.test.ts
git commit -m "feat: add teacher class roster helpers"
```

Expected: helper and existing organization student tests pass.

## Task 8: Add Document Status And Teacher Documents Query

**Files:**
- Create: `services/web-app/app/domain/documents/document-status.ts`
- Create: `services/web-app/app/domain/documents/document-status.test.ts`
- Create: `services/web-app/app/domain/documents/teacher-documents.server.ts`
- Create: `services/web-app/app/domain/documents/teacher-documents.server.test.ts`
- Modify: `services/web-app/app/components/document-status-badge.tsx`
- Modify: `services/web-app/app/components/document-link.tsx`

- [ ] **Step 1: Write status helper tests**

Create `services/web-app/app/domain/documents/document-status.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  documentActionHref,
  documentStatusFromLatestSubmission,
  documentVersionLabel,
} from './document-status';

describe('document status', () => {
  test('returns Draft without a submission', () => {
    expect(documentStatusFromLatestSubmission(null)).toEqual({
      key: 'draft',
      label: 'Draft',
      tone: 'gray',
    });
  });

  test('returns Submitted for ungraded latest submission', () => {
    expect(
      documentStatusFromLatestSubmission({
        id: 'sub-1',
        submittedAt: new Date('2026-06-01'),
        gradedAt: null,
        releasedAt: null,
      })
    ).toMatchObject({ key: 'submitted', label: 'Submitted', tone: 'yellow' });
  });

  test('returns Graded before release and Released after release', () => {
    expect(
      documentStatusFromLatestSubmission({
        id: 'sub-1',
        submittedAt: new Date('2026-06-01'),
        gradedAt: new Date('2026-06-02'),
        releasedAt: null,
      })
    ).toMatchObject({ key: 'graded', label: 'Graded', tone: 'blue' });

    expect(
      documentStatusFromLatestSubmission({
        id: 'sub-1',
        submittedAt: new Date('2026-06-01'),
        gradedAt: new Date('2026-06-02'),
        releasedAt: new Date('2026-06-03'),
      })
    ).toMatchObject({ key: 'released', label: 'Released', tone: 'green' });
  });

  test('shows version label only when multiple submissions exist', () => {
    expect(documentVersionLabel(1)).toBeNull();
    expect(documentVersionLabel(3)).toBe('V3');
  });

  test('routes drafts to documents and submitted work to submissions', () => {
    expect(
      documentActionHref({
        documentId: 'doc-1',
        latestSubmissionId: null,
        exitTo: '/app/classes/class-1?tab=documents',
      })
    ).toContain('/app/documents/doc-1');
    expect(
      documentActionHref({
        documentId: 'doc-1',
        latestSubmissionId: 'sub-1',
        exitTo: '/app/classes/class-1?tab=documents',
      })
    ).toContain('/app/submissions/sub-1');
  });
});
```

- [ ] **Step 2: Write teacher documents query tests**

Create `services/web-app/app/domain/documents/teacher-documents.server.test.ts` to assert:

- Class filter narrows `assignment.classId`.
- Student filter narrows `studentProfileId`.
- Assignment filter narrows `assignmentId`.
- Status filter uses latest non-archived submission in memory.
- Draft documents include documents with zero non-archived submissions.
- Results sort by most recent relevant activity descending.
- Access is limited to classes taught by `teacherProfileId`.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/domain/documents/document-status.test.ts app/domain/documents/teacher-documents.server.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement `document-status.ts`**

Create `services/web-app/app/domain/documents/document-status.ts`:

```ts
import { formatAssignmentGrade } from '~/domain/grading/gradeMath';

export type DocumentStatusKey = 'draft' | 'submitted' | 'graded' | 'released';
export type DocumentStatusTone = 'gray' | 'yellow' | 'blue' | 'green';

export type LatestSubmissionForStatus = {
  id: string;
  submittedAt: Date | string;
  gradedAt: Date | string | null;
  releasedAt: Date | string | null;
  score?: string | null;
  numericPercentage?: number | null;
  letterGrade?: string | null;
  document?: {
    assignment?: {
      submitForGrade?: boolean | null;
      pointValue?: number | null;
    } | null;
  } | null;
};

export function documentStatusFromLatestSubmission(
  latestSubmission: LatestSubmissionForStatus | null
): { key: DocumentStatusKey; label: string; tone: DocumentStatusTone } {
  if (!latestSubmission) return { key: 'draft', label: 'Draft', tone: 'gray' };
  if (latestSubmission.releasedAt) {
    return { key: 'released', label: 'Released', tone: 'green' };
  }
  if (latestSubmission.gradedAt) {
    return { key: 'graded', label: 'Graded', tone: 'blue' };
  }
  return { key: 'submitted', label: 'Submitted', tone: 'yellow' };
}

export function documentVersionLabel(submissionCount: number) {
  return submissionCount > 1 ? `V${submissionCount}` : null;
}

export function gradeDisplayForSubmission(
  latestSubmission: LatestSubmissionForStatus | null
) {
  if (!latestSubmission) return null;
  const status = documentStatusFromLatestSubmission(latestSubmission);
  if (status.key !== 'graded' && status.key !== 'released') return null;

  return (
    formatAssignmentGrade({
      submitForGrade: latestSubmission.document?.assignment?.submitForGrade,
      numericPercentage: latestSubmission.numericPercentage ?? null,
      letterGrade: latestSubmission.letterGrade ?? null,
      pointValue: latestSubmission.document?.assignment?.pointValue ?? null,
      score: latestSubmission.score ?? null,
    }) || null
  );
}

export function documentActionHref(input: {
  documentId: string;
  latestSubmissionId: string | null;
  exitTo: string;
  canEditSubmission?: boolean;
}) {
  const encodedExitTo = encodeURIComponent(input.exitTo);
  if (input.latestSubmissionId) {
    const edit = input.canEditSubmission === false ? '' : 'edit=1&';
    return `/app/submissions/${input.latestSubmissionId}?${edit}exitTo=${encodedExitTo}`;
  }
  return `/app/documents/${input.documentId}?left=tutor&exitTo=${encodedExitTo}`;
}
```

- [ ] **Step 5: Implement `teacher-documents.server.ts`**

Implement a server function with this interface:

```ts
export type TeacherDocumentsFilters = {
  classId?: string;
  assignmentId?: string;
  studentProfileId?: string;
  status?: 'draft' | 'submitted' | 'graded' | 'released';
};

export async function loadTeacherDocuments(params: {
  teacherProfileId: string;
  organizationId: string;
  filters: TeacherDocumentsFilters;
}) {
  // Query documents whose class is taught by teacherProfileId.
  // Include assignment, class, student user, assignment type, and non-archived submissions.
  // Derive latest submission and status in memory.
  // Sort by latest status timestamp descending.
}
```

The document query must include documents with `assignmentId: null` when they belong to a student in the filtered class, matching existing `buildClassDocumentScope` behavior:

```ts
where: {
  deletedAt: null,
  archivedAt: null,
  studentProfile: {
    classes: {
      some: {
        teachers: { some: { id: teacherProfileId } },
        ...(filters.classId ? { id: filters.classId } : {}),
      },
    },
  },
  ...(filters.assignmentId ? { assignmentId: filters.assignmentId } : {}),
  ...(filters.studentProfileId ? { studentProfileId: filters.studentProfileId } : {}),
}
```

- [ ] **Step 6: Update existing badge/link components**

Update `services/web-app/app/components/document-status-badge.tsx` to delegate to `documentStatusFromLatestSubmission` while preserving the old exported `getDocumentStatusLabel` return type for callers that still expect `'Draft' | 'Submitted' | 'Graded'`.

Update `services/web-app/app/components/document-link.tsx` so teacher contexts can pass latest submission status and show the new status badge. Student view must still hide unreleased grade state from students.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/domain/documents/document-status.test.ts app/domain/documents/teacher-documents.server.test.ts app/components/document-status-badge.test.tsx
bun run web-app:typecheck
git add services/web-app/app/domain/documents services/web-app/app/components/document-status-badge.tsx services/web-app/app/components/document-link.tsx
git commit -m "feat: add teacher document status model"
```

Expected: document status/query tests and typecheck pass.

## Task 9: Build Shared Documents View Components

**Files:**
- Create: `services/web-app/app/components/documents/document-status-pill.tsx`
- Create: `services/web-app/app/components/documents/documents-view.tsx`
- Create: `services/web-app/app/routes/api.preferences.documents-view/route.tsx`
- Create: `services/web-app/app/routes/api.preferences.documents-view/cookie.server.ts`

- [ ] **Step 1: Write component tests**

Create component tests inside `services/web-app/app/components/documents/documents-view.test.tsx` if the existing Happy DOM setup can render the UI. Cover:

- Filter bar renders class, assignment, student, and status filters unless hidden.
- "Edited" appears instead of "Last updated".
- Group-by controls render "No grouping", "Student", and "Assignment".
- A group heading can collapse its documents.
- Graded and Released pills include grade text.

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/components/documents/documents-view.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement status pill**

Create `services/web-app/app/components/documents/document-status-pill.tsx`:

```tsx
import { Badge } from '~/components/ui/badge';
import type { DocumentStatusKey } from '~/domain/documents/document-status';
import { cn } from '~/utils/misc';

const toneClass: Record<DocumentStatusKey, string> = {
  draft: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  submitted: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  graded: 'border-blue-300 bg-blue-50 text-blue-800',
  released: 'border-green-300 bg-green-50 text-green-800',
};

export function DocumentStatusPill({
  status,
  label,
  gradeDisplay,
  versionLabel,
}: {
  status: DocumentStatusKey;
  label: string;
  gradeDisplay?: string | null;
  versionLabel?: string | null;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <Badge variant="outline" className={cn('rounded-full', toneClass[status])}>
        {label}
        {gradeDisplay ? <span className="ml-1 border-l pl-1">{gradeDisplay}</span> : null}
      </Badge>
      {versionLabel ? (
        <span className="text-xs text-muted-foreground">{versionLabel}</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement DocumentsView**

`services/web-app/app/components/documents/documents-view.tsx` should accept:

```ts
export type DocumentsViewProps = {
  documents: TeacherDocumentListItem[];
  filters: {
    classId: string;
    assignmentId: string;
    studentProfileId: string;
    status: string;
    groupBy: 'none' | 'student' | 'assignment';
    view: 'table' | 'cards';
  };
  options: {
    classes: Array<{ id: string; name: string }>;
    assignments: Array<{ id: string; title: string }>;
    students: Array<{ id: string; name: string; email: string }>;
  };
  hiddenFilters?: Array<'class' | 'assignment' | 'student' | 'status'>;
  exitTo: string;
};
```

Use query params for filters:

- `classId`
- `assignmentId`
- `studentId`
- `status`
- `groupBy`
- `view`

Render a single consistent action link labeled `Open` for every row. Use `documentActionHref`.

- [ ] **Step 5: Add Documents view preference cookie**

Create cookie helpers patterned after `services/web-app/app/routes/api.preferences.nav/cookie.server.ts`. Persist:

```ts
type DocumentsViewPreference = {
  view: 'table' | 'cards';
  groupBy: 'none' | 'student' | 'assignment';
};
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/components/documents/documents-view.test.tsx
bun run web-app:typecheck
git add services/web-app/app/components/documents services/web-app/app/routes/api.preferences.documents-view
git commit -m "feat: add shared documents view"
```

Expected: component tests and typecheck pass.

## Task 10: Add Master Documents Route

**Files:**
- Create: `services/web-app/app/routes/app.documents._index/route.tsx`
- Modify: `services/web-app/app/routes/app/route.tsx`

- [ ] **Step 1: Write route unit tests**

Create `services/web-app/app/routes/app.documents._index/route.test.ts` covering:

- Non-teachers redirect to `/app`.
- Teachers without the redesign flag redirect to `/app`.
- Teachers with the redesign flag load documents through `loadTeacherDocuments`.
- URL filters are passed to the query service.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/routes/app.documents._index/route.test.ts
```

Expected: FAIL because route does not exist.

- [ ] **Step 3: Implement route**

`services/web-app/app/routes/app.documents._index/route.tsx`:

```tsx
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { DocumentsView } from '~/components/documents/documents-view';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { isTeacherDocumentsRedesignEnabledForContext } from '~/utils/feature-flags.server';
import { loadTeacherDocuments } from '~/domain/documents/teacher-documents.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) return redirect('/app');

  const enabled = await isTeacherDocumentsRedesignEnabledForContext({
    organizationId: profile.organization.id,
    teacherProfileId: profile.teacherProfile.id,
  });
  if (!enabled) return redirect('/app');

  const url = new URL(request.url);
  const data = await loadTeacherDocuments({
    teacherProfileId: profile.teacherProfile.id,
    organizationId: profile.organization.id,
    filters: {
      classId: url.searchParams.get('classId') ?? undefined,
      assignmentId: url.searchParams.get('assignmentId') ?? undefined,
      studentProfileId: url.searchParams.get('studentId') ?? undefined,
      status: url.searchParams.get('status') as never,
    },
  });

  return {
    ...data,
    filters: {
      classId: url.searchParams.get('classId') ?? 'all',
      assignmentId: url.searchParams.get('assignmentId') ?? 'all',
      studentProfileId: url.searchParams.get('studentId') ?? 'all',
      status: url.searchParams.get('status') ?? 'all',
      groupBy: url.searchParams.get('groupBy') ?? 'none',
      view: url.searchParams.get('view') ?? 'table',
    },
  };
}

export default function TeacherDocumentsRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-xl p-3 sm:p-5">
          <h2>Grading</h2>
          <p className="mt-2 text-muted-foreground">
            Review drafts, grade submissions, and release feedback from one place.
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-screen-xl px-3 py-4 pb-24 sm:px-5">
        <DocumentsView
          documents={data.documents}
          filters={data.filters}
          options={data.options}
          exitTo="/app/documents"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add nav link when flag is on**

In `services/web-app/app/routes/app/route.tsx`, add a teacher-only nav item:

```tsx
{
  to: '/app/documents',
  label: 'Grading',
  icon: <ClipboardCheck size={20} />,
  requires: (user) => !!user.selectedProfile?.teacherProfile,
}
```

Only render this item when the app loader exposes `teacherDocumentsRedesignEnabled`. Add that boolean to the parent app route loader if not already available from root loader data.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/routes/app.documents._index/route.test.ts
bun run web-app:typecheck
git add services/web-app/app/routes/app.documents._index services/web-app/app/routes/app/route.tsx
git commit -m "feat: add teacher grading documents route"
```

Expected: route tests and typecheck pass.

## Task 11: Add Redesigned Classes Routes

**Files:**
- Create: `services/web-app/app/components/classes/class-card.tsx`
- Create: `services/web-app/app/routes/app.classes._index/route.tsx`
- Create: `services/web-app/app/routes/app.classes.$classId/route.tsx`
- Modify: `services/web-app/app/routes/app.my-classes._index/route.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.test.ts`

- [ ] **Step 1: Write route tests**

Add tests for:

- `/app/my-classes` redirects to `/app/classes` when flag is on.
- `/app/my-classes/:classId` redirects to `/app/classes/:classId` when flag is on.
- Old routes preserve old behavior when flag is off.
- `/app/classes/:classId?tab=documents&studentId=...` passes class and student filters to `DocumentsView`.
- `View Details` in the Students tab navigates to the Documents tab with `studentId`.
- `remove-student-from-class` disconnects only class membership.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/routes/app.my-classes.$classId/route.test.ts app/routes/app.classes.$classId/route.test.ts
```

Expected: FAIL because new routes do not exist and redirects are not implemented.

- [ ] **Step 3: Implement `ClassCard`**

Create `services/web-app/app/components/classes/class-card.tsx`:

```tsx
import { Link } from 'react-router';
import { Users, ClipboardCheck } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { classGradientForKey } from '~/domain/classes/class-gradients';
import { cn } from '~/utils/misc';

export function ClassCard({
  id,
  name,
  gradientKey,
  studentCount,
  assignmentCount,
  submittedCount,
  draftCount,
}: {
  id: string;
  name: string;
  gradientKey: string;
  studentCount: number;
  assignmentCount: number;
  submittedCount: number;
  draftCount: number;
}) {
  return (
    <Link
      to={`/app/classes/${id}`}
      data-gradient-key={gradientKey}
      className={cn(
        'group block rounded-lg border bg-gradient-to-br p-4 shadow-sm transition hover:border-primary/50',
        classGradientForKey(gradientKey)
      )}
    >
      <div className="flex min-h-28 flex-col justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {studentCount} students · {assignmentCount} assignments
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {submittedCount > 0 ? (
            <Badge className="gap-1 border-orange-200 bg-orange-50 text-orange-700">
              <ClipboardCheck className="h-3 w-3" />
              {submittedCount} submitted
            </Badge>
          ) : null}
          {draftCount > 0 ? (
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {draftCount} drafts
            </Badge>
          ) : null}
          {submittedCount === 0 && draftCount === 0 ? (
            <Badge className="border-green-200 bg-green-50 text-green-700">
              All released
            </Badge>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Implement `/app/classes`**

Use the existing `app.my-classes._index` loader query as the starting point, but render cards instead of rows and link to `/app/classes/:classId`.

- [ ] **Step 5: Implement `/app/classes/:classId`**

The route must:

- Show breadcrumb back to Classes.
- Render tabs: Students, Assignments, Documents.
- Students tab columns: Name, Email, Documents, Last Active, Action.
- Documents count cell includes submitted count in orange when any submitted work exists.
- View action navigates to `?tab=documents&studentId=<studentProfileId>`.
- Add Student sheet posts `intent=add-student`.
- Move student control posts `intent=move-student`.
- Remove student control posts `intent=remove-student`.
- Assignments tab delegates to the template/deployment service and does not render In Progress, Submitted, Graded, Released, or Copy/Paste columns.
- Documents tab renders `DocumentsView` with `hiddenFilters={['class']}` and the class filter locked.

- [ ] **Step 6: Update old route redirects**

In `app.my-classes._index/route.tsx` and `app.my-classes.$classId/route.tsx`, check `isTeacherDocumentsRedesignEnabledForContext`. If enabled, redirect:

```ts
return redirect('/app/classes');
```

and:

```ts
return redirect(`/app/classes/${params.classId}${new URL(request.url).search}`);
```

When disabled, leave current behavior intact.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/routes/app.my-classes.$classId/route.test.ts app/routes/app.classes.$classId/route.test.ts app/domain/students/class-students.server.test.ts
bun run web-app:typecheck
git add services/web-app/app/components/classes/class-card.tsx services/web-app/app/routes/app.classes._index services/web-app/app/routes/app.classes.$classId services/web-app/app/routes/app.my-classes._index/route.tsx services/web-app/app/routes/app.my-classes.$classId/route.tsx services/web-app/app/routes/app.my-classes.$classId/route.test.ts
git commit -m "feat: add redesigned teacher classes routes"
```

Expected: route tests and typecheck pass.

## Task 12: Add Teacher Assignment Library Route

**Files:**
- Create: `services/web-app/app/routes/app.assignments._index/route.tsx`
- Modify: `services/web-app/app/components/assignments/assignment-creation-sheet.tsx`
- Modify: `services/web-app/app/components/assignments/assignment-creation-sheet.test.tsx`

- [ ] **Step 1: Write tests for redesign assignment sheet**

In `assignment-creation-sheet.test.tsx`, add:

```ts
it('removes due date and keeps multi-class assignment deployment copy for redesign', () => {
  root = renderSheet({
    entryPoint: 'dashboard',
    teacherDocumentsRedesignEnabled: true,
  }).root;

  expectText('Assign to classes');
  expectNoText('Due Date (optional)');
  expect(allInputsByName('classIds')).toHaveLength(0);
});
```

Add route tests for `/app/assignments`:

- Teacher without flag redirects to `/app`.
- Teacher with flag sees reusable assignments.
- Create posts to `/api/assignments/create`.
- Archive template does not delete deployments.
- Delete class deployment uses assignment delete and preserves documents.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/components/assignments/assignment-creation-sheet.test.tsx app/routes/app.assignments._index/route.test.ts
```

Expected: FAIL because the prop and route do not exist.

- [ ] **Step 3: Update assignment sheet**

Add prop:

```ts
teacherDocumentsRedesignEnabled?: boolean;
```

When true:

- Header copy: "Create an assignment and assign it to classes."
- Class selector label: "Assign to classes".
- Hide due date input.
- Continue submitting selected class IDs as `classIds`.
- Preserve existing old behavior when false.

- [ ] **Step 4: Implement `/app/assignments`**

Route behavior:

- Loader checks teacher + flag.
- Load active `AssignmentTemplate` rows for the teacher with deployment classes.
- Render rows/cards with title, assignment type, number of deployed classes, and actions: Edit, Delete, Duplicate.
- "Duplicate" opens the same sheet prefilled with template fields and no selected classes.
- "Delete" archives the template, not deployments.
- Do not show student document status columns.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/components/assignments/assignment-creation-sheet.test.tsx app/routes/app.assignments._index/route.test.ts app/domain/assignments/assignment-templates.server.test.ts
bun run web-app:typecheck
git add services/web-app/app/routes/app.assignments._index services/web-app/app/components/assignments/assignment-creation-sheet.tsx services/web-app/app/components/assignments/assignment-creation-sheet.test.tsx
git commit -m "feat: add reusable teacher assignments route"
```

Expected: tests and typecheck pass.

## Task 13: Redesign Teacher Dashboard

**Files:**
- Modify: `services/web-app/app/routes/app._index/route.tsx`
- Create or Modify: `services/web-app/app/routes/app._index/components/teacher-action-cards.tsx`
- Modify: `services/web-app/app/routes/app._index/components/classes-at-a-glance.tsx`
- Modify: `services/web-app/e2e/tests/teacher.dashboard-assignment-types.spec.ts`

- [ ] **Step 1: Update dashboard tests first**

For redesign-flag-on behavior, add assertions:

- Classes action appears first.
- Assignments action links to `/app/assignments`.
- Grading action links to `/app/documents?status=submitted`.
- Teacher's Lounge dashboard section is absent.
- Sidebar/nav still has Lounge.

Keep old assertions for flag-off behavior.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/teacher.dashboard-assignment-types.spec.ts e2e/tests/teacher.documents-redesign.spec.ts
```

Expected: FAIL until dashboard renders redesigned flag-on state.

- [ ] **Step 3: Implement dashboard flag branch**

In `app._index/route.tsx`, expose `teacherDocumentsRedesignEnabled`.

When enabled and profile is teacher:

- Render `TeacherActionCards` at top:
  - Classes -> `/app/classes`
  - Assignments -> `/app/assignments`
  - Grading -> `/app/documents?status=submitted`
- Render class cards immediately under action cards.
- Render assignment templates or recent assignment library entries below classes.
- Do not render `TeacherTrainingsList`.
- Keep old dashboard branch unchanged when flag is off.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
bun run --cwd services/web-app test app/routes/app._index/components/assignment-types-list.test.ts
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/teacher.dashboard-assignment-types.spec.ts e2e/tests/teacher.documents-redesign.spec.ts
bun run web-app:typecheck
git add services/web-app/app/routes/app._index services/web-app/e2e/tests/teacher.dashboard-assignment-types.spec.ts
git commit -m "feat: redesign teacher dashboard action surface"
```

Expected: dashboard tests pass.

## Task 14: Seed Heavy Document Data

**Files:**
- Modify: `services/web-app/e2e/seed-e2e.ts`
- Modify: `services/web-app/e2e/tests/teacher.documents-redesign.spec.ts`

- [ ] **Step 1: Add seed assertions first**

In `teacher.documents-redesign.spec.ts`, add a test:

```ts
test('documents view handles a student with many graded documents', async ({
  page,
  e2eContext,
  signIn,
}) => {
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto(`/app/classes/${e2eContext.classId}?tab=documents&studentId=${e2eContext.heavyStudentProfileId}&groupBy=assignment`);

  await expect(page.getByText(/50 documents/i)).toBeVisible();
  await expect(page.getByText(/graded/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /collapse/i }).first()).toBeVisible();
});
```

Extend `E2EContext` with:

```ts
heavyStudentProfileId: string;
```

- [ ] **Step 2: Run e2e and verify failure**

Run:

```bash
bun run web-app:test:e2e:prepare
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/teacher.documents-redesign.spec.ts
```

Expected: FAIL because `heavyStudentProfileId` is not seeded.

- [ ] **Step 3: Seed heavy student**

In `seed-e2e.ts`, create one student named `Caleb Ward` connected to the main class. Create 50 documents across the existing E2E Course and Daily Pages assignment types, each with a graded released submission. Spread `submittedAt`, `gradedAt`, `releasedAt`, and `updatedAt` across the last 50 days so newest sorting can be observed.

Use existing assignment deployments where possible. If no deployment exists for Daily Pages, create one assignment with `assignmentTypeId: dailyPagesAssignmentType.id`.

- [ ] **Step 4: Run e2e and commit**

Run:

```bash
bun run web-app:test:e2e:prepare
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/teacher.documents-redesign.spec.ts
git add services/web-app/e2e/seed-e2e.ts services/web-app/e2e/tests/teacher.documents-redesign.spec.ts
git commit -m "test: seed heavy documents redesign fixture"
```

Expected: heavy document e2e passes.

## Task 15: Backward Compatibility And Rollout QA

**Files:**
- Modify: `services/web-app/e2e/tests/assignments-feature-flag.spec.ts`
- Modify: `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts`
- Modify: `services/web-app/e2e/tests/teacher.grading-flow.spec.ts`

- [ ] **Step 1: Add flag-off e2e assertions**

Add coverage proving:

- Without `teacher_documents_redesign`, `/app/my-classes` still works.
- Without the flag, dashboard still renders the old teacher assignment type dashboard.
- Without the flag, `/app/classes`, `/app/documents`, and `/app/assignments` redirect to `/app`.
- Existing student document and submission routes remain unchanged.

- [ ] **Step 2: Run compatibility e2e and verify failures**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/assignments-feature-flag.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts e2e/tests/teacher.grading-flow.spec.ts
```

Expected: fail only for expectations that still need compatibility implementation.

- [ ] **Step 3: Fix compatibility gaps**

Make the smallest route or loader changes required so flag-off users retain old behavior and flag-on users get redirects/new routes.

- [ ] **Step 4: Run compatibility tests and commit**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/assignments-feature-flag.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts e2e/tests/teacher.grading-flow.spec.ts
bun run web-app:typecheck
git add services/web-app/e2e/tests/assignments-feature-flag.spec.ts services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts services/web-app/e2e/tests/teacher.grading-flow.spec.ts services/web-app/app
git commit -m "test: preserve teacher redesign flag fallback"
```

Expected: flag-off compatibility tests pass.

## Task 16: Visual Browser QA

**Files:**
- No required source files unless QA finds a defect.

- [ ] **Step 1: Start the app**

Run:

```bash
bun run web-app:dev
```

Expected: dev server starts. If port 5173 is busy, use the port shown by Vite.

- [ ] **Step 2: Use Browser plugin or Playwright screenshots**

Capture desktop and mobile screenshots for:

- `/app`
- `/app/classes`
- `/app/classes/<classId>?tab=students`
- `/app/classes/<classId>?tab=assignments`
- `/app/classes/<classId>?tab=documents&groupBy=assignment`
- `/app/documents?status=submitted`
- `/app/assignments`

Check:

- Text does not overlap at 390px, 768px, and 1440px widths.
- Class card gradients are visible and restrained.
- Status pills do not wrap awkwardly.
- Documents table remains scannable with 50 documents.
- Group headings are prominent and collapsible.
- Teacher's Lounge is absent from dashboard but present in nav.
- Open actions return to the filtered Documents view through `exitTo`.

- [ ] **Step 3: Fix visual defects with focused commits**

For each visual defect:

```bash
git add <changed-files>
git commit -m "fix: polish teacher documents <specific issue>"
```

Expected: each visual fix has its own commit and corresponding screenshot retest.

## Task 17: Final Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run unit tests**

Run:

```bash
bun run --cwd services/web-app test app/domain/classes app/domain/assignments app/domain/students app/domain/documents app/routes/api.assignments.create app/components/assignments app/utils/feature-flags.server.test.ts
bun run --cwd packages/prisma test scripts/backfill-assignment-templates.test.ts
```

Expected: all targeted unit tests pass.

- [ ] **Step 2: Run typecheck and build**

Run:

```bash
bun run web-app:typecheck
bun run web-app:build
```

Expected: typecheck and build pass.

- [ ] **Step 3: Run e2e**

Run:

```bash
bun run web-app:test:e2e:prepare
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/teacher.documents-redesign.spec.ts e2e/tests/teacher.dashboard-assignment-types.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts e2e/tests/teacher.grading-flow.spec.ts e2e/tests/assignments-feature-flag.spec.ts e2e/tests/student.document-submission-flow.spec.ts e2e/tests/student.graded-feedback.spec.ts e2e/tests/student.unreleased-submission-no-highlights.spec.ts
```

Expected: all selected e2e tests pass.

- [ ] **Step 4: Review diff for risk**

Run:

```bash
git status --short
git diff --stat main...HEAD
git diff --check
```

Expected: no whitespace errors; changed files match this plan.

- [ ] **Step 5: Final commit if needed**

If verification fixes were required:

```bash
git add <changed-files>
git commit -m "fix: complete teacher documents redesign verification"
```

Expected: clean working tree except untracked local artifacts such as screenshots.

## Rollout Notes

- Do not enable `teacher_documents_redesign` globally in this work.
- Enable for Bryant/Kevin preview teacher profiles first using `FeatureAccessTarget`.
- Keep `assignments`, `assignment_creation_standardization`, and `document_submission_grading` flags active for the same teacher/class targets.
- Backfill assignment templates before enabling the redesign in a persistent preview or production database.
- Keep `/app/my-classes` redirects for at least two weeks after production enablement.
- Do not remove `Assignment.dueDate` until old assignment creation routes have been unused in production for at least two weeks.
- Do not delete released-grades routes in this PR. Let Documents view replace them in teacher workflows first, then remove after production verification.

## Completion Criteria

- Teacher dashboard provides Classes, Assignments, and Grading action paths.
- Teacher's Lounge is nav-only for teachers on the redesign flag.
- Classes render as cards with stable database-backed gradients.
- Class detail has Students, Assignments, Documents tabs.
- Student "View details" routes into filtered Documents view.
- Documents view filters by class, assignment, student, and status.
- Documents view groups by student or assignment with collapsible prominent headings.
- Status pills show Draft, Submitted, Graded, Released with correct colors.
- Graded and Released pills show the grade.
- Multi-submission documents show V labels only when count is greater than one.
- Assignments are teacher-owned reusable templates and can deploy to multiple classes.
- Redesigned assignment flows have no due date input and write null due dates to deployments.
- Deleting a class assignment preserves student documents and submissions.
- Flag-off behavior remains backward compatible.
- Tests, typecheck, build, and selected e2e pass.
