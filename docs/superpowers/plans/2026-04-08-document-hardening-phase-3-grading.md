# Phase 3 — Grading Panel Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the teacher grading UI on top of Phase 2's `Submission` model. Replace the fetcher-based grading panel with an auto-save-on-blur pattern. Move files into the `teacher-grading/` folder. Replace `/app/graded/:gradeId` with `/app/submissions/:submissionId` (the redirect lookup created in Phase 2 keeps old URLs working). No multi-class assignment work — that's deferred to a future assignments project.

**Architecture:** Every grading field saves on blur via the `update-submission` endpoint. A small `useUpdateSubmission` hook owns the fetch + status indicator. The "Save" button disappears entirely. Files move into a `teacher-grading/` folder for clarity (started in Phase 1 for grade-highlights). The graded view becomes its own route at `/app/submissions/:submissionId`; the old `/app/graded/:gradeId` route becomes a 6-line redirect-only loader.

**Tech Stack:** React Router v7, TypeScript, Vitest, Playwright

**Branch:** `document-hardening` (off `main`)
**Spec:** `docs/superpowers/specs/2026-04-08-document-hardening-design.md`
**Depends on:** Phase 1 + Phase 2 plans complete

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `services/web-app/app/routes/app_.documents_.$id/teacher-grading/use-update-submission.ts` | Create | Auto-save hook for grading fields |
| `services/web-app/app/routes/app_.documents_.$id/teacher-grading/use-update-submission.test.tsx` | Create | Tests |
| `services/web-app/app/routes/app_.documents_.$id/teacher-grading/teacher-grading-panel.tsx` | Move + refactor | Auto-save grading UI |
| `services/web-app/app/routes/app_.documents_.$id/teacher-grading/grading-comments-sidebar.tsx` | Move + refactor | SubmissionComment sidebar |
| `services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx` | **DELETE** | Replaced by moved version |
| `services/web-app/app/routes/app_.documents_.$id/_components/grading-comments-sidebar.tsx` | **DELETE** | Replaced by moved version |
| `services/web-app/app/routes/app.submissions.$submissionId/route.tsx` | Create | New graded view at the new URL |
| `services/web-app/app/routes/app_.graded_.$gradeId/route.tsx` | Refactor | Tiny redirect-only loader |
| `services/web-app/app/components/grade-comment-card.tsx` | Refactor | Submission-comment shape, on-blur save (or rename to submission-comment-card) |
| `services/web-app/app/routes/app_.documents_.$id/route.tsx` | Modify | Update import paths after the moves |
| `services/web-app/e2e/tests/teacher.grading-flow.spec.ts` | Update | New panel structure, auto-save assertions |
| `services/web-app/e2e/tests/teacher.grading-autosave.spec.ts` | Cherry-pick from PR #77 | Auto-save behavior tests |

---

### Task 1: Create the `useUpdateSubmission` hook

The auto-save hook that wraps `POST /api/domain/update-submission` and exposes a status indicator.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/teacher-grading/use-update-submission.ts`
- Create: `services/web-app/app/routes/app_.documents_.$id/teacher-grading/use-update-submission.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// services/web-app/app/routes/app_.documents_.$id/teacher-grading/use-update-submission.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUpdateSubmission } from './use-update-submission';

