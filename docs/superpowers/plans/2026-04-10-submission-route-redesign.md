# Submission Route Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/app/submissions/:submissionId` the full grading + viewing experience. Remove all grading logic from the document route.

**Architecture:** The submissions route gets two modes (view/grade) determined by submission state. The teacher-grading components (panel, comments sidebar, selection toolbar, grammar highlights) move from the document route to the submissions route. The essay is rendered as static HTML with the same editor CSS. The document route sheds ~200 lines of grading state management.

**Tech Stack:** React Router v7, TypeScript, Prisma, Playwright

**Spec:** `docs/superpowers/specs/2026-04-10-submission-route-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/routes/app_.submissions_.$submissionId/route.tsx` | **Rewrite** | Full submission experience: loader + view/grade modes |
| `app/routes/app_.submissions_.$submissionId/essay-panel.tsx` | **Create** | Static HTML essay + selection toolbar + grammar highlights |
| `app/routes/app_.documents_.$id/teacher-grading/` | **Move** | Entire folder moves to submissions route |
| `app/routes/app_.submissions_.$submissionId/teacher-grading/` | **Destination** | Grading panel, comments sidebar, selection toolbar, highlights, auto-save hook |
| `app/routes/app_.documents_.$id/route.tsx` | **Simplify** | Remove all grading imports, state, conditional rendering |
| `e2e/tests/teacher.grading-flow.spec.ts` | **Update** | Navigate to submissions route instead of document route |

---

### Task 1: Move teacher-grading/ folder to submissions route

**Files:**
- Move: `app/routes/app_.documents_.$id/teacher-grading/` → `app/routes/app_.submissions_.$submissionId/teacher-grading/`
- Modify: `app/routes/app_.documents_.$id/route.tsx` (remove imports that will break)

- [ ] **Step 1: Move the entire teacher-grading directory**

```bash
mv services/web-app/app/routes/app_.documents_.\$id/teacher-grading \
   services/web-app/app/routes/app_.submissions_.\$submissionId/teacher-grading
```

- [ ] **Step 2: Commit the move**

```bash
git add -A
git commit -m "refactor: move teacher-grading/ folder from document route to submissions route"
```

---

### Task 2: Create the essay panel component

**Files:**
- Create: `app/routes/app_.submissions_.$submissionId/essay-panel.tsx`

This renders the submission HTML as static content with the same styling as the document editor, and provides a ref for the selection toolbar and grammar highlights to attach to.

- [ ] **Step 1: Create essay-panel.tsx**

```tsx
import { useRef } from 'react';

type Props = {
  html: string;
  essayRef?: React.Ref<HTMLDivElement>;
};

/**
 * Renders submission HTML as static formatted content.
 * Uses the same CSS classes as the document editor for visual consistency.
 * The essayRef is used by SelectionToolbar and GradeHighlightsOverlay.
 */
export function EssayPanel({ html, essayRef }: Props) {
  return (
    <div className="no-scrollbar grow overflow-y-scroll p-5">
      <div className="mx-auto w-full max-w-[920px] font-times">
        <div
          ref={essayRef}
          className="prose prose-sm max-w-none pb-5 [&>*]:outline-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/routes/app_.submissions_.\$submissionId/essay-panel.tsx
git commit -m "feat: add EssayPanel component for static submission HTML rendering"
```

---

### Task 3: Rewrite the submissions route with view/grade modes

**Files:**
- Rewrite: `app/routes/app_.submissions_.$submissionId/route.tsx`

This is the main task. The route needs:
1. A loader that fetches the submission + determines the user's role and the current mode
2. A component with two modes:
   - **View mode**: essay (left) + grade summary + comments (right)
   - **Grade mode**: essay with overlays (left) + grading panel or comments sidebar (right, toggleable)
3. All the grading state management currently in the document route (grammar issues, active comment, draft highlight, tooltip position)

- [ ] **Step 1: Read the current submissions route and the document route's grading logic**

Read `app/routes/app_.submissions_.$submissionId/route.tsx` fully and note the loader structure.

