# Submission Route Redesign — Design Spec

**Date:** 2026-04-10
**Branch:** `document-hardening`
**Goal:** Make `/app/submissions/:submissionId` the single home for viewing and grading submissions. Remove all grading logic from the document route.

---

## Domain Model

- **Document** — the sandbox/playground. Both teacher and student can edit. Has a tutor, comments, revision history. Lives at `/app/documents/:id`.
- **Submission** — an immutable snapshot of what the student turned in. Has view mode and grade mode. Has submission comments (excerpt-anchored feedback from the teacher), rubric scores, AI grammar analysis. Lives at `/app/submissions/:submissionId`.

These are entirely separate lifecycles. The document route should have zero grading logic.

---

## Route Modes

`/app/submissions/:submissionId` has two modes determined by submission state:

**View mode** — default when `gradedAt IS NOT NULL` or `releasedAt IS NOT NULL`:
- Read-only essay (left panel)
- Grade summary banner (score, letter grade, percentage)
- Rubric scores displayed (read-only)
- Submission comments displayed inline (highlighted on essay) and in a sidebar
- Grammar issues highlighted on essay (read-only)
- Students see this after grade release
- Teachers see this for already-graded submissions, with an "Edit Grade" button to re-enter grade mode

**Grade mode** — when `gradedAt IS NULL`, or teacher clicks "Edit Grade":
- Read-only essay (left panel) with:
  - Selection toolbar overlay (highlight text → "Comment" button)
  - Grammar issue highlights (from AI analysis)
- Right panel toggles between:
  - Grading panel (rubric scores, overall comment, AI suggestions, auto-save on blur)
  - Comments sidebar (submission comments list, create/edit/delete)

---

## Layout

```
┌─────────────────────────────┬────────────────────────┐
│                             │  Grading Panel         │
│  Essay (static HTML)        │    OR                  │
│  + selection toolbar        │  Comments Sidebar      │
│  + grammar highlights       │                        │
│  styled with font-times +   │  (tab toggle)          │
│  editor CSS classes         │                        │
└─────────────────────────────┴────────────────────────┘
```

---

## Essay Rendering

The submission HTML is rendered as static HTML (`dangerouslySetInnerHTML`) with the same CSS classes used in the document editor (`font-times`, `mx-auto`, `max-w-[920px]`). This preserves all formatting (headings, lists, bold, etc.) without a ProseMirror instance.

The selection toolbar and grammar highlights overlay attach to this static HTML DOM element (not a PM editor view). The existing components need adaptation:
- `SelectionToolbar` currently expects `editorRoot: HTMLElement` — the static essay `div` ref serves the same purpose
- `GradeHighlightsOverlay` currently expects `editorRoot: HTMLElement` — same adaptation

---

## Component Migration

**Move FROM `app_.documents_.$id/` TO `app_.submissions_.$submissionId/`:**
- `teacher-grading/teacher-grading-panel.tsx` — the rubric/AI grading panel
- `teacher-grading/grading-comments-sidebar.tsx` — submission comments list
- `teacher-grading/selection-toolbar.tsx` — text selection → comment creation
- `teacher-grading/grade-highlights-overlay.tsx` — visual highlights on essay
- `teacher-grading/use-update-submission.ts` — auto-save hook

These become the core of the submissions route. The `teacher-grading/` folder moves entirely.

**Remove FROM `app_.documents_.$id/route.tsx`:**
- `TeacherGradingPanel` import + conditional rendering
- `GradingCommentsSidebar` import + conditional rendering
- `isTeacherGradingTabOpen` / `canUseGradingPanel` / `leftPanel === 'grading'` logic
- All grammar issue state management (`grammarIssues`, `hiddenGrammarIssueIds`, `tooltipIssueId`, etc.)
- The `draftHighlight` state
- The outside-click handler for grade comments

---

## Permissions

- **Student (document owner):** View mode only. Can see released submissions. Cannot grade.
- **Teacher (of student's class):** View mode for released submissions. Grade mode for ungraded submissions. Can re-enter grade mode via "Edit Grade" on graded submissions.
- **Admin:** Same as teacher.

---

## Navigation

- Student clicks "View Grade" on dashboard → `/app/submissions/:submissionId` (view mode)
- Teacher clicks submitted document on class page → `/app/submissions/:submissionId` (grade mode if ungraded, view mode if graded)
- Old `/app/graded/:gradeId` → redirects via `LegacyGradeRedirect` → `/app/submissions/:submissionId`

---

## What This Does NOT Cover

- Real-time collaboration / conflict detection (deferred to backlog)
- Multi-submission history (viewing previous submissions for the same document)
- Assignment integration
