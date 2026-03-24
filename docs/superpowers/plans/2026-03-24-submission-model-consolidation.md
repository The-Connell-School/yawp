# Submission Model Consolidation — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Submission` and `SubmissionComment` models that consolidate `DocumentSnapshot` + `Grade`, dual-write all existing flows, backfill existing data, create a new auto-save endpoint, and enable assignment copy-to-multiple-classes.

**Architecture:** Expand-and-contract migration. New `Submission` table captures both snapshot data (at submit time) and grading data (filled in by teacher). All existing write paths (`submit-document`, `grade-essay`, `update-grade`, `release-grades`) dual-write to both old and new tables. A backfill script populates `Submission` from existing data. A new `update-submission` endpoint enables field-level auto-save for grading. Assignment creation gains a multi-class selector.

**Tech Stack:** Prisma ORM, PostgreSQL, Remix (React Router v7), Bun test runner, Playwright (e2e)

**Spec:** `docs/superpowers/specs/2026-03-24-submission-model-consolidation-design.md`

---

### Task 1: Add Submission and SubmissionComment to Prisma Schema

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260324000000_add_submission_model/migration.sql`

- [ ] **Step 1: Add the Submission model to the schema**

In `packages/prisma/schema.prisma`, add after the `DocumentSnapshot` model (after line 222):

```prisma
model Submission {
  id                String              @id @default(cuid())
  createdAt         DateTime            @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime            @default(now()) @db.Timestamptz(6)

  // Snapshot data (captured at submit time, immutable after creation)
  title             String
  text              String
  html              String
  submittedAt       DateTime            @db.Timestamptz(6)

  // Grading data (filled in by teacher, auto-saved on blur)
  score             String?
  feedback          String?
  rubricScores      Json?
  overallScore      Int?
  overallComment    String?
  numericPercentage Int?
  letterGrade       String?
  grammarIssues     Json?
  promptConfig      Json?
  aiMeta            Json?
  gradedAt          DateTime?           @db.Timestamptz(6)
  gradedById        String?
  gradedBy          Profile?            @relation("SubmissionsGraded", fields: [gradedById], references: [id], onDelete: SetNull)

  // Release
  releasedAt        DateTime?           @db.Timestamptz(6)

  // Relations
  documentId        String
  document          Document            @relation(fields: [documentId], references: [id], onDelete: Restrict)
  comments          SubmissionComment[]

  // Phase 1 migration helper (drop in Phase 3)
  legacySnapshotId  String?             @unique

  @@index([documentId, submittedAt(sort: Desc)])
  @@index([gradedById])
  @@index([releasedAt])
  @@index([legacySnapshotId])
}

model SubmissionComment {
  id           String     @id @default(cuid())
  createdAt    DateTime   @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime   @default(now()) @db.Timestamptz(6)
  content      String
  excerpt      String?
  occurrence   Int        @default(1)
  submissionId String
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  profileId    String
  profile      Profile    @relation("SubmissionComments", fields: [profileId], references: [id], onDelete: Cascade)

  @@index([submissionId, createdAt(sort: Desc)])
  @@index([profileId])
}
```

- [ ] **Step 2: Add relations to Document model**

In `packages/prisma/schema.prisma`, add to the `Document` model (around line 169, before the closing brace):

```prisma
  submissions               Submission[]
```

- [ ] **Step 3: Add relations to Profile model**

In `packages/prisma/schema.prisma`, add to the `Profile` model (around line 347, before the closing brace):

```prisma
  submissionsGraded         Submission[]        @relation("SubmissionsGraded")
  submissionComments        SubmissionComment[]  @relation("SubmissionComments")
```

- [ ] **Step 4: Generate the migration**

Run:
```bash
cd packages/prisma && npx prisma migrate dev --name add_submission_model --create-only
```

Review the generated SQL to confirm it creates `Submission` and `SubmissionComment` tables with the correct columns and indexes.

- [ ] **Step 5: Apply the migration and regenerate client**

Run:
```bash
cd packages/prisma && npx prisma migrate dev
```

Expected: Migration applied successfully, Prisma client regenerated.

- [ ] **Step 6: Verify schema compiles**

Run:
```bash
cd packages/prisma && npx prisma validate
```

Expected: "The schema is valid."

- [ ] **Step 7: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/
git commit -m "feat: add Submission and SubmissionComment models to schema"
```