describe('useUpdateSubmission', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, submission: { id: 'sub-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('initializes with status idle', () => {
    const { result } = renderHook(() => useUpdateSubmission('sub-1'));
    expect(result.current.status).toBe('idle');
  });

  it('transitions to saving then saved on a successful save', async () => {
    const { result } = renderHook(() => useUpdateSubmission('sub-1'));

    await act(async () => {
      await result.current.update({ overallComment: 'great' });
    });

    expect(result.current.status).toBe('saved');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/domain/update-submission',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('transitions to error on a failed save', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, message: 'oops' }), { status: 500 })
    );

    const { result } = renderHook(() => useUpdateSubmission('sub-1'));

    await act(async () => {
      await result.current.update({ overallComment: 'fail' });
    });

    expect(result.current.status).toBe('error');
  });

  it('serializes JSON fields (rubricScores) to strings', async () => {
    const { result } = renderHook(() => useUpdateSubmission('sub-1'));

    await act(async () => {
      await result.current.update({ rubricScores: { thesis: { score: 4 } } });
    });

    const callArgs = fetchSpy.mock.calls[0];
    const formData = callArgs[1].body as FormData;
    const rubricStr = formData.get('rubricScores');
    expect(typeof rubricStr).toBe('string');
    expect(JSON.parse(rubricStr as string)).toEqual({ thesis: { score: 4 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/web-app
bun test app/routes/app_.documents_.\$id/teacher-grading/use-update-submission.test.tsx
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

```ts
// services/web-app/app/routes/app_.documents_.$id/teacher-grading/use-update-submission.ts
import { useCallback, useState } from 'react';

export type UpdateStatus = 'idle' | 'saving' | 'saved' | 'error';

type Updatable = {
  score?: string;
  feedback?: string;
  rubricScores?: any;
  overallScore?: number | null;
  overallComment?: string;
  numericPercentage?: number | null;
  letterGrade?: string;
  grammarIssues?: any;
  aiMeta?: any;
};

export function useUpdateSubmission(submissionId: string) {
  const [status, setStatus] = useState<UpdateStatus>('idle');

  const update = useCallback(
    async (fields: Updatable): Promise<void> => {
      setStatus('saving');
      try {
        const formData = new FormData();
        formData.append('submissionId', submissionId);
        for (const [k, v] of Object.entries(fields)) {
          if (v === undefined || v === null) continue;
          if (typeof v === 'object') {
            formData.append(k, JSON.stringify(v));
          } else {
            formData.append(k, String(v));
          }
        }
        const res = await fetch('/api/domain/update-submission', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          setStatus('error');
          return;
        }
        setStatus('saved');
        // Auto-fade back to idle after a beat so the indicator doesn't pin
        setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
      } catch {
        setStatus('error');
      }
    },
    [submissionId]
  );

  return { update, status };
}
```

- [ ] **Step 4: Run test**

```bash
bun test app/routes/app_.documents_.\$id/teacher-grading/use-update-submission.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/teacher-grading/use-update-submission.ts \
        services/web-app/app/routes/app_.documents_.\$id/teacher-grading/use-update-submission.test.tsx
git commit -m "feat: useUpdateSubmission hook for auto-save grading"
```

---

### Task 2: Move and refactor `teacher-grading-panel.tsx`

Move the file into `teacher-grading/`, refactor it onto `useUpdateSubmission`, delete the save button + dialogs.

**Files:**
- Move + modify: `services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx` → `teacher-grading/teacher-grading-panel.tsx`

- [ ] **Step 1: Move the file**

```bash
cd services/web-app/app/routes/app_.documents_.\$id
git mv _components/teacher-grading-panel.tsx teacher-grading/teacher-grading-panel.tsx
```

- [ ] **Step 2: Update the consumer import in route.tsx**

```bash
cd services/web-app
```
Use Grep tool with pattern `from ['"].*_components/teacher-grading-panel['"]` and update to `from './teacher-grading/teacher-grading-panel'`.

- [ ] **Step 3: Delete fetcher-based save logic**

In the moved file, find every `fetcher.submit()` for grading fields. Remove them. Remove any `useFetcher()` instances that are now unused.

- [ ] **Step 4: Add the auto-save hook**

```tsx
import { useUpdateSubmission } from './use-update-submission';
import { Check, Loader2, AlertCircle } from 'lucide-react';

function SaveStatusBadge({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="h-3 w-3" /> Save failed
    </span>
  );
}

export function TeacherGradingPanel({ submission, /* other props */ }: Props) {
  const { update, status } = useUpdateSubmission(submission.id);

  return (
    <div className="grading-panel">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-md font-semibold">Grading</h2>
        <SaveStatusBadge status={status} />
      </div>

      {/* score field */}
      <Field label="Score">
        <Input
          defaultValue={submission.score ?? ''}
          onBlur={(e) => void update({ score: e.target.value })}
        />
      </Field>

      {/* feedback field */}
      <Field label="Feedback">
        <Textarea
          defaultValue={submission.feedback ?? ''}
          onBlur={(e) => void update({ feedback: e.target.value })}
        />
      </Field>

      {/* overallScore field */}
      <Field label="Overall Score">
        <Input
          type="number"
          defaultValue={submission.overallScore ?? ''}
          onBlur={(e) => void update({ overallScore: e.target.value ? Number(e.target.value) : null })}
        />
      </Field>

      {/* overallComment field */}
      <Field label="Overall Comment">
        <Textarea
          defaultValue={submission.overallComment ?? ''}
          onBlur={(e) => void update({ overallComment: e.target.value })}
        />
      </Field>

      {/* numericPercentage field */}
      <Field label="Percentage">
        <Input
          type="number"
          defaultValue={submission.numericPercentage ?? ''}
          onBlur={(e) => void update({ numericPercentage: e.target.value ? Number(e.target.value) : null })}
        />
      </Field>

      {/* letterGrade field */}
      <Field label="Letter Grade">
        <Input
          defaultValue={submission.letterGrade ?? ''}
          onBlur={(e) => void update({ letterGrade: e.target.value })}
        />
      </Field>

      {/* Rubric scores — depends on existing rubric UI */}
      {/* ... */}

      {/* AI grading button — keeps existing flow but writes via update endpoint */}
      <Button onClick={runAiGrading}>Grading Assistant</Button>
    </div>
  );
}
```

The `Field` wrapper is whatever your existing form layout uses (or `<label> + child`). The actual implementation should mirror the existing visual structure but replace each form element with the auto-save pattern.

- [ ] **Step 5: Delete the save button and any "are you sure" dialogs**

Search for any "Save grade" / "Save changes" / `Dialog` related to confirming grade saves. Delete them.

- [ ] **Step 6: Update prop types**

The component now takes `submission: Submission` (not `grade: Grade`). Update accordingly.

- [ ] **Step 7: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/teacher-grading/ \
        services/web-app/app/routes/app_.documents_.\$id/_components/
git commit -m "refactor: teacher-grading-panel uses auto-save on blur, no save button"
```

---

### Task 3: Move and refactor `grading-comments-sidebar.tsx`

Move the file into `teacher-grading/`, switch from fetcher to plain fetch + local state.

**Files:**
- Move + modify: `services/web-app/app/routes/app_.documents_.$id/_components/grading-comments-sidebar.tsx` → `teacher-grading/grading-comments-sidebar.tsx`

- [ ] **Step 1: Move the file**

```bash
cd services/web-app/app/routes/app_.documents_.\$id
git mv _components/grading-comments-sidebar.tsx teacher-grading/grading-comments-sidebar.tsx
```

- [ ] **Step 2: Update consumer imports**

```bash
cd services/web-app
```
Use Grep tool with pattern `from ['"].*_components/grading-comments-sidebar['"]` and update.

- [ ] **Step 3: Replace fetcher with plain fetch + local state**

Find any `fetcher.submit()` calls and replace with:

```tsx
const [comments, setComments] = useState(initialComments);

const addComment = async (content: string, excerpt?: string, occurrence = 1) => {
  const formData = new FormData();
  formData.append('submissionId', submissionId);
  formData.append('content', content);
  if (excerpt) formData.append('excerpt', excerpt);
  formData.append('occurrence', String(occurrence));

  const res = await fetch('/api/model/submission-comment', { method: 'POST', body: formData });
  if (res.ok) {
    const json = await res.json();
    if (json?.comment) setComments((prev) => [...prev, json.comment]);
  }
};

const deleteComment = async (commentId: string) => {
  const res = await fetch(`/api/model/submission-comment/${commentId}`, { method: 'DELETE' });
  if (res.ok) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }
};
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/teacher-grading/grading-comments-sidebar.tsx \
        services/web-app/app/routes/app_.documents_.\$id/_components/grading-comments-sidebar.tsx
git commit -m "refactor: grading-comments-sidebar uses plain fetch + local state, moved to teacher-grading/"
```

---

### Task 4: Update or rename `grade-comment-card.tsx`

The shared component. Either rename to `submission-comment-card.tsx` or just update its types in place.

**Files:**
- Modify or rename: `services/web-app/app/components/grade-comment-card.tsx`

- [ ] **Step 1: Rename if desired**

```bash
git mv services/web-app/app/components/grade-comment-card.tsx \
       services/web-app/app/components/submission-comment-card.tsx
```

- [ ] **Step 2: Update prop types**

Change `comment: GradeComment` to `comment: SubmissionComment`. Most field accesses (id, content, excerpt, occurrence, profile.user.name) should work unchanged.

- [ ] **Step 3: Update consumers**

```bash
cd services/web-app
```
Use Grep tool with pattern `grade-comment-card|GradeCommentCard` and update each import + usage.

- [ ] **Step 4: Rename the export inside the file**

```ts
export function SubmissionCommentCard(...) { ... }
```

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/components/ \
        services/web-app/app/routes/app_.documents_.\$id/teacher-grading/
git commit -m "refactor: rename grade-comment-card → submission-comment-card"
```

---

### Task 5: Create `app.submissions.$submissionId/route.tsx`

The new graded view. Mirrors the structure of `app_.graded_.$gradeId` but reads `Submission` directly by id.

**Files:**
- Create: `services/web-app/app/routes/app.submissions.$submissionId/route.tsx`

- [ ] **Step 1: Read the existing graded view to understand the layout**

Use Read tool on `services/web-app/app/routes/app_.graded_.$gradeId/route.tsx` to capture the existing structure (header, content area, sidebar, etc.).

- [ ] **Step 2: Create the new route**

```tsx
// services/web-app/app/routes/app.submissions.$submissionId/route.tsx
import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
// ... other existing imports from the old graded view ...

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      // Authorization: student can see their own released submissions; teacher can see any in their classes
      OR: [
        {
          document: { profile: { id: profile.id } },
          releasedAt: { not: null },
        },
        {
          document: {
            class: { teachers: { some: { profileId: profile.id } } },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      text: true,
      html: true,
      submittedAt: true,
      score: true,
      feedback: true,
      rubricScores: true,
      overallScore: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      grammarIssues: true,
      releasedAt: true,
      gradedAt: true,
      document: {
        select: {
          id: true,
          title: true,
          profile: { select: { user: { select: { name: true } } } },
        },
      },
      comments: {
        include: { profile: { select: { user: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!submission) {
    throw new Response('Not found', { status: 404 });
  }

  return { submission };
}

export default function Route() {
  const { submission } = useLoaderData<typeof loader>();

  return (
    <main className="...">
      {/* Layout that closely mirrors the existing graded view */}
      {/* Show title, score, feedback, overall comment, rubric, grammar issues, comments */}
    </main>
  );
}
```

The full JSX should be a near-copy of the existing graded view but reading from `submission` instead of `grade`. Most field names match (score, feedback, overallScore, etc.).

- [ ] **Step 3: Run typecheck**

```bash
cd services/web-app && bun run typecheck
```

- [ ] **Step 4: Smoke test**

Run dev server, manually visit `/app/submissions/<id>` for a known submission id, verify it renders.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.submissions.\$submissionId/
git commit -m "feat: new graded view at /app/submissions/:submissionId"
```

---

### Task 6: Reduce `app_.graded_.$gradeId/route.tsx` to a redirect-only loader

The old graded view becomes a tiny redirect using the `LegacyGradeRedirect` table from Phase 2.

**Files:**
- Modify: `services/web-app/app/routes/app_.graded_.$gradeId/route.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// services/web-app/app/routes/app_.graded_.$gradeId/route.tsx
import { invariant } from '@epic-web/invariant';
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';

export async function loader({ params }: LoaderFunctionArgs) {
  invariant(params.gradeId, 'No grade id');

  const lookup = await prisma.legacyGradeRedirect.findUnique({
    where: { gradeId: params.gradeId },
  });

  if (!lookup) {
    throw new Response('Not found', { status: 404 });
  }

  return redirect(`/app/submissions/${lookup.submissionId}`, { status: 301 });
}

// No default export — this route only redirects via the loader
```

- [ ] **Step 2: Verify there's no leftover code**

The file should be ~20 lines now. Delete any imports that are no longer needed.

- [ ] **Step 3: Run typecheck**

```bash
cd services/web-app && bun run typecheck
```

- [ ] **Step 4: Smoke test**

Visit `/app/graded/<known-grade-id>` in the dev server. Verify it 301-redirects to `/app/submissions/<submission-id>`.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.graded_.\$gradeId/route.tsx
git commit -m "refactor: /app/graded/:gradeId → 301 redirect to /app/submissions/:submissionId"
```

---

### Task 7: Update student dashboard "Released" badge

The student dashboard shows a badge when a submission is released. Update it to read from `Submission.releasedAt`.

**Files:**
- Modify: wherever the student dashboard exists (probably `app/routes/app/route.tsx` or `app/routes/app.courses/route.tsx`)

- [ ] **Step 1: Find the student dashboard file**

```bash
cd services/web-app
```
Use Grep tool with pattern `releasedAt|released grade|grades released` in `app/routes/app/` or `app/routes/app.courses/`.

- [ ] **Step 2: Update the query**

Change from `prisma.grade.findMany({ where: { releasedAt: { not: null } } })` to `prisma.submission.findMany({ where: { releasedAt: { not: null }, document: { profile: { id: studentProfileId } } } })`.

- [ ] **Step 3: Update the link target**

Change from `/app/graded/${grade.id}` to `/app/submissions/${submission.id}`.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: student dashboard reads released submissions from Submission model"
```

---

### Task 8: Cherry-pick the autosave E2E test from PR #77

PR #77's branch has `e2e/tests/teacher.grading-autosave.spec.ts` which tests the auto-save behavior. Cherry-pick it.

**Files:**
- Cherry-pick: `services/web-app/e2e/tests/teacher.grading-autosave.spec.ts`

- [ ] **Step 1: Cherry-pick the file**

```bash
cd ~/brocksoftware/yawp-2.0
git checkout feat/submission-model-consolidation -- services/web-app/e2e/tests/teacher.grading-autosave.spec.ts
```

- [ ] **Step 2: Update the test to match Phase 3 selectors**

Open the file and update any selectors that depend on the previous grading panel structure. The test logic (type → blur → wait for save indicator) should mostly be preserved.

- [ ] **Step 3: Run the test**

```bash
cd services/web-app
bunx playwright test e2e/tests/teacher.grading-autosave.spec.ts
```
Expected: PASS. Iterate on selectors as needed.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/teacher.grading-autosave.spec.ts
git commit -m "test: add teacher grading autosave E2E (from PR #77)"
```

---

### Task 9: Update existing `teacher.grading-flow.spec.ts`

The existing test references the old grading panel structure (save button, fetcher patterns). Update it to work with the new auto-save UX.

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.grading-flow.spec.ts`

- [ ] **Step 1: Read the test**

Use Read tool. Identify steps that:
- Click a "Save" button → remove (no more save button)
- Wait for a save spinner → wait for `.saved` indicator instead
- Reference the old `/app/graded/:gradeId` URL → check redirect or use `/app/submissions/:submissionId`

- [ ] **Step 2: Update each problematic step**

Replace the explicit save click with `await page.locator('textarea[name="overallComment"]').blur()` (or whatever blur trigger works in Playwright).

Replace URL assertions:
```ts
// Before
expect(page.url()).toContain('/app/graded/');
// After
expect(page.url()).toContain('/app/submissions/');
```

- [ ] **Step 3: Run the test**

```bash
bunx playwright test e2e/tests/teacher.grading-flow.spec.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/teacher.grading-flow.spec.ts
git commit -m "test: update grading flow E2E for auto-save UX"
```

---

### Task 10: Run full test suite and smoke check

- [ ] **Step 1: Run all unit tests**

```bash
cd services/web-app
bun test
```
Expected: PASS.

- [ ] **Step 2: Run all E2E tests**

```bash
bunx playwright test
```
Expected: PASS.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```
Expected: zero errors.

- [ ] **Step 4: Manual end-to-end smoke (local dev)**

```bash
bun run dev
```

Verify:
- Log in as student → write essay → submit → second submission allowed
- Log in as teacher → see Submitted tab → click student → grading panel shows
- Edit Score field → blur → "Saving" → "Saved" indicator → refresh → value persists
- Edit Feedback textarea → blur → save indicator → refresh → persists
- Click AI grading → AI fills fields → each field auto-saves
- Add a submission comment from sidebar → appears immediately
- Delete a submission comment → disappears
- Release grades for the class → student sees them in their dashboard
- Visit old `/app/graded/<known-grade-id>` URL → 301 to new URL → renders
- Verify routing tests for student-facing released-submissions URL pass

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: post-Phase-3 smoke fixes"
```

---

## Verification Checklist for Phase 3

After all tasks complete, manually verify:

- [ ] `useUpdateSubmission` hook tested and exported
- [ ] `teacher-grading-panel.tsx` moved to `teacher-grading/` folder
- [ ] `teacher-grading-panel.tsx` uses auto-save on blur (no save button)
- [ ] `grading-comments-sidebar.tsx` moved and refactored
- [ ] `grade-comment-card.tsx` renamed to `submission-comment-card.tsx`
- [ ] `/app/submissions/:submissionId` route exists and renders submissions
- [ ] `/app/graded/:gradeId` is a 301 redirect to the new URL
- [ ] Student dashboard "Released" badge links to `/app/submissions/:submissionId`
- [ ] No file in `teacher-grading/` over 400 lines
- [ ] Old files in `_components/` deleted
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Manual smoke: every grading field saves on blur
- [ ] Manual smoke: AI grading writes via update-submission
- [ ] Manual smoke: comments add/delete via submission-comment endpoints
- [ ] Manual smoke: old graded URLs redirect

When all items are checked, Phase 3 is complete.

---

## Final Integration Steps (after all 3 phases done)

These steps happen ONCE the entire branch is ready, before opening the PR.

- [ ] **Run full E2E suite end-to-end (no smoke filter)**

```bash
cd services/web-app
bunx playwright test
```

- [ ] **Run the migration dry-run one more time against the local DB**

```bash
cd packages/prisma
bunx tsx scripts/document-hardening-dry-run.ts
```

- [ ] **Verify the line-count goals**

```bash
cd services/web-app
wc -l app/routes/app_.documents_.\$id/route.tsx \
      app/routes/app_.documents_.\$id/document-editor/editor.tsx \
      app/routes/app_.documents_.\$id/teacher-grading/teacher-grading-panel.tsx
```
Targets:
- `route.tsx`: ≤ 350 lines (was 1507)
- `editor.tsx`: ≤ 300 lines (was 873)
- `teacher-grading-panel.tsx`: ≤ 500 lines

- [ ] **Verify the deletion list (from spec)**

```bash
ls services/web-app/app/utils/pending-document-save.ts 2>&1
ls services/web-app/app/routes/app_.documents_.\$id/editor/index.tsx 2>&1
ls services/web-app/app/routes/app_.documents_.\$id/editor/editor-content-context.tsx 2>&1
ls services/web-app/app/routes/app_.documents_.\$id/_components/document-versions.tsx 2>&1
ls services/web-app/app/routes/api.domain.grade-essay/ 2>&1
ls services/web-app/app/routes/api.domain.update-grade/ 2>&1
ls services/web-app/app/routes/api.model.grade-comment/ 2>&1
```
Expected: every command says "No such file or directory".

- [ ] **Push the branch and open the PR**

```bash
cd ~/brocksoftware/yawp-2.0
git push -u origin document-hardening
gh pr create --title "feat: document hardening — editor + submission consolidation" --body "$(cat <<'EOF'
## Summary

Three-phase refactor in a single branch. Replaces PR #91 entirely.

- **Phase 1: Editor flow consolidation** — route.tsx 1507→~250 lines, editor/index.tsx 873→~250 lines, runtime PM-write tripwire, IDB-only persistence, kill ?spa=1, 5min idle-resetting hash-deduped revisions, delete DocumentVersion model
- **Phase 2: Submission consolidation** — big-bang migration drops DocumentSnapshot/Grade/GradeComment/GradeCommentResponse and consolidates into Submission/SubmissionComment, multi-submit enabled, auto-save grading endpoint
- **Phase 3: Grading panel cleanup** — auto-save on blur (no save button), file moves to teacher-grading/, /app/graded/:gradeId → /app/submissions/:submissionId

Net: ~1500-1700 lines smaller. Single source of truth per concern.

## Deploy plan

Requires a 2-hour maintenance window for the schema migration in Phase 2. See `docs/superpowers/specs/2026-04-08-document-hardening-design.md` for the full deploy plan.

## Test plan
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Dry-run script validated against staging DB
- [ ] Migration tested in staging
- [ ] Manual smoke: editor data preservation across all interactions
- [ ] Manual smoke: submission lifecycle end-to-end
- [ ] Manual smoke: grading auto-save
- [ ] Old /app/graded URLs redirect

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Close PR #91 with a comment pointing to the new PR**

```bash
gh pr comment 91 --body "Superseded by the document-hardening branch (which incorporates and extends this work). Closing in favor of that PR."
gh pr close 91
```