Read `app/routes/app_.documents_.$id/route.tsx` lines 400-550 (the grading state management block) and lines 830-900 (the grading component rendering block).

- [ ] **Step 2: Rewrite the submissions route**

The loader should:
- Fetch submission with all fields needed for grading (including `grammarIssues`, `promptConfig`, `aiMeta`, `gradedById`)
- Determine `isOwner` (student) vs `isTeacher` 
- Determine mode: `isGradeMode` = teacher AND (`gradedAt IS NULL` OR URL has `?edit=1`)
- Students can only see released submissions (redirect if not released)
- Return `{ submission, isOwner, isTeacher, isGradeMode }`

The component should:
- Use `EssayPanel` for the left side (always)
- In grade mode: mount `SelectionToolbar` and `GradeHighlightsOverlay` on the essay ref
- In grade mode: right panel toggles between `TeacherGradingPanel` and `GradingCommentsSidebar`
- In view mode: right panel shows read-only grade summary + comments list
- All grammar issue state management moves here from the document route
- "Edit Grade" button in view mode links to `?edit=1`

The layout structure:
```
<main className="flex h-screen flex-col">
  <nav> Back button + title + status badge </nav>
  <div className="flex grow overflow-hidden">
    <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
      <EssayPanel html={submission.html} essayRef={essayRef} />
    </div>
    <div className="w-full max-w-md overflow-y-auto border-l">
      {isGradeMode ? <GradingPanel ... /> : <ViewPanel ... />}
    </div>
  </div>
</main>
```

- [ ] **Step 3: Fix imports in the moved teacher-grading components**

After the move, imports like `from '../../_components/...'` or relative paths may be broken. Fix any import paths in:
- `teacher-grading-panel.tsx`
- `grading-comments-sidebar.tsx`
- `selection-toolbar.tsx`
- `grade-highlights-overlay.tsx`
- `use-update-submission.ts`

- [ ] **Step 4: Verify typecheck passes**

```bash
cd services/web-app && bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rewrite submissions route with view/grade modes, mount grading components"
```

---

### Task 4: Adapt SelectionToolbar for static HTML (non-ProseMirror)

**Files:**
- Modify: `app/routes/app_.submissions_.$submissionId/teacher-grading/selection-toolbar.tsx`

The selection toolbar currently expects `editorRoot: HTMLElement` which is a ProseMirror editor DOM. It needs to work with a plain `<div>` containing rendered HTML. The core logic (listen to `selectionchange`, position a toolbar above the selection, fire `grading-comment-request` event) should work identically — the only difference is the root element type.

- [ ] **Step 1: Read the current selection-toolbar.tsx and the GradingSelectionToolbar it references**

Check `app/routes/app_.documents_.$id/_components/grading-selection-utils.ts` or similar for the `GradingSelectionToolbar` component.

- [ ] **Step 2: Update to accept any HTMLElement ref, not just PM editor root**

The prop is already `editorRoot: HTMLElement | null` — rename to `contentRoot` for clarity. Verify the `selectionchange` listener and `window.getSelection()` logic work against a plain div (it should — selection APIs are DOM-native, not PM-specific).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: adapt SelectionToolbar for static HTML content root"
```

---

### Task 5: Adapt GradeHighlightsOverlay for static HTML

**Files:**
- Modify: `app/routes/app_.submissions_.$submissionId/teacher-grading/grade-highlights-overlay.tsx`

Same adaptation — rename `editorRoot` to `contentRoot`. The overlay wraps text ranges in `<span>` elements using DOM Range APIs, which work on any DOM subtree.

- [ ] **Step 1: Read the current grade-highlights-overlay.tsx**

- [ ] **Step 2: Rename prop and verify DOM logic doesn't assume ProseMirror**

Check for any PM-specific APIs (`view.state`, `view.dispatch`, etc.). The overlay should only use standard DOM APIs (`document.createRange`, `TreeWalker`, etc.).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: adapt GradeHighlightsOverlay for static HTML content root"
```

---

### Task 6: Strip grading logic from the document route