---

### Task 2: Dual-Write in Submit-Document

When a student submits a document, create both a `DocumentSnapshot` (legacy) and a `Submission` (new).

**Files:**
- Modify: `services/web-app/app/routes/api.domain.submit-document/route.ts`
- Test: `services/web-app/app/routes/api.domain.submit-document/route.test.ts` (create if not exists)

- [ ] **Step 1: Write the failing test for Submission creation on submit**

The existing test file at `services/web-app/app/routes/api.domain.submit-document/route.test.ts` uses a `$transaction` mock that creates fresh `mock()` instances inside the callback. To test Submission creation, we need to capture the `tx` object.

Add to the **existing** test file. First, update the `$transaction` mock in `beforeEach` to include a `submission.create` mock on the `tx` object, and capture the tx so we can assert on it:

Add a module-level variable to capture tx calls:
```typescript
let lastTx: any = null;
```

Update the `$transaction` mock in `beforeEach` to capture tx:
```typescript
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        documentSnapshot: {
          create: mock().mockResolvedValue({ id: 'snapshot-1' }),
        },
        documentComment: {
          updateMany: mock().mockResolvedValue({ count: 2 }),
        },
        document: {
          update: mock().mockResolvedValue({
            id: 'doc-1',
            submittedAt: new Date('2026-03-17T12:00:00.000Z'),
            submittedSnapshotId: 'snapshot-1',
            revision: 4,
          }),
        },
        submission: {
          create: mock().mockResolvedValue({ id: 'submission-1' }),
        },
      };
      lastTx = tx;
      return callback(tx);
    });
```

Then add the new test case inside the existing `describe` block:

```typescript
  test('creates a Submission alongside the DocumentSnapshot on submit', async () => {
    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response = (await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any)) as { data: { success: boolean } };

    expect(response.data.success).toBe(true);
    expect(lastTx.submission.create).toHaveBeenCalledTimes(1);
    const createArg = lastTx.submission.create.mock.calls[0]?.[0];
    expect(createArg.data).toMatchObject({
      documentId: 'doc-1',
      title: 'Essay',
      text: 'Draft',
      html: '<p>Draft</p>',
      legacySnapshotId: 'snapshot-1',
    });
    expect(createArg.data.submittedAt).toBeInstanceOf(Date);
  });
```

Note: The test uses `title: 'Essay'`, `text: 'Draft'`, `html: '<p>Draft</p>'` to match the existing `beforeEach` mock data (not the values from the original plan).

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.submit-document/route.test.ts
```

Expected: FAIL — `prisma.submission.create` was not called.

- [ ] **Step 3: Add Submission creation to the submit-document transaction**

In `services/web-app/app/routes/api.domain.submit-document/route.ts`, inside the `prisma.$transaction` callback (after line 144 where the snapshot is created, before line 146 where comments are archived), add:

```typescript
      await tx.submission.create({
        data: {
          documentId: document.id,
          title: document.title,
          text,
          html,
          submittedAt: now,
          legacySnapshotId: snapshot.id,
        },
      });
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.submit-document/route.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.submit-document/
git commit -m "feat: dual-write Submission on document submit"
```

---

### Task 3: New update-submission Endpoint

Create the endpoint that accepts partial grading field updates for auto-save.

**Files:**
- Create: `services/web-app/app/routes/api.domain.update-submission/route.ts`
- Create: `services/web-app/app/routes/api.domain.update-submission/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `services/web-app/app/routes/api.domain.update-submission/route.test.ts`:

```typescript
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: {
    findFirst: mock(),
    update: mock(),
  },
};

const isDocumentSubmissionEnabledForSchool = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchool,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));

const { action } = await import('./route');

describe('api.domain.update-submission', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.submission.update.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));
  });

  test('updates grading fields on an existing submission', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedById: null,
      document: { class: { schoolId: 'school-1' } },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    form.append('overallComment', 'Great work!');
    form.append('numericPercentage', '85');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    const payload = (response as any).data;

    expect(payload.success).toBe(true);
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);

    const updateArg = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({ id: 'sub-1' });
    expect(updateArg.data.overallComment).toBe('Great work!');
    expect(updateArg.data.numericPercentage).toBe(85);
    expect(updateArg.data.letterGrade).toBe('B');
    expect(updateArg.data.gradedAt).toBeInstanceOf(Date);
    expect(updateArg.data.gradedById).toBe('teacher-1');
    expect(updateArg.data.updatedAt).toBeInstanceOf(Date);
  });

  test('does not overwrite gradedAt on subsequent saves', async () => {
    const existingGradedAt = new Date('2026-03-20');
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: existingGradedAt,
      gradedById: 'teacher-1',
      document: { class: { schoolId: 'school-1' } },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    form.append('overallComment', 'Updated comment');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    const updateArg = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateArg.data).not.toHaveProperty('gradedAt');
    expect(updateArg.data).not.toHaveProperty('gradedById');
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);

    const form = new FormData();
    form.append('submissionId', 'sub-1');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    expect((response as any).init?.status ?? (response as any).status).toBe(403);
  });

  test('returns 404 for non-existent submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const form = new FormData();
    form.append('submissionId', 'nonexistent');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    expect((response as any).init?.status ?? (response as any).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.update-submission/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the update-submission endpoint**

Create `services/web-app/app/routes/api.domain.update-submission/route.ts`:

```typescript
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import { isDocumentSubmissionEnabledForSchool } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

const POST = z.object({
  submissionId: z.string(),
  score: z.string().optional(),
  feedback: z.string().optional(),
  rubricScores: z.string().optional(),
  overallScore: z.string().optional(),
  overallComment: z.string().optional(),
  numericPercentage: z.string().optional(),
  letterGrade: z.string().optional(),
  aiMeta: z.string().optional(),
  grammarIssues: z.string().optional(),
  promptConfig: z.string().optional(),
});

