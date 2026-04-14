# Phase 2 — Submission Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `DocumentSnapshot` + `Grade` + `GradeComment` + `GradeCommentResponse` with a single consolidated `Submission` + `SubmissionComment` model. Big-bang migration in a maintenance window — no expand-and-contract phasing, no dual-writes, no transitional state. Enable multi-submit. Remove DocumentComment archival on submit.

**Architecture:** A `Submission` is the consolidated record of "what a student turned in for grade #N." It owns both the immutable submitted content (title/text/html/submittedAt) AND the grading fields (score/feedback/rubric/etc.). Auto-save grading via a single `update-submission` endpoint. The migration reuses `DocumentSnapshot.id` as `Submission.id` to keep the backfill trivial. Read paths across the codebase switch from `Grade`/`DocumentSnapshot` queries to `Submission` queries in mechanical edits.

**Tech Stack:** Prisma migrations, PostgreSQL, React Router v7, TypeScript, Vitest

**Branch:** `document-hardening` (off `main`)
**Spec:** `docs/superpowers/specs/2026-04-08-document-hardening-design.md`
**Depends on:** Phase 1 plan complete

---

## File Map

All paths relative to repo root unless noted. Phase 2 only.

| File | Action | Responsibility |
|---|---|---|
| `packages/prisma/schema.prisma` | Modify | Add Submission + SubmissionComment + LegacyGradeRedirect; remove DocumentSnapshot, Grade, GradeComment, GradeCommentResponse |
| `packages/prisma/migrations/<ts>_consolidate_submissions/migration.sql` | Create | The big-bang migration: create new tables, backfill, drop old |
| `packages/prisma/migrations/<ts>_consolidate_submissions/down.sql` | Create | Reverse migration for emergency rollback (NOT applied in deploy) |
| `packages/prisma/scripts/document-hardening-dry-run.ts` | Create | Dry-run script that prints expected row counts |
| `services/web-app/app/routes/api.domain.update-submission/route.ts` | Create | Single auto-save endpoint for any subset of submission fields |
| `services/web-app/app/routes/api.domain.update-submission/route.test.ts` | Create | Tests for the new endpoint |
| `services/web-app/app/routes/api.model.submission-comment/route.ts` | Create | Create/delete SubmissionComment |
| `services/web-app/app/routes/api.model.submission-comment/route.test.ts` | Create | Tests |
| `services/web-app/app/routes/api.domain.submit-document/route.ts` | Refactor | Create Submission instead of DocumentSnapshot, allow multi-submit, remove comment archival |
| `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts` | Refactor | Write to Submission directly |
| `services/web-app/app/routes/api.domain.release-grades/route.ts` | Refactor | Update Submission.releasedAt instead of Grade.releasedAt |
| `services/web-app/app/routes/api.domain.grade-essay/route.ts` | **DELETE** | Replaced by update-submission |
| `services/web-app/app/routes/api.domain.update-grade/route.ts` | **DELETE** | Replaced by update-submission |
| `services/web-app/app/routes/api.model.grade-comment/route.ts` | **DELETE** | Replaced by api.model.submission-comment |
| `services/web-app/app/routes/api.model.grade-comment.$id/route.ts` | **DELETE** | |
| `services/web-app/app/routes/api.model.grade-comment-response/route.ts` | **DELETE** | |
| `services/web-app/app/routes/app_.documents_.$id/route.tsx` | Modify | Loader: read latest Submission instead of submittedSnapshot |
| `services/web-app/app/routes/app.my-classes.$classId/route.tsx` | Modify | Dashboard tab queries onto Submission |
| `services/web-app/app/routes/app.my-classes.$classId/grading-sheet.tsx` | Modify | Use Submission |
| `services/web-app/app/routes/app.my-classes.$classId/release-grades-sheet.tsx` | Modify | Call new release endpoint with submission ids |
| `services/web-app/app/routes/app_.graded_.$gradeId/route.tsx` | Modify (minimal) | Read from Submission via legacy redirect lookup. Phase 3 will replace this entire file. |
| `services/web-app/app/components/grade-comment-card.tsx` | Modify | Use SubmissionComment shape |
| `services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx` | Modify (minimal) | Read from Submission. Phase 3 will rewrite this. |
| `services/web-app/app/routes/app_.documents_.$id/_components/grading-comments-sidebar.tsx` | Modify (minimal) | Read SubmissionComment. Phase 3 will rewrite this. |
| `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts` | Update | New return shape |
| Various E2E test files referencing grade/snapshot semantics | Update | Use submission semantics |

---

### Task 1: Add new Prisma models without dropping anything yet

Create the `Submission`, `SubmissionComment`, and `LegacyGradeRedirect` models in schema.prisma. **Do not** delete the old models in this task — we need them coexisting briefly during the backfill SQL, which runs in a single migration in Task 2.

**Files:**
- Modify: `packages/prisma/schema.prisma`

- [ ] **Step 1: Add the three new models to schema.prisma**

```prisma
model Submission {
  id                String              @id @default(cuid())
  createdAt         DateTime            @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime            @default(now()) @db.Timestamptz(6)

  // Snapshot data (immutable after creation)
  title             String
  text              String
  html              String
  submittedAt       DateTime            @db.Timestamptz(6)

  // Grading data (auto-saved on blur via update-submission)
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
  gradedBy          Profile?            @relation("SubmissionGradedBy", fields: [gradedById], references: [id], onDelete: SetNull)
  releasedAt        DateTime?           @db.Timestamptz(6)

  documentId        String
  document          Document            @relation(fields: [documentId], references: [id], onDelete: Restrict)
  comments          SubmissionComment[]

  @@index([documentId, submittedAt(sort: Desc)])
  @@index([gradedById])
  @@index([releasedAt])
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
  profile      Profile    @relation("SubmissionCommentProfile", fields: [profileId], references: [id], onDelete: Cascade)

  @@index([submissionId, createdAt(sort: Desc)])
  @@index([profileId])
}

model LegacyGradeRedirect {
  gradeId      String   @id
  submissionId String
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
}
```

- [ ] **Step 2: Add the relations on Document and Profile**

In `model Document`, add:
```prisma
submissions Submission[]
```

In `model Profile`, add:
```prisma
submissionsGraded   Submission[]        @relation("SubmissionGradedBy")
submissionComments  SubmissionComment[] @relation("SubmissionCommentProfile")
```

(The `@relation` names disambiguate from existing `gradesGiven` / `gradeComments` relations which still exist at this point.)

- [ ] **Step 3: Generate the migration without applying it**

```bash
cd packages/prisma
bunx prisma migrate dev --name add_submission_models --create-only
```
Expected: a new migration directory appears with `migration.sql` containing CREATE TABLE statements for the three new models.

- [ ] **Step 4: Inspect the generated SQL**

Use Read tool on `packages/prisma/migrations/<timestamp>_add_submission_models/migration.sql`. Verify it contains:
- `CREATE TABLE "Submission"`
- `CREATE TABLE "SubmissionComment"`
- `CREATE TABLE "LegacyGradeRedirect"`
- All the indexes
- The foreign key constraints

- [ ] **Step 5: DON'T apply yet**

The next task adds the backfill logic and drop statements. We apply the combined migration in Task 3.