**Files:**
- Modify: `app/routes/app_.documents_.$id/route.tsx`

Remove everything related to teacher grading. This is a pure deletion task — no new code.

- [ ] **Step 1: Remove imports**

Delete these imports:
- `TeacherGradingPanel` from `./teacher-grading/teacher-grading-panel`
- `GradingCommentsSidebar` from `./teacher-grading/grading-comments-sidebar`
- `parseGrammarIssuesPayload` from `~/domain/grading/grammarIssues`
- `formatGrade` from `~/domain/grading/gradeMath`
- Any other grading-specific imports that are no longer used

- [ ] **Step 2: Remove grading state and derived values**

Delete these state declarations and derived computations:
- `canUseGradingPanel`
- `isTeacherGradingTabOpen`
- `activeGradeCommentId` + `setActiveGradeCommentId`
- `draftHighlight` + `setDraftHighlight`
- `tooltipIssueId` + `setTooltipIssueId`
- `tooltipRect` + `setTooltipRect`
- `persistedGrammarIssues` + `lastPersistedRef`
- `grammarIssues` + `setGrammarIssues`
- `hiddenGrammarIssueIds` + `setHiddenGrammarIssueIds`
- `tooltipPos`
- `visibleGrammarIssues`
- `toggleGrammarIssueVisibility`
- `handleGrammarIssuesChange`
- `handleRemoveGrammarIssue`
- `activeGrammarIssue`
- The outside-click `useEffect` for grade comments

- [ ] **Step 3: Simplify conditionals**

- `isDocumentEditable` becomes just `!isViewingAsTeacher` (no more grading tab check)
- Remove the `leftPanel === 'grading'` toggle button and panel switching
- Remove the conditional rendering of `TeacherGradingPanel` and `GradingCommentsSidebar`
- The left panel always shows tutor; the right panel always shows document comments

- [ ] **Step 4: For teachers viewing submitted docs, redirect to submissions route**

When a teacher opens a submitted document, redirect them to the submission:
```ts
if (isViewingAsTeacher && latestSubmission) {
  return redirect(`/app/submissions/${latestSubmission.id}`);
}
```

This replaces the entire "teacher grading tab" concept with a clean redirect.

- [ ] **Step 5: Verify typecheck and tests pass**

```bash
bun run typecheck && bun run test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove all grading logic from document route — teachers redirect to submissions"
```

---

### Task 7: Update navigation links across the app

**Files:**
- Modify: Various files that link to the document route for grading

- [ ] **Step 1: Find all grading navigation paths**

Search for links that navigate teachers to documents with grading params (`?left=grading`, `?snapshotId=`, etc.):

```bash
grep -rn "left=grading\|snapshotId\|/app/documents.*teacher\|/app/documents.*grade" services/web-app/app/ | grep -v node_modules
```

- [ ] **Step 2: Update links to point to submissions route**

Teacher class page links, dashboard links, etc. should navigate to `/app/submissions/:submissionId` instead of `/app/documents/:docId?left=grading&snapshotId=...`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix: update teacher navigation links to use submissions route"
```

---

### Task 8: Update e2e tests

**Files:**
- Modify: `e2e/tests/teacher.grading-flow.spec.ts`
- Modify: `e2e/tests/teacher.document-submission-flow.spec.ts`

- [ ] **Step 1: Update teacher grading flow test**

The test currently navigates to the document route with `?left=grading`. Update to navigate to `/app/submissions/:submissionId` directly. The grading interactions (rubric, AI, comments) stay the same — just the URL changes.

- [ ] **Step 2: Update teacher submission flow test**

If it references grading on the document route, update to use the submissions route.

- [ ] **Step 3: Run e2e smoke suite**

```bash
bun run test:e2e:smoke
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: update e2e tests for submission route grading"
```

---

### Task 9: Typecheck + test pass + manual verification

- [ ] **Step 1: Full typecheck**

```bash
bun run typecheck
```

- [ ] **Step 2: Unit tests**

```bash
bun run test
```

- [ ] **Step 3: Fix any remaining issues and commit**