function parseJson(value?: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can update submissions.' },
      { status: 403 }
    );
  }

  const submission = await prisma.submission.findFirst({
    where: {
      id: data.submissionId,
      ...(actor.isAdmin ? {} : {
        document: {
          class: {
            teachers: { some: { profileId: actor.profileId } },
          },
        },
      }),
    },
    select: {
      id: true,
      gradedAt: true,
      gradedById: true,
      document: {
        select: { class: { select: { schoolId: true } } },
      },
    },
  });

  if (!submission) {
    return dataResponse(
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  const isEnabled = await isDocumentSubmissionEnabledForSchool(
    submission.document.class?.schoolId
  );
  if (!isEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grading is currently disabled for this school.',
      type: 'error',
    });
  }

  const rubricScores = parseJson(data.rubricScores);
  const aiMeta = parseJson(data.aiMeta);
  const grammarIssues = parseJson(data.grammarIssues);
  const promptConfig = parseJson(data.promptConfig);
  const overallScore =
    data.overallScore && Number.isFinite(Number(data.overallScore))
      ? Number(data.overallScore)
      : undefined;
  const overallComment = data.overallComment;
  const numericPercentage =
    data.numericPercentage && Number.isFinite(Number(data.numericPercentage))
      ? Math.max(0, Math.min(100, Math.round(Number(data.numericPercentage))))
      : undefined;
  const letterGrade =
    numericPercentage !== undefined ? letterFromPercent(numericPercentage) : undefined;
  const score =
    data.score ??
    (numericPercentage !== undefined
      ? (formatGrade(numericPercentage, letterGrade ?? null) ?? undefined)
      : undefined);

  const now = new Date();

  // Set gradedAt/gradedById only on first grading touch
  const isFirstGrade = !submission.gradedAt;
  const gradingFields = isFirstGrade
    ? { gradedAt: now, gradedById: actor.profileId }
    : {};

  const updatedSubmission = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      ...gradingFields,
      ...(score !== undefined ? { score } : {}),
      ...(data.feedback !== undefined ? { feedback: data.feedback } : {}),
      ...(rubricScores !== undefined ? { rubricScores } : {}),
      ...(overallScore !== undefined ? { overallScore } : {}),
      ...(overallComment !== undefined ? { overallComment } : {}),
      ...(numericPercentage !== undefined ? { numericPercentage } : {}),
      ...(letterGrade !== undefined ? { letterGrade } : {}),
      ...(aiMeta !== undefined ? { aiMeta } : {}),
      ...(grammarIssues !== undefined ? { grammarIssues } : {}),
      ...(promptConfig !== undefined ? { promptConfig } : {}),
      updatedAt: now,
    },
  });

  return dataResponse({
    success: true,
    message: 'Submission updated.',
    submission: updatedSubmission,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.update-submission/route.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.update-submission/
git commit -m "feat: add update-submission endpoint for auto-save grading"
```

---

### Task 4: Dual-Write in Grade-Essay

When a teacher grades via the existing `grade-essay` endpoint, also write to the `Submission` table.

**Files:**
- Modify: `services/web-app/app/routes/api.domain.grade-essay/route.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay/route.test.ts`

- [ ] **Step 1: Write the failing test for dual-write**

Add to `services/web-app/app/routes/api.domain.grade-essay/route.test.ts`, after the existing mock setup:

Add `submission: { update: mock() }` to the prisma mock object (alongside the existing `documentSnapshot`, `document`, `grade` mocks).

Add in the `beforeEach`:
```typescript
prisma.submission.update.mockReset();
prisma.submission.update.mockResolvedValue({ id: 'submission-1' });
```

Then add a new test:

```typescript
  test('dual-writes grading data to the Submission table', async () => {
    prisma.documentSnapshot.findMany.mockResolvedValue([
      {
        id: 'snapshot-1',
        documentId: 'doc-1',
        title: 'Essay Title',
        text: 'Frozen essay text',
        html: '<p>Frozen essay text</p>',
        document: { class: { schoolId: 'school-1' } },
      },
    ]);
    prisma.grade.upsert.mockResolvedValue({ id: 'grade-1' });

    const form = new FormData();
    form.append('snapshotIds', 'snapshot-1');
    form.append('overallComment', 'Good work.');
    form.append('numericPercentage', '90');

    const request = new Request('https://example.com/api/domain/grade-essay', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({ legacySnapshotId: 'snapshot-1' });
    expect(updateArg.data).toMatchObject({
      overallComment: 'Good work.',
      numericPercentage: 90,
      gradedById: 'teacher-profile-1',
    });
    expect(updateArg.data.gradedAt).toBeInstanceOf(Date);
    expect(updateArg.data.updatedAt).toBeInstanceOf(Date);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.grade-essay/route.test.ts
```

Expected: New test FAIL — `prisma.submission.update` was not called.

- [ ] **Step 3: Add dual-write logic to grade-essay**

In `services/web-app/app/routes/api.domain.grade-essay/route.ts`, after the `Promise.all(gradePromises)` call (line 248), add:

```typescript
  // Dual-write to Submission table (Phase 1)
  const submissionPromises = snapshots.map((snapshot) => {
    return prisma.submission.update({
      where: { legacySnapshotId: snapshot.id },
      data: {
        score,
        feedback: data.feedback,
        rubricScores,
        overallScore,
        overallComment,
        numericPercentage,
        letterGrade,
        aiMeta,
        ...(grammarIssues !== null ? { grammarIssues } : {}),
        ...(releaseImmediately ? { releasedAt: now } : {}),
        gradedAt: now,
        gradedById: actor.profileId,
        updatedAt: now,
      },
    }).catch((err: any) => {
      console.warn('Dual-write to Submission failed (Phase 1):', err.message);
    });
  });

  await Promise.all(submissionPromises);
```

- [ ] **Step 4: Run all grade-essay tests**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.grade-essay/route.test.ts
```

Expected: All tests PASS (including the new dual-write test).

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.grade-essay/
git commit -m "feat: dual-write grading data to Submission in grade-essay"
```

---

### Task 5: Dual-Write in Update-Grade

When a teacher updates a grade via the existing `update-grade` endpoint, also write to `Submission`.

**Files:**
- Modify: `services/web-app/app/routes/api.domain.update-grade/route.ts`
- Create: `services/web-app/app/routes/api.domain.update-grade/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `services/web-app/app/routes/api.domain.update-grade/route.test.ts`:

```typescript
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  grade: {
    findFirst: mock(),
    update: mock(),
  },
  submission: {
    update: mock(),
  },
};

const isDocumentSubmissionEnabledForSchool = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchool,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { action } = await import('./route');

describe('api.domain.update-grade', () => {
  beforeEach(() => {
    prisma.grade.findFirst.mockReset();
    prisma.grade.update.mockReset();
    prisma.submission.update.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));
  });

  test('dual-writes update to Submission via legacySnapshotId', async () => {
    prisma.grade.findFirst.mockResolvedValue({
      id: 'grade-1',
      snapshotId: 'snapshot-1',
      releasedAt: null,
      document: { class: { schoolId: 'school-1' } },
    });
    prisma.grade.update.mockResolvedValue({ id: 'grade-1' });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    const form = new FormData();
    form.append('gradeId', 'grade-1');
    form.append('overallComment', 'Updated feedback');
    form.append('numericPercentage', '75');

    const request = new Request('https://example.com/api/domain/update-grade', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({ legacySnapshotId: 'snapshot-1' });
    expect(updateArg.data.overallComment).toBe('Updated feedback');
    expect(updateArg.data.numericPercentage).toBe(75);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.update-grade/route.test.ts
```

Expected: FAIL — `prisma.submission.update` was not called.

- [ ] **Step 3: Add dual-write to update-grade**

In `services/web-app/app/routes/api.domain.update-grade/route.ts`, after the `prisma.grade.update` call (line 102-116), add:

```typescript
  // Dual-write to Submission table (Phase 1)
  if (grade.snapshotId) {
    await prisma.submission.update({
      where: { legacySnapshotId: grade.snapshotId },
      data: {
        score,
        feedback: data.feedback,
        rubricScores,
        overallScore,
        overallComment,
        numericPercentage,
        letterGrade,
        aiMeta,
        ...(grammarIssues !== null ? { grammarIssues } : {}),
        updatedAt: new Date(),
      },
    }).catch((err: any) => {
      console.warn('Dual-write to Submission failed (Phase 1):', err.message);
    });
  }
```

Also update the `grade` query at line 44-62 to include `snapshotId` in the `select`:

```typescript
    select: {
      id: true,
      snapshotId: true,
      releasedAt: true,
      document: { ... },
    },
```

- [ ] **Step 2: Verify existing tests still pass**

Run:
```bash
cd services/web-app && bun test
```

Expected: All existing tests pass. The `.catch()` ensures the dual-write doesn't break if the Submission doesn't exist yet.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/routes/api.domain.update-grade/route.ts
git commit -m "feat: dual-write grading updates to Submission in update-grade"
```

---

### Task 6: Dual-Write in Release-Grades

When a teacher releases grades, also update `releasedAt` on the corresponding Submissions.

**Files:**
- Modify: `services/web-app/app/routes/api.domain.release-grades/route.ts`
- Create: `services/web-app/app/routes/api.domain.release-grades/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `services/web-app/app/routes/api.domain.release-grades/route.test.ts`:

```typescript
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  grade: {
    findMany: mock(),
    updateMany: mock(),
  },
  submission: {
    updateMany: mock(),
  },
};

const isDocumentSubmissionEnabledForSchools = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchools,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { action } = await import('./route');

describe('api.domain.release-grades', () => {
  beforeEach(() => {
    prisma.grade.findMany.mockReset();
    prisma.grade.updateMany.mockReset();
    prisma.submission.updateMany.mockReset();
    isDocumentSubmissionEnabledForSchools.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isDocumentSubmissionEnabledForSchools.mockResolvedValue(true);
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));
  });

  test('dual-writes releasedAt to Submission table', async () => {
    prisma.grade.findMany.mockResolvedValue([
      {
        id: 'grade-1',
        snapshotId: 'snapshot-1',
        document: { class: { schoolId: 'school-1' } },
      },
      {
        id: 'grade-2',
        snapshotId: 'snapshot-2',
        document: { class: { schoolId: 'school-1' } },
      },
    ]);
    prisma.grade.updateMany.mockResolvedValue({ count: 2 });
    prisma.submission.updateMany.mockResolvedValue({ count: 2 });

    const form = new FormData();
    form.append('gradeIds', 'grade-1');
    form.append('gradeIds', 'grade-2');

    const request = new Request('https://example.com/api/domain/release-grades', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
    const updateArg = prisma.submission.updateMany.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({
      legacySnapshotId: { in: ['snapshot-1', 'snapshot-2'] },
    });
    expect(updateArg.data.releasedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd services/web-app && bun test app/routes/api.domain.release-grades/route.test.ts
```

Expected: FAIL — `prisma.submission.updateMany` was not called.

- [ ] **Step 3: Add dual-write to release-grades**

In `services/web-app/app/routes/api.domain.release-grades/route.ts`, update the `grades` query (lines 32-51) to also select `snapshotId`:

```typescript
    select: {
      id: true,
      snapshotId: true,
      document: {
        select: {
          class: {
            select: { schoolId: true },
          },
        },
      },
    },
```

After the `prisma.grade.updateMany` call (lines 73-81), add:

```typescript
  // Dual-write to Submission table (Phase 1)
  const snapshotIds = grades
    .map((g: any) => g.snapshotId)
    .filter(Boolean);
  if (snapshotIds.length > 0) {
    await prisma.submission.updateMany({
      where: { legacySnapshotId: { in: snapshotIds } },
      data: {
        releasedAt: now,
        updatedAt: now,
      },
    }).catch((err: any) => {
      console.warn('Dual-write to Submission failed (Phase 1):', err.message);
    });
  }
```

- [ ] **Step 2: Verify tests pass**

Run:
```bash
cd services/web-app && bun test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/routes/api.domain.release-grades/route.ts
git commit -m "feat: dual-write releasedAt to Submission in release-grades"
```

---

### Task 7: Backfill Script

Create a script to populate `Submission` records from existing `DocumentSnapshot` + `Grade` pairs.

**Files:**
- Create: `packages/prisma/scripts/backfill-submissions.ts`

- [ ] **Step 1: Write the backfill script**

Create `packages/prisma/scripts/backfill-submissions.ts`:

```typescript
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting Submission backfill...');

  // Step 1: Backfill snapshots that have a linked grade
  const snapshotsWithGrades = await prisma.documentSnapshot.findMany({
    where: {
      submittedAt: { not: null },
    },
    select: {
      id: true,
      documentId: true,
      title: true,
      text: true,
      html: true,
      submittedAt: true,
      createdAt: true,
      grades: {
        select: {
          id: true,
          score: true,
          feedback: true,
          rubricScores: true,
          overallScore: true,
          overallComment: true,
          numericPercentage: true,
          letterGrade: true,
          grammarIssues: true,
          promptConfig: true,
          aiMeta: true,
          gradedById: true,
          releasedAt: true,
          createdAt: true,
          essayTitle: true,
          essayText: true,
          essayHtml: true,
        },
      },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const snapshot of snapshotsWithGrades) {
    // Check if already backfilled
    const existing = await prisma.submission.findUnique({
      where: { legacySnapshotId: snapshot.id },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const grade = snapshot.grades[0]; // Should be at most one per snapshot (unique constraint)
    const submittedAt = snapshot.submittedAt ?? snapshot.createdAt;

    // Field priority: prefer Grade.essay* fields when present, fall back to snapshot
    const title = (grade?.essayTitle ?? snapshot.title) || 'Untitled';
    const text = grade?.essayText ?? snapshot.text;
    const html = grade?.essayHtml ?? snapshot.html;

    await prisma.submission.create({
      data: {
        documentId: snapshot.documentId,
        title,
        text,
        html,
        submittedAt,
        legacySnapshotId: snapshot.id,
        // Grading fields (from Grade, if exists)
        ...(grade
          ? {
              score: grade.score,
              feedback: grade.feedback,
              rubricScores: grade.rubricScores ?? undefined,
              overallScore: grade.overallScore,
              overallComment: grade.overallComment,
              numericPercentage: grade.numericPercentage,
              letterGrade: grade.letterGrade,
              grammarIssues: grade.grammarIssues ?? undefined,
              promptConfig: grade.promptConfig ?? undefined,
              aiMeta: grade.aiMeta ?? undefined,
              gradedAt: grade.createdAt,
              gradedById: grade.gradedById,
              releasedAt: grade.releasedAt,
            }
          : {}),
      },
    });

    // Backfill SubmissionComments from GradeComments
    if (grade) {
      const gradeComments = await prisma.gradeComment.findMany({
        where: { gradeId: grade.id },
        select: {
          content: true,
          excerpt: true,
          occurrence: true,
          profileId: true,
          createdAt: true,
        },
      });

      const submission = await prisma.submission.findUnique({
        where: { legacySnapshotId: snapshot.id },
        select: { id: true },
      });

      if (submission && gradeComments.length > 0) {
        await prisma.submissionComment.createMany({
          data: gradeComments.map((c) => ({
            submissionId: submission.id,
            content: c.content,
            excerpt: c.excerpt,
            occurrence: c.occurrence,
            profileId: c.profileId,
            createdAt: c.createdAt,
          })),
        });
      }
    }

    created++;
  }

  console.log(`Backfill complete. Created: ${created}, Skipped: ${skipped}`);
}

backfill()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Test the backfill locally**

Run:
```bash
cd packages/prisma && npx tsx scripts/backfill-submissions.ts
```

Expected: "Backfill complete. Created: N, Skipped: 0" (where N = number of existing submitted snapshots).

- [ ] **Step 3: Verify idempotency by running again**

Run:
```bash
cd packages/prisma && npx tsx scripts/backfill-submissions.ts
```

Expected: "Backfill complete. Created: 0, Skipped: N"

- [ ] **Step 4: Commit**

```bash
git add packages/prisma/scripts/backfill-submissions.ts
git commit -m "feat: add backfill script for Submission records from existing data"
```

---

### Task 8: Assignment Copy-to-Multiple-Classes

Add a multi-class selector to the assignment creation form.

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx` (action function)
- Modify: `services/web-app/app/routes/app.my-classes.$classId/assignment-sheet.tsx`

- [ ] **Step 1: Update the action to accept multiple classIds**

In `services/web-app/app/routes/app.my-classes.$classId/route.tsx`, find the `create-assignment` intent handler in the `action` function. Currently it creates one assignment with the single `classId` from the route param.

Update it to accept an additional `additionalClassIds` field (comma-separated or array) and create one assignment per class in a transaction:

```typescript
// Inside the create-assignment intent handler, replace the single create with:
const additionalClassIds = formData.get('additionalClassIds');
const allClassIds = [classId];
if (typeof additionalClassIds === 'string' && additionalClassIds.trim()) {
  allClassIds.push(...additionalClassIds.split(',').map((id) => id.trim()).filter(Boolean));
}

// Deduplicate
const uniqueClassIds = [...new Set(allClassIds)];

// Authorization: verify teacher has access to ALL classes and the student course is allowed
if (uniqueClassIds.length > 1) {
  const validClasses = await prisma.class.findMany({
    where: {
      id: { in: uniqueClassIds },
      teachers: { some: { profileId: profile.id } },
      allowedStudentCourses: {
        some: { studentCourseId },
      },
    },
    select: { id: true },
  });
  const validIds = new Set(validClasses.map((c) => c.id));
  const invalidIds = uniqueClassIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0) {
    return dataResponse(
      { success: false, message: 'You do not have access to one or more selected classes.' },
      { status: 403 }
    );
  }
}

await prisma.$transaction(
  uniqueClassIds.map((cid) =>
    prisma.assignment.create({
      data: {
        classId: cid,
        studentCourseId,
        title: title || null,
        prompt,
        tutorContext: tutorContext || null,
        dueDate: parsedDueDate,
      },
    })
  )
);
```

- [ ] **Step 2: Update the loader to include teacher's other classes for the multi-select**

In the loader function of `app.my-classes.$classId/route.tsx`, add a query to fetch the teacher's other classes that share allowed student courses:

```typescript
const teacherClasses = await prisma.class.findMany({
  where: {
    teachers: { some: { profileId: profile.id } },
    isArchived: false,
    id: { not: classId },
  },
  select: {
    id: true,
    code: true,
    period: true,
    grade: true,
    title: true,
    allowedStudentCourses: {
      select: { studentCourseId: true },
    },
  },
});
```

Return `teacherClasses` in the loader response.

- [ ] **Step 3: Add multi-class selector to AssignmentSheet**

In `services/web-app/app/routes/app.my-classes.$classId/assignment-sheet.tsx`:

Add a new prop `teacherClasses` to `AssignmentSheetProps`:

```typescript
type AssignmentSheetProps = {
  classId: string;
  allowedStudentCourses: { id: string; title: string }[];
  teacherClasses: {
    id: string;
    code: string;
    period: string;
    grade: string;
    title: string | null;
    allowedStudentCourses: { studentCourseId: string }[];
  }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAssignment: AssignmentRecord | null;
};
```

Add state for selected additional classes:
```typescript
const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
```

Filter available classes based on selected student course:
```typescript
const availableClasses = useMemo(
  () =>
    teacherClasses.filter((c) =>
      c.allowedStudentCourses.some((ac) => ac.studentCourseId === studentCourseId)
    ),
  [teacherClasses, studentCourseId]
);
```

Reset selectedClassIds when the sheet opens (in the existing `useEffect` for `open`):
```typescript
setSelectedClassIds([]);
```

Add a checkbox list UI after the student course selector (only when creating, not editing):

```tsx
{!isEditing && availableClasses.length > 0 ? (
  <div className="space-y-2">
    <Label>Also assign to these classes</Label>
    <div className="space-y-1">
      {availableClasses.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selectedClassIds.includes(c.id)}
            onChange={(e) => {
              setSelectedClassIds((prev) =>
                e.target.checked
                  ? [...prev, c.id]
                  : prev.filter((id) => id !== c.id)
              );
            }}
          />
          {c.title || `${c.grade} - Period ${c.period}`} ({c.code})
        </label>
      ))}
    </div>
    <input
      type="hidden"
      name="additionalClassIds"
      value={selectedClassIds.join(',')}
    />
  </div>
) : null}
```

- [ ] **Step 4: Verify manually in the browser**

Start the dev server and verify:
1. Open a class with assignments enabled
2. Click "New Assignment"
3. Select a student course
4. Verify other classes with that course appear as checkboxes
5. Select a few, submit, verify assignments created in all classes

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.\$classId/
git commit -m "feat: add multi-class assignment creation"
```

---

### Task 9: Update Seed Script for Submissions

Update the seed script to create `Submission` records alongside existing snapshot creation.

**Files:**
- Modify: `packages/prisma/scripts/seed.ts`

- [ ] **Step 1: Add Submission creation to seed**

In `packages/prisma/scripts/seed.ts`, the snapshot is created inline via `snapshots: { create: [{ text, html }] }` inside `prisma.document.create` (around line 565). This means there's no `snapshot` variable to reference. Restructure the document creation to create the document first, then query its snapshot to get the ID, then create the Submission.

Replace the `prisma.document.create` call (around lines 558-590) with:

```typescript
          const doc = await prisma.document.create({
            data: {
              title: `${baseTitle} (${docIndex + 1})`,
              text,
              html,
              class: classId ? { connect: { id: classId } } : undefined,
              profile: { connect: { id: student.profileId } },
              snapshots: {
                create: [{ text, html }],
              },
              studentCourseModuleSessions: {
                create: [
                  {
                    title: `${topic} Session ${docIndex + 1}`,
                    instructionsCompleted: docIndex,
                    studentCourseModule: { connect: { id: module.id } },
                    studentProfile: { connect: { id: student.id } },
                    ...(firstInstruction && {
                      messages: {
                        create: [
                          {
                            content: firstInstruction.prompt,
                            agent: 'assistant',
                            instructionId: firstInstruction.id,
                          },
                        ],
                      },
                    }),
                  },
                ],
              },
            },
            include: { snapshots: { select: { id: true }, take: 1 } },
          });

          // Create Submission linked to the snapshot
          const snapshotId = doc.snapshots[0]?.id;
          if (snapshotId) {
            await prisma.submission.create({
              data: {
                documentId: doc.id,
                title: `${baseTitle} (${docIndex + 1})`,
                text,
                html,
                submittedAt: new Date(),
                legacySnapshotId: snapshotId,
              },
            });
          }

          return doc;
```

- [ ] **Step 2: Run the seed to verify**

Run:
```bash
cd packages/prisma && npx prisma db seed
```

Expected: Seed completes without errors.

- [ ] **Step 3: Commit**

```bash
git add packages/prisma/scripts/seed.ts
git commit -m "feat: seed Submission records alongside DocumentSnapshots"
```

---

## Summary

After completing all 9 tasks, Phase 1 is complete:

- **New tables:** `Submission` and `SubmissionComment` exist in the database
- **Dual-write:** All write paths (`submit-document`, `grade-essay`, `update-grade`, `release-grades`) write to both old and new tables
- **Backfill:** Existing data is migrated to the new tables
- **New endpoint:** `api.domain.update-submission` enables field-level auto-save for grading
- **Multi-class assignments:** Teachers can assign to multiple classes at once

Phase 2 (migrate reads) and Phase 3 (drop old tables) are separate follow-up plans.