- [ ] **Step 6: Commit the schema additions and the empty-ish migration**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/
git commit -m "feat: add Submission, SubmissionComment, LegacyGradeRedirect models"
```

---

### Task 2: Write the consolidated migration (create + backfill + drop)

Edit the migration from Task 1 to also backfill data and drop the old tables in the same transaction. This is the maintenance-window migration.

**Files:**
- Modify: `packages/prisma/migrations/<timestamp>_add_submission_models/migration.sql`
- Rename: the migration directory to `<timestamp>_consolidate_submissions` for clarity

- [ ] **Step 1: Rename the migration directory**

```bash
cd packages/prisma/migrations
# Find the directory created in Task 1
ls -1 | grep add_submission
# Rename it
mv <timestamp>_add_submission_models <timestamp>_consolidate_submissions
```

Update `migration_lock.toml` if needed (Prisma usually doesn't track names, just timestamps — should be fine).

- [ ] **Step 2: Append backfill SQL to the migration**

After the existing CREATE TABLE statements, append:

```sql
-- ============================================================
-- Backfill Submissions from DocumentSnapshot + Grade
-- Reuses DocumentSnapshot.id as Submission.id (cuid stays the same)
-- to keep SubmissionComment backfill trivial.
-- ============================================================
INSERT INTO "Submission" (
  id, "createdAt", "updatedAt",
  title, text, html, "submittedAt",
  score, feedback, "rubricScores",
  "overallScore", "overallComment",
  "numericPercentage", "letterGrade",
  "grammarIssues", "promptConfig", "aiMeta",
  "gradedAt", "gradedById", "releasedAt",
  "documentId"
)
SELECT
  s.id,
  s."createdAt",
  COALESCE(g."updatedAt", s."createdAt"),
  COALESCE(NULLIF(g."essayTitle", ''), d.title, 'Untitled'),
  COALESCE(g."essayText", s.text),
  COALESCE(g."essayHtml", s.html),
  COALESCE(s."submittedAt", s."createdAt"),
  g.score, g.feedback, g."rubricScores",
  g."overallScore", g."overallComment",
  g."numericPercentage", g."letterGrade",
  g."grammarIssues", g."promptConfig", g."aiMeta",
  g."gradedAt", g."gradedById", g."releasedAt",
  s."documentId"
FROM "DocumentSnapshot" s
LEFT JOIN "Grade" g ON g."snapshotId" = s.id
LEFT JOIN "Document" d ON d.id = s."documentId"
WHERE s."archivedAt" IS NULL;

-- ============================================================
-- Backfill SubmissionComments from GradeComments
-- ============================================================
INSERT INTO "SubmissionComment" (
  id, "createdAt", "updatedAt",
  content, excerpt, occurrence,
  "submissionId", "profileId"
)
SELECT
  gc.id, gc."createdAt", gc."updatedAt",
  gc.content, gc.excerpt, gc.occurrence,
  g."snapshotId",
  gc."profileId"
FROM "GradeComment" gc
JOIN "Grade" g ON g.id = gc."gradeId"
WHERE g."snapshotId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Submission" sub WHERE sub.id = g."snapshotId");

-- ============================================================
-- Build legacy redirect table for old /app/graded URLs
-- ============================================================
INSERT INTO "LegacyGradeRedirect" ("gradeId", "submissionId")
SELECT g.id, g."snapshotId"
FROM "Grade" g
WHERE g."snapshotId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Submission" sub WHERE sub.id = g."snapshotId");

-- ============================================================
-- Drop old tables and columns
-- ============================================================
ALTER TABLE "Document" DROP COLUMN IF EXISTS "submittedAt";
ALTER TABLE "Document" DROP COLUMN IF EXISTS "submittedSnapshotId";

DROP TABLE IF EXISTS "GradeCommentResponse";
DROP TABLE IF EXISTS "GradeComment";
DROP TABLE IF EXISTS "Grade";
DROP TABLE IF EXISTS "DocumentSnapshot";
```

- [ ] **Step 3: Verify the SQL is syntactically valid**

Read the file again. Sanity-check the column names against the actual schema:
- `DocumentSnapshot` columns: `id`, `createdAt`, `submittedAt`, `archivedAt`, `text`, `html`, `documentId`
- `Grade` columns: `id`, `createdAt`, `updatedAt`, `score`, `feedback`, `rubricScores`, `overallScore`, `overallComment`, `numericPercentage`, `letterGrade`, `grammarIssues`, `promptConfig`, `aiMeta`, `essayText`, `essayHtml`, `essayTitle`?, `releasedAt`, `documentId`, `snapshotId`, `gradedById`, `gradedAt`?

Note: I'm not sure if `Grade.essayTitle` and `Grade.gradedAt` exist in your schema. Verify before running:

```bash
cd packages/prisma
grep -A 30 "model Grade " schema.prisma
```

If `essayTitle` doesn't exist, replace `NULLIF(g."essayTitle", '')` with just `NULLIF(d.title, '')`. If `gradedAt` doesn't exist, replace `g."gradedAt"` with `g."updatedAt"` (the closest available timestamp).

- [ ] **Step 4: Commit the migration SQL (don't apply yet)**

```bash
git add packages/prisma/migrations/
git commit -m "feat: add backfill + drop SQL to consolidate-submissions migration"
```

---

### Task 3: Write the dry-run script

A read-only script that runs the SELECTs of the backfill as count queries and prints the expected row counts. Run this before the maintenance window in both staging and production.

**Files:**
- Create: `packages/prisma/scripts/document-hardening-dry-run.ts`

- [ ] **Step 1: Implement the script**

```ts
// packages/prisma/scripts/document-hardening-dry-run.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Document Hardening Migration Dry Run ===\n');

  const totalSnapshots = await prisma.documentSnapshot.count();
  const activeSnapshots = await prisma.documentSnapshot.count({
    where: { archivedAt: null },
  });
  const archivedSnapshots = totalSnapshots - activeSnapshots;

  const snapshotsWithGrade = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT s.id)::bigint AS count
    FROM "DocumentSnapshot" s
    INNER JOIN "Grade" g ON g."snapshotId" = s.id
    WHERE s."archivedAt" IS NULL
  `;

  const snapshotsWithoutGrade = activeSnapshots - Number(snapshotsWithGrade[0].count);

  const totalGrades = await prisma.grade.count();
  const gradesWithSnapshot = await prisma.grade.count({
    where: { snapshotId: { not: null } },
  });
  const orphanedGrades = totalGrades - gradesWithSnapshot;

  const totalGradeComments = await prisma.gradeComment.count();
  const expectedSubmissionComments = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM "GradeComment" gc
    JOIN "Grade" g ON g.id = gc."gradeId"
    WHERE g."snapshotId" IS NOT NULL
  `;

  const totalGradeCommentResponses = await prisma.gradeCommentResponse.count();

  console.log(`DocumentSnapshot rows: ${totalSnapshots}`);
  console.log(`  active: ${activeSnapshots}`);
  console.log(`  archived (DROPPED): ${archivedSnapshots}`);
  console.log('');
  console.log(`Active snapshots → Submissions: ${activeSnapshots}`);
  console.log(`  with grade attached: ${snapshotsWithGrade[0].count}`);
  console.log(`  without grade (ungraded submissions): ${snapshotsWithoutGrade}`);
  console.log('');
  console.log(`Grade rows: ${totalGrades}`);
  console.log(`  linked to snapshot: ${gradesWithSnapshot} → become Submission grading data`);
  console.log(`  orphaned (no snapshot — DROPPED): ${orphanedGrades}`);
  console.log('');
  console.log(`GradeComment rows: ${totalGradeComments}`);
  console.log(`  → SubmissionComments: ${expectedSubmissionComments[0].count}`);
  console.log('');
  console.log(`GradeCommentResponse rows: ${totalGradeCommentResponses} (DROPPED — no replacement)`);
  console.log('');
  console.log(`LegacyGradeRedirect rows to be created: ${gradesWithSnapshot}`);
  console.log('');
  console.log('=== END DRY RUN ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run the dry-run against your local dev database**

```bash
cd packages/prisma
bunx tsx scripts/document-hardening-dry-run.ts
```
Expected: prints counts. Verify they look reasonable for your local data.

- [ ] **Step 3: Commit the script**

```bash
git add packages/prisma/scripts/document-hardening-dry-run.ts
git commit -m "feat: dry-run script for document-hardening migration"
```

---

### Task 4: Apply the migration to local dev database

Run the migration locally to verify it works end-to-end before touching staging or prod.

- [ ] **Step 1: Take a local backup just in case**

```bash
# Adjust to your local connection details
pg_dump -d yawp_dev > /tmp/yawp-dev-pre-migration.sql
```

- [ ] **Step 2: Run the dry-run one more time and note the counts**

```bash
cd packages/prisma
bunx tsx scripts/document-hardening-dry-run.ts > /tmp/pre-migration-counts.txt
cat /tmp/pre-migration-counts.txt
```

- [ ] **Step 3: Apply the migration**

```bash
cd packages/prisma
bunx prisma migrate dev
```
Expected: migration applies cleanly. CREATE TABLEs run, backfill INSERTs run, DROP TABLEs run. No errors.

- [ ] **Step 4: Verify post-migration state**

```bash
# Connect to the local DB and run sanity checks
psql -d yawp_dev -c 'SELECT COUNT(*) FROM "Submission";'
psql -d yawp_dev -c 'SELECT COUNT(*) FROM "SubmissionComment";'
psql -d yawp_dev -c 'SELECT COUNT(*) FROM "LegacyGradeRedirect";'
psql -d yawp_dev -c 'SELECT * FROM "Submission" LIMIT 5;'
```
Expected counts should match what the dry-run predicted.

- [ ] **Step 5: Verify old tables are gone**

```bash
psql -d yawp_dev -c '\dt' | grep -E 'DocumentSnapshot|Grade|GradeComment|GradeCommentResponse'
```
Expected: empty output. Tables don't exist anymore.

- [ ] **Step 6: Regenerate Prisma client**

```bash
cd packages/prisma
bunx prisma generate
```
Expected: generated client has Submission, SubmissionComment, LegacyGradeRedirect; no Grade, DocumentSnapshot, GradeComment, GradeCommentResponse.

- [ ] **Step 7: Commit nothing here — this task is verification only**

The migration files were committed in Task 2. After regenerating the client, the next tasks will fix the now-broken TypeScript code.

---

### Task 5: Remove old models from schema.prisma

Now that the migration has run locally and successfully dropped the tables, remove the old model definitions from `schema.prisma` so the Prisma client matches the database.

**Files:**
- Modify: `packages/prisma/schema.prisma`

- [ ] **Step 1: Delete the model definitions**

Use Edit tool on `packages/prisma/schema.prisma` to delete:
- `model DocumentSnapshot { ... }`
- `model Grade { ... }`
- `model GradeComment { ... }`
- `model GradeCommentResponse { ... }`

- [ ] **Step 2: Delete the relations on Document**

In `model Document`, remove:
- `submittedAt DateTime?`
- `submittedSnapshotId String?`
- `submittedSnapshot DocumentSnapshot? @relation(...)`
- Any `submittedDocuments` relation
- Any `snapshots DocumentSnapshot[]` relation if present

- [ ] **Step 3: Delete the relations on Profile**

In `model Profile`, remove:
- `gradesGiven Grade[]`
- `gradeComments GradeComment[]`
- Any `gradeCommentResponses GradeCommentResponse[]`

(Keep the new `submissionsGraded` and `submissionComments` relations added in Task 1.)

- [ ] **Step 4: Run `prisma format`**

```bash
cd packages/prisma
bunx prisma format
```
Expected: schema reformats cleanly.

- [ ] **Step 5: Generate the client**

```bash
bunx prisma generate
```
Expected: client regenerates without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/prisma/schema.prisma
git commit -m "chore: remove old DocumentSnapshot/Grade/GradeComment models from schema"
```

---

### Task 6: Create the `update-submission` endpoint

The single auto-save endpoint for any subset of submission grading fields. Replaces grade-essay, update-grade, and (for the field-level use case) the create-grade flow.

**Files:**
- Create: `services/web-app/app/routes/api.domain.update-submission/route.ts`
- Create: `services/web-app/app/routes/api.domain.update-submission/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/web-app/app/routes/api.domain.update-submission/route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { action } from './route';
import { prisma } from '~/utils/db.server';
import { createTestSubmission, createTestTeacher } from '~/test-utils/factories';

describe('POST /api/domain/update-submission', () => {
  let submissionId: string;
  let teacherProfileId: string;

  beforeEach(async () => {
    const teacher = await createTestTeacher();
    teacherProfileId = teacher.profileId;
    const sub = await createTestSubmission({
      title: 'Test essay',
      text: 'hello',
      html: '<p>hello</p>',
    });
    submissionId = sub.id;
  });

  async function postUpdate(body: Record<string, string>, sessionTeacher = teacherProfileId) {
    const formData = new FormData();
    formData.append('submissionId', submissionId);
    Object.entries(body).forEach(([k, v]) => formData.append(k, v));

    return action({
      request: new Request('http://test/api/domain/update-submission', {
        method: 'POST',
        body: formData,
        headers: { Cookie: `__session=${sessionTeacher}` },
      }),
      params: {},
      context: {},
    } as any);
  }

  it('updates a single field (overallComment)', async () => {
    const res = await postUpdate({ overallComment: 'great work' });
    expect(res.ok).toBe(true);
    const updated = await prisma.submission.findUnique({ where: { id: submissionId } });
    expect(updated?.overallComment).toBe('great work');
  });

  it('updates multiple fields independently', async () => {
    await postUpdate({ overallComment: 'great', score: 'A' });
    const updated = await prisma.submission.findUnique({ where: { id: submissionId } });
    expect(updated?.overallComment).toBe('great');
    expect(updated?.score).toBe('A');
  });

  it('sets gradedAt and gradedById on first grading edit', async () => {
    const before = await prisma.submission.findUnique({ where: { id: submissionId } });
    expect(before?.gradedAt).toBeNull();

    await postUpdate({ overallComment: 'first edit' });

    const after = await prisma.submission.findUnique({ where: { id: submissionId } });
    expect(after?.gradedAt).not.toBeNull();
    expect(after?.gradedById).toBe(teacherProfileId);
  });

  it('does NOT change gradedAt on subsequent edits', async () => {
    await postUpdate({ overallComment: 'first' });
    const first = await prisma.submission.findUnique({ where: { id: submissionId } });
    const firstGradedAt = first?.gradedAt;

    // Wait so timestamps differ
    await new Promise((r) => setTimeout(r, 50));

    await postUpdate({ overallComment: 'second' });
    const second = await prisma.submission.findUnique({ where: { id: submissionId } });
    expect(second?.gradedAt?.getTime()).toBe(firstGradedAt?.getTime());
  });

  it('rejects requests from non-teachers', async () => {
    const res = await postUpdate({ overallComment: 'sneaky' }, 'student-profile-id');
    expect(res.status).toBe(403);
  });

  it('rejects requests with no submissionId', async () => {
    const formData = new FormData();
    formData.append('overallComment', 'oops');
    const res = await action({
      request: new Request('http://test/api/domain/update-submission', { method: 'POST', body: formData }),
      params: {},
      context: {},
    } as any);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('parses JSON fields (rubricScores, grammarIssues, aiMeta) correctly', async () => {
    const rubric = JSON.stringify({ thesis: { score: 4, comment: 'strong' } });
    await postUpdate({ rubricScores: rubric });
    const updated = await prisma.submission.findUnique({ where: { id: submissionId } });
    expect(updated?.rubricScores).toEqual({ thesis: { score: 4, comment: 'strong' } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd services/web-app
bun test app/routes/api.domain.update-submission/route.test.ts
```
Expected: FAIL (file doesn't exist)

- [ ] **Step 3: Implement the endpoint**

```ts
// services/web-app/app/routes/api.domain.update-submission/route.ts
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
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
  grammarIssues: z.string().optional(),
  aiMeta: z.string().optional(),
});

function parseJson(value?: string | null): any {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseInt(value?: string | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

const GRADING_FIELDS = [
  'score',
  'feedback',
  'rubricScores',
  'overallScore',
  'overallComment',
  'numericPercentage',
  'letterGrade',
  'grammarIssues',
  'aiMeta',
] as const;

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can grade.' },
      { status: 403 }
    );
  }

  const submission = await prisma.submission.findUnique({
    where: { id: data.submissionId },
    select: { id: true, gradedAt: true, document: { select: { class: { select: { schoolId: true } } } } },
  });
  if (!submission) {
    return dataResponse({ success: false, message: 'Submission not found.' }, { status: 404 });
  }

  // Build update payload from non-empty fields only
  const update: Record<string, any> = {};
  if (data.score !== undefined) update.score = data.score;
  if (data.feedback !== undefined) update.feedback = data.feedback;
  if (data.rubricScores !== undefined) update.rubricScores = parseJson(data.rubricScores);
  if (data.overallScore !== undefined) update.overallScore = parseInt(data.overallScore);
  if (data.overallComment !== undefined) update.overallComment = data.overallComment;
  if (data.numericPercentage !== undefined) update.numericPercentage = parseInt(data.numericPercentage);
  if (data.letterGrade !== undefined) update.letterGrade = data.letterGrade;
  if (data.grammarIssues !== undefined) update.grammarIssues = parseJson(data.grammarIssues);
  if (data.aiMeta !== undefined) update.aiMeta = parseJson(data.aiMeta);

  // Always bump updatedAt
  update.updatedAt = new Date();

  // Set gradedAt + gradedById on first grading edit only
  const isFirstGradingEdit =
    !submission.gradedAt &&
    GRADING_FIELDS.some((f) => update[f] !== undefined);
  if (isFirstGradingEdit) {
    update.gradedAt = new Date();
    update.gradedById = actor.profileId;
  }

  const updated = await prisma.submission.update({
    where: { id: data.submissionId },
    data: update,
  });

  return dataResponse({ success: true, submission: updated });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test app/routes/api.domain.update-submission/route.test.ts
```
Expected: PASS for all test cases. Iterate on the implementation if any fail.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.update-submission/
git commit -m "feat: add /api/domain/update-submission auto-save endpoint"
```

---

### Task 7: Refactor `submit-document` endpoint

Replace `DocumentSnapshot` creation with `Submission` creation. Allow multi-submit. Remove the `DocumentComment` archival step. Return the new submission in the response.

**Files:**
- Modify: `services/web-app/app/routes/api.domain.submit-document/route.ts`

- [ ] **Step 1: Read the current implementation**

```bash
```
Use Read tool on `services/web-app/app/routes/api.domain.submit-document/route.ts` to confirm the current shape (already read in spec phase — see lines 1-178).

- [ ] **Step 2: Rewrite the action body**

Replace the existing action function with:

```ts
const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const document = await prisma.document.findFirst({
    where: {
      id: data.documentId,
      deletedAt: null,
      ...(user?.isAdmin
        ? {}
        : {
            OR: [
              { profile: { id: profile.id } },
              {
                profile: {
                  studentProfile: {
                    classes: {
                      some: {
                        teachers: { some: { profileId: profile.id } },
                      },
                    },
                  },
                },
              },
            ],
          }),
    },
    select: {
      id: true,
      html: true,
      text: true,
      title: true,
      revision: true,
      class: {
        select: {
          schoolId: true,
        },
      },
    },
  });

  if (!document) {
    return redirectWithToast('/app/courses', {
      description: 'Document not found.',
      type: 'error',
    });
  }

  if (!document.html || !document.text) {
    return redirectWithToast(`/app/documents/${data.documentId}`, {
      description: 'Cannot submit an empty document.',
      type: 'error',
    });
  }

  const isSubmissionEnabled = await isDocumentSubmissionEnabledForSchool(
    document.class?.schoolId
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/courses', {
      description: 'Document submission is currently disabled for this school.',
      type: 'error',
    });
  }

  const html = document.html;
  const text = document.text;
  const title = document.title ?? 'Untitled';
  const now = new Date();

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.submit',
      source: 'submit-document',
      status: 'pending',
      userId,
      profileId: profile.id,
      documentId: document.id,
      title,
      html,
      text,
      htmlHash: hashString(html),
      textHash: hashString(text),
      baseRevision: document.revision,
      metadata: {
        method: request.method,
        submittedAt: now.toISOString(),
      },
    },
  });

  try {
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        title,
        text,
        html,
        submittedAt: now,
      },
    });

    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'accepted',
        resultingRevision: document.revision,
      },
    });

    return dataResponse({
      success: true,
      submission,
      message: 'Essay submitted successfully!',
    });
  } catch (error) {
    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'rejected',
        failureReason:
          error instanceof Error ? error.message : 'submit_transaction_failed',
      },
    });
    throw error;
  }
};
```

Key differences from the old version:
- No more `documentSnapshot.create`
- No more `documentComment.updateMany({ archivedAt: now })` — students keep their working comments across submissions
- No more `document.update({ submittedAt, submittedSnapshotId })` — those columns are gone
- No more "Resubmitting is temporarily disabled" check — multi-submit is allowed
- Returns the new `submission` (not `document`) in the response

- [ ] **Step 3: Update the existing test for this endpoint**

The test file `services/web-app/app/routes/api.domain.submit-document/route.test.ts` (cherry-picked from #91 work) likely asserts on `documentSnapshot.create`. Update it to assert on `submission.create` and to verify multi-submit behavior:

```ts
it('creates a Submission record on submit', async () => {
  // ... setup ...
  const res = await action({ ... });
  expect(res.ok).toBe(true);
  const subs = await prisma.submission.findMany({ where: { documentId: doc.id } });
  expect(subs).toHaveLength(1);
});

it('allows multi-submit (creates a second Submission)', async () => {
  // ... setup with one existing submission ...
  await action({ ... });
  await action({ ... });
  const subs = await prisma.submission.findMany({ where: { documentId: doc.id } });
  expect(subs).toHaveLength(2);
});

it('does NOT archive DocumentComments on submit', async () => {
  // ... setup with existing comments ...
  const before = await prisma.documentComment.findMany({ where: { documentId: doc.id, archivedAt: null } });
  await action({ ... });
  const after = await prisma.documentComment.findMany({ where: { documentId: doc.id, archivedAt: null } });
  expect(after).toHaveLength(before.length);
});
```

- [ ] **Step 4: Run tests**

```bash
cd services/web-app
bun test app/routes/api.domain.submit-document/route.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.submit-document/
git commit -m "refactor: submit-document creates Submission, allows multi-submit, no comment archival"
```

---

### Task 8: Refactor `grade-essay-ai` endpoint

The AI grading endpoint currently writes to `Grade`. Switch it to write to `Submission` directly via the same `update-submission` pattern (or call `update-submission` internally).

**Files:**
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`

- [ ] **Step 1: Read the current implementation**

Use Read tool on `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts` to understand:
- What inputs it takes (presumably a snapshot/document id + AI prompt config)
- What it writes to Grade (rubric, overallScore, grammarIssues, aiMeta, etc.)
- How it returns to the frontend

- [ ] **Step 2: Update the input shape**

The endpoint now takes a `submissionId` instead of a `snapshotId`. Update the Zod schema:

```ts
const POST = z.object({
  submissionId: z.string(),
  // any other existing fields like model selection, etc.
});
```

- [ ] **Step 3: Update the read path**

Replace `prisma.documentSnapshot.findUnique` with `prisma.submission.findUnique`:

```ts
const submission = await prisma.submission.findUnique({
  where: { id: data.submissionId },
  select: {
    id: true,
    text: true,
    html: true,
    title: true,
    document: { select: { id: true, class: { select: { schoolId: true } } } },
  },
});
```

- [ ] **Step 4: Update the write path**

Where the old code did `prisma.grade.upsert(...)` or similar, replace with `prisma.submission.update(...)`:

```ts
const updated = await prisma.submission.update({
  where: { id: submission.id },
  data: {
    rubricScores: aiResult.rubricScores,
    overallScore: aiResult.overallScore,
    overallComment: aiResult.overallComment,
    numericPercentage: aiResult.numericPercentage,
    letterGrade: aiResult.letterGrade,
    grammarIssues: aiResult.grammarIssues,
    aiMeta: aiResult.aiMeta,
    promptConfig: aiResult.promptConfig,
    gradedAt: submission.gradedAt ?? new Date(),
    gradedById: submission.gradedById ?? actor.profileId,
    updatedAt: new Date(),
  },
});

return dataResponse({ success: true, submission: updated });
```

- [ ] **Step 5: Update tests**

Update `route.test.ts` to use `submission.create` for setup and `prisma.submission.findUnique` for assertions instead of Grade.

- [ ] **Step 6: Run the test**

```bash
bun test app/routes/api.domain.grade-essay-ai/
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/routes/api.domain.grade-essay-ai/
git commit -m "refactor: grade-essay-ai writes to Submission directly"
```

---

### Task 9: Refactor `release-grades` endpoint

Set `Submission.releasedAt` instead of `Grade.releasedAt` for all submissions in the given class/scope.

**Files:**
- Modify: `services/web-app/app/routes/api.domain.release-grades/route.ts`
- Modify: `services/web-app/app/routes/api.domain.release-grades/route.test.ts`

- [ ] **Step 1: Read the current implementation**

Use Read tool to see the current input shape (probably `classId` or `assignmentId`).

- [ ] **Step 2: Update the write path**

Replace `prisma.grade.updateMany({ where: { ... }, data: { releasedAt: now } })` with the equivalent on Submission:

```ts
await prisma.submission.updateMany({
  where: {
    document: { class: { id: data.classId } },
    gradedAt: { not: null },
    releasedAt: null,
  },
  data: {
    releasedAt: new Date(),
    updatedAt: new Date(),
  },
});
```

- [ ] **Step 3: Update tests**

Replace Grade fixtures with Submission fixtures. Adjust assertions.

- [ ] **Step 4: Run tests**

```bash
bun test app/routes/api.domain.release-grades/
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.release-grades/
git commit -m "refactor: release-grades updates Submission.releasedAt"
```

---

### Task 10: Create `submission-comment` endpoint

Replaces `api.model.grade-comment`.

**Files:**
- Create: `services/web-app/app/routes/api.model.submission-comment/route.ts`
- Create: `services/web-app/app/routes/api.model.submission-comment/route.test.ts`

- [ ] **Step 1: Write the test**

```ts
// services/web-app/app/routes/api.model.submission-comment/route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { action } from './route';
import { prisma } from '~/utils/db.server';
import { createTestSubmission, createTestTeacher } from '~/test-utils/factories';

describe('POST /api/model/submission-comment', () => {
  let submissionId: string;
  let teacherProfileId: string;

  beforeEach(async () => {
    const teacher = await createTestTeacher();
    teacherProfileId = teacher.profileId;
    const sub = await createTestSubmission({ title: 'test', text: 'hello', html: '<p>hello</p>' });
    submissionId = sub.id;
  });

  it('creates a SubmissionComment', async () => {
    const formData = new FormData();
    formData.append('submissionId', submissionId);
    formData.append('content', 'Great paragraph');
    formData.append('excerpt', 'hello');
    formData.append('occurrence', '1');

    const res = await action({
      request: new Request('http://test/api/model/submission-comment', {
        method: 'POST',
        body: formData,
        headers: { Cookie: `__session=${teacherProfileId}` },
      }),
      params: {},
      context: {},
    } as any);

    expect(res.ok).toBe(true);
    const comments = await prisma.submissionComment.findMany({ where: { submissionId } });
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe('Great paragraph');
  });

  it('rejects non-teachers', async () => {
    const formData = new FormData();
    formData.append('submissionId', submissionId);
    formData.append('content', 'sneaky');

    const res = await action({
      request: new Request('http://test/api/model/submission-comment', {
        method: 'POST',
        body: formData,
        headers: { Cookie: `__session=student-id` },
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test app/routes/api.model.submission-comment/route.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement the endpoint**

```ts
// services/web-app/app/routes/api.model.submission-comment/route.ts
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

const POST = z.object({
  submissionId: z.string(),
  content: z.string().min(1),
  excerpt: z.string().optional(),
  occurrence: z.string().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can comment on submissions.' },
      { status: 403 }
    );
  }

  const submission = await prisma.submission.findUnique({
    where: { id: data.submissionId },
    select: { id: true },
  });
  if (!submission) {
    return dataResponse({ success: false, message: 'Submission not found.' }, { status: 404 });
  }

  const comment = await prisma.submissionComment.create({
    data: {
      submissionId: data.submissionId,
      content: data.content,
      excerpt: data.excerpt ?? null,
      occurrence: data.occurrence ? parseInt(data.occurrence, 10) : 1,
      profileId: actor.profileId,
    },
  });

  return dataResponse({ success: true, comment });
}
```

- [ ] **Step 4: Run the test**

```bash
bun test app/routes/api.model.submission-comment/route.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.model.submission-comment/
git commit -m "feat: add /api/model/submission-comment endpoint"
```

---

### Task 11: Create `submission-comment.$id` endpoint for delete

Mirrors the existing pattern for `grade-comment.$id`.

**Files:**
- Create: `services/web-app/app/routes/api.model.submission-comment.$id/route.ts`

- [ ] **Step 1: Implement the delete endpoint**

```ts
// services/web-app/app/routes/api.model.submission-comment.$id/route.ts
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'DELETE') {
    return dataResponse({ success: false, message: 'Method not allowed.' }, { status: 405 });
  }

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can manage comments.' },
      { status: 403 }
    );
  }

  if (!params.id) {
    return dataResponse({ success: false, message: 'Missing comment id.' }, { status: 400 });
  }

  await prisma.submissionComment.delete({ where: { id: params.id } });
  return dataResponse({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/routes/api.model.submission-comment.\$id/
git commit -m "feat: add submission-comment.\$id DELETE endpoint"
```

---

### Task 12: Delete obsolete grade endpoints

`api.domain.grade-essay`, `api.domain.update-grade`, `api.model.grade-comment*` are all replaced by the new endpoints.

**Files:**
- Delete: `services/web-app/app/routes/api.domain.grade-essay/`
- Delete: `services/web-app/app/routes/api.domain.update-grade/`
- Delete: `services/web-app/app/routes/api.model.grade-comment/`
- Delete: `services/web-app/app/routes/api.model.grade-comment.$id/`
- Delete: `services/web-app/app/routes/api.model.grade-comment-response/`

- [ ] **Step 1: Find all consumers in the frontend**

```bash
cd services/web-app
```
Use Grep tool with patterns `grade-essay|update-grade|grade-comment` and list every callsite. These are the files that need to be updated (Tasks 13-19) before the deletes can be safe.

Expected callsites (from earlier analysis):
- `app/routes/app_.documents_.$id/route.tsx`
- `app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx`
- `app/routes/app_.documents_.$id/_components/grading-comments-sidebar.tsx`
- `app/routes/app_.graded_.$gradeId/route.tsx`
- `app/routes/app.my-classes.$classId/route.tsx`
- `app/routes/app.my-classes.$classId/grading-sheet.tsx`
- `app/routes/app.my-classes.$classId/release-grades-sheet.tsx`
- `app/components/grade-comment-card.tsx`

- [ ] **Step 2: Wait — DON'T delete yet**

We need to update consumers first. Skip this task and come back after Task 19. (This task is here as a placeholder for ordering clarity.)

---

### Task 13: Update document loader to use Submission instead of submittedSnapshot

The loader in `app_.documents_.$id/route.tsx` currently selects `submittedSnapshot.grades`. After Phase 2 the model is gone — switch to selecting from `submissions`.

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx`

- [ ] **Step 1: Find the loader's `submittedSnapshot` select block**

Use Read tool to locate. It's roughly lines 200-222 in the current file (post-Phase-1 may have shifted).

- [ ] **Step 2: Replace the select**

Replace:

```ts
submittedSnapshot: {
  select: {
    id: true,
    html: true,
    text: true,
    grades: {
      select: { ... },
      take: 1,
    },
  },
},
versions: { orderBy: { createdAt: 'desc' } },
```

With:

```ts
submissions: {
  orderBy: { submittedAt: 'desc' },
  select: {
    id: true,
    title: true,
    text: true,
    html: true,
    submittedAt: true,
    score: true,
    feedback: true,
    overallScore: true,
    overallComment: true,
    numericPercentage: true,
    letterGrade: true,
    grammarIssues: true,
    rubricScores: true,
    releasedAt: true,
    gradedAt: true,
    gradedById: true,
    createdAt: true,
  },
  take: 5,  // recent submissions
},
```

Note: `versions` was already removed in Phase 1.

- [ ] **Step 3: Update the loader's `selectedSnapshot` block**

Find the `requestedSnapshotId && isViewingAsTeacher` branch (~line 275 in the current file). Replace `prisma.documentSnapshot.findFirst` with `prisma.submission.findFirst`. The query parameter changes from `snapshotId` to `submissionId`. Update the URL search param too:

```ts
const requestedSubmissionId = url.searchParams.get('submissionId');
// ...
const selectedSubmission = requestedSubmissionId && isViewingAsTeacher
  ? await prisma.submission.findFirst({
      where: { id: requestedSubmissionId, documentId: doc.id },
      select: { /* same fields as the submissions select */ },
    })
  : null;
```

- [ ] **Step 4: Update derived state in the component**

Find code in the route component that references `data.doc.submittedSnapshot`, `activeSnapshot`, `submittedAt`, `submittedSnapshotId`. Replace with the equivalent from `data.doc.submissions[0]` (or `selectedSubmission` if applicable).

Concretely, the line:
```ts
const activeSnapshot = data.activeSnapshot ?? data.doc.submittedSnapshot;
```

Becomes:
```ts
const latestSubmission = data.selectedSubmission ?? data.doc.submissions?.[0] ?? null;
```

The `isSubmitted` derivation:
```ts
const isSubmitted = data.doc.submittedAt !== null;
```

Becomes:
```ts
const isSubmitted = (data.doc.submissions?.length ?? 0) > 0;
```

The `grade` derivation:
```ts
const grade = activeSnapshot?.grades?.[0];
```

Becomes:
```ts
const grade = latestSubmission && latestSubmission.gradedAt
  ? latestSubmission  // Submission has grading fields directly on it
  : null;
```

The `isTeacherSnapshotView` derivation:
```ts
const isTeacherSnapshotView = isViewingAsTeacher && Boolean(activeSnapshot?.id);
```

Becomes:
```ts
const isTeacherSubmissionView = isViewingAsTeacher && Boolean(latestSubmission?.id);
```

Rename usages throughout the file.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```
Expected: many errors about removed fields (`submittedAt`, `submittedSnapshot`, `Grade`, etc.). Fix each one to use the new shape.

- [ ] **Step 6: Run tests**

```bash
bun test app/routes/app_.documents_.\$id/
```
Expected: tests may fail until further consumers are updated. Note any failures and continue.

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/route.tsx
git commit -m "refactor: document loader reads Submission instead of submittedSnapshot"
```

---

### Task 14: Update teacher dashboard tabs onto Submission

The dashboard at `app.my-classes.$classId/route.tsx` queries documents joined with snapshots/grades for the Submitted/Graded/Released tabs. Switch to querying `Submission`.

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`

- [ ] **Step 1: Find the loader and the tab queries**

Use Read tool to locate. The loader probably has multiple `prisma.document.findMany` calls or one big findMany with `submittedSnapshot` includes.

- [ ] **Step 2: Rewrite the queries to use Submission**

| Tab | Query |
|---|---|
| In Progress | `Documents WHERE NOT EXISTS (Submission WHERE submittedAt IS NOT NULL AND releasedAt IS NULL)` — i.e., docs with no pending ungraded submission |
| Submitted | `Submissions WHERE gradedAt IS NULL` |
| Graded | `Submissions WHERE gradedAt IS NOT NULL AND releasedAt IS NULL` |
| Released | `Submissions WHERE releasedAt IS NOT NULL` |

Concrete example for the Submitted tab:

```ts
const submittedSubmissions = await prisma.submission.findMany({
  where: {
    document: { class: { id: classId } },
    gradedAt: null,
  },
  select: {
    id: true,
    title: true,
    submittedAt: true,
    document: { select: { id: true, profile: { select: { user: { select: { name: true } } } } } },
  },
  orderBy: { submittedAt: 'desc' },
});
```

Repeat for Graded and Released tabs with appropriate filters.

For "In Progress":

```ts
const inProgressDocs = await prisma.document.findMany({
  where: {
    deletedAt: null,
    class: { id: classId },
    OR: [
      { submissions: { none: {} } },  // never submitted
      { submissions: { every: { releasedAt: { not: null } } } },  // all submissions released → student is revising
    ],
  },
  select: {
    id: true,
    title: true,
    updatedAt: true,
    profile: { select: { user: { select: { name: true } } } },
  },
});
```

- [ ] **Step 3: Update the JSX that renders each tab**

The columns may have changed shape. Update the table/list components to read from the new query results.

- [ ] **Step 4: Run typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: errors decrease as the loader is refactored.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.\$classId/route.tsx
git commit -m "refactor: teacher dashboard tabs query Submission directly"
```

---

### Task 15: Update grading-sheet and release-grades-sheet onto Submission

These two sheets in `app.my-classes.$classId/` interact with the dashboard tabs.

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes.$classId/grading-sheet.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/release-grades-sheet.tsx`

- [ ] **Step 1: Read both files and identify the data they consume**

Use Read tool on each. Note what props they expect (probably an array of grades or snapshots). Update the prop types to use Submission.

- [ ] **Step 2: Update prop types and JSX**

Replace `Grade` types with `Submission` types. Update field accesses (e.g., `grade.essayTitle` → `submission.title`).

- [ ] **Step 3: Update the form submission target for release-grades-sheet**

The release form posts to `/api/domain/release-grades`. The endpoint signature might have changed (e.g., now takes `submissionIds` instead of `gradeIds`). Verify and update the form.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.\$classId/
git commit -m "refactor: grading-sheet and release-grades-sheet use Submission"
```

---

### Task 16: Update `app_.graded_.$gradeId/route.tsx` to use legacy redirect

This is the old graded view. Phase 3 will replace it with `/app/submissions/:submissionId`. For Phase 2, just make it work — read the grade id from params, look up the redirect, and either render the existing UI against a Submission OR redirect to the new URL (which doesn't exist yet — fall back to rendering for now).

**Files:**
- Modify: `services/web-app/app/routes/app_.graded_.$gradeId/route.tsx`

- [ ] **Step 1: Read the file to find the loader**

Use Read tool. The current loader does `prisma.grade.findUnique({ where: { id: params.gradeId } })`.

- [ ] **Step 2: Replace the loader to look up via redirect table**

```ts
export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.gradeId, 'No grade id');

  const redirect = await prisma.legacyGradeRedirect.findUnique({
    where: { gradeId: params.gradeId },
  });
  if (!redirect) {
    throw new Response('Not found', { status: 404 });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: redirect.submissionId },
    select: {
      id: true,
      title: true,
      text: true,
      html: true,
      submittedAt: true,
      score: true,
      feedback: true,
      overallScore: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      grammarIssues: true,
      rubricScores: true,
      releasedAt: true,
      gradedAt: true,
      document: {
        select: {
          id: true,
          profile: { select: { user: { select: { name: true } } } },
        },
      },
      comments: {
        include: { profile: { select: { user: { select: { name: true } } } } },
      },
    },
  });

  if (!submission) {
    throw new Response('Not found', { status: 404 });
  }

  return dataResponse({ submission });
}
```

- [ ] **Step 3: Update the component to read from `data.submission`**

Replace `data.grade.essayText` → `data.submission.text`, `data.grade.essayHtml` → `data.submission.html`, etc. Field names mostly match between Grade and Submission.

- [ ] **Step 4: Update grade-comment references**

Find any reference to `grade.comments` (which were `GradeComment[]`) — they're now `submission.comments` (`SubmissionComment[]`). Field names should match.

- [ ] **Step 5: Run typecheck**

```bash
cd services/web-app && bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/app_.graded_.\$gradeId/route.tsx
git commit -m "refactor: graded view loads Submission via legacy redirect lookup"
```

---

### Task 17: Update teacher-grading-panel.tsx (minimal Phase 2 changes only)

This is the big component that Phase 3 will rewrite. For Phase 2, only make the minimum changes needed for it to compile and read from Submission instead of Grade.

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx`

- [ ] **Step 1: Read the file to find Grade-typed props and state**

Use Read tool. Note all places that reference `grade`, `gradeId`, `essayTitle`, `essayText`, `essayHtml`.

- [ ] **Step 2: Update prop types**

Change `grade: Grade` to `submission: Submission` (or whatever the loader passes after Task 13). Update field accesses.

- [ ] **Step 3: Update fetcher target URLs (temporarily)**

The component currently submits to `/api/domain/grade-essay` and `/api/domain/update-grade`. Both are scheduled for deletion. For Phase 2, switch to `/api/domain/update-submission` with the new field shape. Phase 3 will replace the fetcher pattern entirely with the auto-save hook.

```tsx
// Replace:
fetcher.submit({ snapshotId, score, feedback }, { method: 'POST', action: '/api/domain/grade-essay' });

// With:
fetcher.submit({ submissionId: submission.id, score, feedback }, { method: 'POST', action: '/api/domain/update-submission' });
```

- [ ] **Step 4: Update grade-comment fetcher target**

The component creates grade comments via `/api/model/grade-comment`. Switch to `/api/model/submission-comment` with `submissionId` instead of `gradeId`.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```
Expected: errors decrease.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/_components/teacher-grading-panel.tsx
git commit -m "refactor: teacher-grading-panel minimum changes to use Submission (Phase 3 will rewrite)"
```

---

### Task 18: Update grading-comments-sidebar.tsx (minimal Phase 2 changes only)

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/_components/grading-comments-sidebar.tsx`

- [ ] **Step 1: Read the file**

Use Read tool. Note Grade/GradeComment type references.

- [ ] **Step 2: Update prop types**

Change `gradeComments: GradeComment[]` to `submissionComments: SubmissionComment[]` (or whatever the loader passes). Update field accesses.

- [ ] **Step 3: Update fetcher targets**

Replace `/api/model/grade-comment` with `/api/model/submission-comment`. Replace `/api/model/grade-comment/:id` (DELETE) with `/api/model/submission-comment/:id`.

- [ ] **Step 4: Update `grade-comment-card.tsx`**

This shared component (`app/components/grade-comment-card.tsx`) is rendered by the sidebar. Update its prop types from `GradeComment` to `SubmissionComment`.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/_components/grading-comments-sidebar.tsx \
        services/web-app/app/components/grade-comment-card.tsx
git commit -m "refactor: grading-comments-sidebar minimum changes to use SubmissionComment"
```

---

### Task 19: Sweep for any remaining references to old types

Scan the codebase for any straggling references to `Grade`, `DocumentSnapshot`, `GradeComment`, `GradeCommentResponse`, `submittedSnapshot`, `submittedAt` (on Document), and fix each.

- [ ] **Step 1: Grep for each old name**

```bash
cd services/web-app
```
Use Grep tool with each pattern in turn:
- `prisma\.grade\.|prisma\.documentSnapshot\.|prisma\.gradeComment\.|prisma\.gradeCommentResponse\.`
- `\.submittedSnapshot|\.submittedSnapshotId`
- `from ['"][^'"]*\.grade['"]|GradeComment|gradeCommentResponse`
- `: Grade|: DocumentSnapshot|: GradeComment` (TypeScript type annotations)

- [ ] **Step 2: Fix each match**

For each remaining reference, update it to the new model. This is mechanical.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```
Expected: zero errors related to old types.

- [ ] **Step 4: Run tests**

```bash
bun test
```
Expected: failures only in tests that need updates for the new return shapes (handled in Task 21).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: sweep remaining references to old grading types"
```

---

### Task 20: Now actually delete the obsolete grade endpoints

Returning to Task 12. With all consumers updated, the deletes are safe.

**Files:**
- Delete: `services/web-app/app/routes/api.domain.grade-essay/` (route + tests)
- Delete: `services/web-app/app/routes/api.domain.update-grade/` (route + tests)
- Delete: `services/web-app/app/routes/api.model.grade-comment/` (route + tests)
- Delete: `services/web-app/app/routes/api.model.grade-comment.$id/` (route + tests)
- Delete: `services/web-app/app/routes/api.model.grade-comment-response/` (route + tests)

- [ ] **Step 1: Final consumer check**

```bash
cd services/web-app
```
Use Grep tool with patterns matching each endpoint URL. Verify zero matches outside the files about to be deleted.

- [ ] **Step 2: Delete the files**

```bash
git rm -r services/web-app/app/routes/api.domain.grade-essay/ \
         services/web-app/app/routes/api.domain.update-grade/ \
         services/web-app/app/routes/api.model.grade-comment/ \
         services/web-app/app/routes/api.model.grade-comment.\$id/ \
         services/web-app/app/routes/api.model.grade-comment-response/
```

- [ ] **Step 3: Run typecheck and tests**

```bash
bun run typecheck && bun test
```
Expected: PASS (or only the test failures handled in Task 21).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete obsolete grade endpoints (replaced by submission endpoints)"
```

---

### Task 21: Update remaining test fixtures and assertions

Many tests reference factories and fixtures that no longer match the schema. Update them.

**Files:**
- Modify: `services/web-app/app/test-utils/factories.ts` (or wherever test factories live)
- Modify: any `.test.ts` files that fail because of old fixture shapes

- [ ] **Step 1: Find the test factory file**

```bash
cd services/web-app
```
Use Grep tool with pattern `createTestSnapshot|createTestGrade|createTestGradeComment` to find factories. Most likely in `app/test-utils/` or `app/utils/test-helpers.ts`.

- [ ] **Step 2: Add new factories**

```ts
export async function createTestSubmission({
  documentId = 'test-doc',
  title = 'Test Submission',
  text = 'test text',
  html = '<p>test</p>',
}: Partial<{ documentId: string; title: string; text: string; html: string }> = {}) {
  return prisma.submission.create({
    data: {
      documentId,
      title,
      text,
      html,
      submittedAt: new Date(),
    },
  });
}

export async function createTestSubmissionComment({
  submissionId,
  profileId,
  content = 'test comment',
}: { submissionId: string; profileId: string; content?: string }) {
  return prisma.submissionComment.create({
    data: { submissionId, profileId, content },
  });
}
```

- [ ] **Step 3: Delete old factories**

Delete `createTestSnapshot`, `createTestGrade`, `createTestGradeComment` if they exist.

- [ ] **Step 4: Update each failing test file**

Iterate through failing tests, update each to use the new factories and the new return shapes. Most updates are mechanical: rename `snapshot.essayText` → `submission.text`, etc.

- [ ] **Step 5: Run all tests**

```bash
bun test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: update fixtures and assertions to use Submission model"
```

---

### Task 22: Migration validation test

A unit test that builds a fixture database with realistic snapshot+grade+comment data, runs the consolidation migration via Prisma, and asserts the results match expectations.

**Files:**
- Create: `packages/prisma/scripts/document-hardening-migration.test.ts`

- [ ] **Step 1: Implement the test**

```ts
// packages/prisma/scripts/document-hardening-migration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://localhost/yawp_migration_test';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

describe('document hardening migration', () => {
  beforeAll(async () => {
    // Reset test database to a state BEFORE the consolidate-submissions migration
    execSync('bunx prisma migrate reset --force --skip-seed', {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    });
    // Roll back the consolidate-submissions migration if applied
    // (This requires the down.sql to exist and be runnable manually)
  });

  it('produces the expected row counts after running the migration', async () => {
    // Seed test data
    const doc = await prisma.document.create({ data: { /* ... */ } });
    // Create 3 snapshots: 1 with grade, 1 without, 1 archived
    // ... (use raw SQL since Prisma client no longer has the old types)

    // Run the migration
    execSync('bunx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    });

    // Assert
    const submissions = await prisma.submission.findMany();
    expect(submissions).toHaveLength(2);  // archived snapshot is dropped

    const subWithGrade = submissions.find((s) => s.gradedAt !== null);
    expect(subWithGrade).toBeDefined();
    expect(subWithGrade?.score).toBeDefined();

    const legacyRedirects = await prisma.legacyGradeRedirect.findMany();
    expect(legacyRedirects).toHaveLength(1);
  });
});
```

(This test is more complex than typical because it needs to manipulate the database around migration boundaries. May be simpler to skip and rely on the dry-run script + manual staging verification.)

- [ ] **Step 2: Decide whether to keep or skip**

If maintaining this test is too complex (it requires careful database state management), document it as a manual procedure in the spec instead and skip the file. Note in commit message.

- [ ] **Step 3: Commit (whichever path was chosen)**

```bash
git add packages/prisma/scripts/
git commit -m "test: add migration validation test (or skip with documented manual procedure)"
```

---

### Task 23: Full test pass and verification

- [ ] **Step 1: Run all unit tests**

```bash
cd services/web-app
bun test
```
Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Run E2E smoke tests**

```bash
bunx playwright test --grep @smoke
```
Expected: PASS. Some teacher-flow tests may need updates — fix iteratively.

- [ ] **Step 4: Manual smoke test (local dev)**

```bash
bun run dev
```

Verify:
- Log in as student → write essay → submit → submission appears
- Log in as student → submit again → second submission appears (multi-submit working)
- Log in as teacher → see Submitted tab → click student's submission → see grading panel
- Edit grading fields → save (the old fetcher path is still in use here; full auto-save comes in Phase 3)
- Release grades → student can see them

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: post-Phase-2 smoke test fixes"
```

---

### Task 24: Write the down.sql for emergency rollback

A script that can recreate `DocumentSnapshot`, `Grade`, `GradeComment`, `GradeCommentResponse` from `Submission`/`SubmissionComment` if the migration needs to be rolled back. This is **NOT** part of the normal deploy — it's an emergency tool kept in version control.

**Files:**
- Create: `packages/prisma/migrations/<consolidate_submissions_timestamp>/down.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- Emergency rollback for the consolidate-submissions migration.
-- DO NOT run this as part of a normal deploy.
-- Recreates DocumentSnapshot, Grade, GradeComment, GradeCommentResponse from Submission/SubmissionComment.

-- 1. Recreate the old tables (schemas exact to pre-migration definitions)
CREATE TABLE "DocumentSnapshot" (
  id          TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "submittedAt" TIMESTAMPTZ,
  "archivedAt"  TIMESTAMPTZ,
  text        TEXT NOT NULL,
  html        TEXT NOT NULL,
  "documentId" TEXT NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE
);
CREATE INDEX "DocumentSnapshot_documentId_createdAt_idx" ON "DocumentSnapshot"("documentId", "createdAt" DESC);
CREATE INDEX "DocumentSnapshot_submittedAt_archivedAt_idx" ON "DocumentSnapshot"("submittedAt", "archivedAt");

CREATE TABLE "Grade" (
  id                TEXT PRIMARY KEY,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  score             TEXT,
  feedback          TEXT,
  "rubricScores"    JSONB,
  "overallScore"    INTEGER,
  "overallComment"  TEXT,
  "numericPercentage" INTEGER,
  "letterGrade"     TEXT,
  "grammarIssues"   JSONB,
  "promptConfig"    JSONB,
  "aiMeta"          JSONB,
  "essayText"       TEXT,
  "essayHtml"       TEXT,
  "releasedAt"      TIMESTAMPTZ,
  "documentId"      TEXT NOT NULL REFERENCES "Document"(id) ON DELETE RESTRICT,
  "snapshotId"      TEXT UNIQUE REFERENCES "DocumentSnapshot"(id) ON DELETE SET NULL,
  "gradedById"      TEXT NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE
);
CREATE INDEX "Grade_documentId_idx" ON "Grade"("documentId");
CREATE INDEX "Grade_snapshotId_idx" ON "Grade"("snapshotId");
CREATE INDEX "Grade_gradedById_idx" ON "Grade"("gradedById");
CREATE INDEX "Grade_releasedAt_idx" ON "Grade"("releasedAt");

CREATE TABLE "GradeComment" (
  id          TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  content     TEXT NOT NULL,
  excerpt     TEXT,
  occurrence  INTEGER NOT NULL DEFAULT 1,
  "gradeId"   TEXT NOT NULL REFERENCES "Grade"(id) ON DELETE CASCADE,
  "profileId" TEXT NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE
);
CREATE INDEX "GradeComment_gradeId_createdAt_idx" ON "GradeComment"("gradeId", "createdAt" DESC);
CREATE INDEX "GradeComment_profileId_idx" ON "GradeComment"("profileId");

CREATE TABLE "GradeCommentResponse" (
  id          TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  content     TEXT NOT NULL,
  "commentId" TEXT NOT NULL REFERENCES "GradeComment"(id) ON DELETE CASCADE,
  "profileId" TEXT NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE
);
CREATE INDEX "GradeCommentResponse_commentId_idx" ON "GradeCommentResponse"("commentId");
CREATE INDEX "GradeCommentResponse_profileId_idx" ON "GradeCommentResponse"("profileId");

-- 2. Re-add the columns on Document
ALTER TABLE "Document" ADD COLUMN "submittedAt" TIMESTAMPTZ;
ALTER TABLE "Document" ADD COLUMN "submittedSnapshotId" TEXT;

-- 3. Recreate snapshots from submissions
INSERT INTO "DocumentSnapshot" (id, "createdAt", "submittedAt", text, html, "documentId")
SELECT id, "createdAt", "submittedAt", text, html, "documentId"
FROM "Submission";

-- 4. Recreate grades from submissions (only those with gradedAt)
INSERT INTO "Grade" (
  id, "createdAt", "updatedAt", score, feedback, "rubricScores",
  "overallScore", "overallComment", "numericPercentage", "letterGrade",
  "grammarIssues", "promptConfig", "aiMeta", "essayText", "essayHtml",
  "releasedAt", "documentId", "snapshotId", "gradedById"
)
SELECT
  id || '-grade' AS id,                -- new id since Grade.id was distinct from Snapshot.id
  "createdAt", "updatedAt", score, feedback, "rubricScores",
  "overallScore", "overallComment", "numericPercentage", "letterGrade",
  "grammarIssues", "promptConfig", "aiMeta", text, html,
  "releasedAt", "documentId", id,
  COALESCE("gradedById", (SELECT id FROM "Profile" LIMIT 1))  -- fallback to any profile if SetNull occurred
FROM "Submission"
WHERE "gradedAt" IS NOT NULL;

-- 5. Recreate grade comments from submission comments
INSERT INTO "GradeComment" (id, "createdAt", "updatedAt", content, excerpt, occurrence, "gradeId", "profileId")
SELECT
  sc.id, sc."createdAt", sc."updatedAt", sc.content, sc.excerpt, sc.occurrence,
  s.id || '-grade' AS "gradeId",
  sc."profileId"
FROM "SubmissionComment" sc
JOIN "Submission" s ON s.id = sc."submissionId"
WHERE s."gradedAt" IS NOT NULL;

-- 6. Restore Document.submittedAt and submittedSnapshotId from latest submission
UPDATE "Document" d
SET "submittedAt" = sub."submittedAt",
    "submittedSnapshotId" = sub.id
FROM (
  SELECT DISTINCT ON ("documentId") "documentId", id, "submittedAt"
  FROM "Submission"
  ORDER BY "documentId", "submittedAt" DESC
) sub
WHERE d.id = sub."documentId";

-- 7. Drop the new tables
DROP TABLE "LegacyGradeRedirect";
DROP TABLE "SubmissionComment";
DROP TABLE "Submission";
```

- [ ] **Step 2: Test the down.sql against staging**

(This is a manual procedure done before the production maintenance window.)

```bash
# In staging, after applying the migration:
psql -d yawp_staging -f packages/prisma/migrations/<consolidate_submissions>/down.sql
# Verify counts match the pre-migration state
# Then re-apply the migration to restore staging to the post-migration state
bunx prisma migrate deploy
```

- [ ] **Step 3: Commit**

```bash
git add packages/prisma/migrations/
git commit -m "feat: down.sql for emergency rollback of submission consolidation"
```

---

## Verification Checklist for Phase 2

After all tasks complete, manually verify:

- [ ] `Submission`, `SubmissionComment`, `LegacyGradeRedirect` models exist in schema.prisma
- [ ] `DocumentSnapshot`, `Grade`, `GradeComment`, `GradeCommentResponse` removed from schema.prisma
- [ ] `Document.submittedAt`, `Document.submittedSnapshotId` columns dropped
- [ ] Migration runs cleanly on local dev DB
- [ ] Dry-run script reports correct counts
- [ ] `api.domain.update-submission` exists and tests pass
- [ ] `api.model.submission-comment` (POST + DELETE) exists and tests pass
- [ ] `api.domain.submit-document` creates Submission, allows multi-submit, doesn't archive comments
- [ ] `api.domain.grade-essay-ai` writes to Submission
- [ ] `api.domain.release-grades` updates Submission.releasedAt
- [ ] `api.domain.grade-essay`, `api.domain.update-grade`, `api.model.grade-comment*` deleted
- [ ] Document loader reads from `submissions` not `submittedSnapshot`
- [ ] Teacher dashboard tabs query Submission directly
- [ ] `app_.graded_.$gradeId` uses LegacyGradeRedirect lookup
- [ ] All TypeScript references to old types replaced
- [ ] All unit tests pass
- [ ] All E2E smoke tests pass
- [ ] Manual smoke: student submits → submission row created
- [ ] Manual smoke: student submits twice → two submission rows
- [ ] Manual smoke: teacher grades a submission → grading fields persist
- [ ] Manual smoke: teacher releases grades → student sees them
- [ ] down.sql tested in staging

When all items are checked, Phase 2 is complete. Proceed to Phase 3 (Grading Panel Cleanup).
