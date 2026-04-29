# Remove Grade AI Highlights from Document

**Date:** 2026-04-29  
**Status:** Implemented — open questions remaining

## Background

When a teacher grades a submission, the AI generates grammar issue highlights that appear as colored spans directly in the essay text. Teachers could only manage these highlights (hide or remove) from the **grading side panel** (`teacher-grading-panel.tsx`). There was no way to interact with a highlight from within the document itself.

The goal of this change is to let teachers act on a highlight directly where they see it — in the essay.

## What Exists Today

- Grammar issue highlights render as `<span data-grammar-issue-id="...">` elements via `GradeHighlightsOverlay` (`grade-highlights-overlay.tsx`)
- The hover tooltip already displayed the grammar issue message and rule
- Two actions already exist in the side panel:
  - **Hide** — removes the span from the document view but keeps the issue in state (`hiddenGrammarIssueIds` in `route.tsx:350`)
  - **Remove** — permanently deletes the issue from `grammarIssues` state (`route.tsx:529`)
- A floating toolbar pattern already exists for text selection (`selection-toolbar.tsx`) and was the closest UX precedent

## Decisions Made

- **Floating tooltip on hover** (not click-to-remove or right-click context menu)
- **Hide only** (not remove) — non-destructive, reversible via the side panel's Show button
- **Tooltip shows the grammar message and rule** as context alongside the action buttons
- **Hide** button hides the current issue; **Hide all** button appears when more than one grammar issue is visible and hides all of them at once
- Actions are **teacher-only** (`isTeacher` guard wraps both buttons)
- Scope is **grammar issues only** for now (yellow grade comment marks are out of scope)

## What Was Built

Added "Hide" and "Hide all" buttons to the existing grammar issue hover tooltip in `route.tsx` (lines 887–916):

- **Hide** — calls `toggleGrammarIssueVisibility(currentIssue.id)` then dismisses the tooltip
- **Hide all** — iterates `visibleGrammarIssues` and calls `toggleGrammarIssueVisibility` for each, then dismisses the tooltip
- "Hide all" only renders when `visibleGrammarIssues.length > 1`
- Both buttons use purple-tinted styling consistent with the grammar mark color

## Open Questions

### 1. Should "Hide all" be scoped to the hovered position or the whole document?

Currently "Hide all" hides every visible grammar issue in the document, not just the ones stacked at the current cursor position. That feels right for a quick "dismiss everything" action, but worth confirming with teachers.

### 2. Should hidden state persist across page reloads?

`hiddenGrammarIssueIds` is in-memory React state — refreshing brings all issues back. If teachers expect their hidden state to survive a reload, a persistence layer is needed (e.g. storing hidden IDs on the `Submission` record).

### 3. Should grade comment highlights (yellow) get the same treatment?

Clicking a yellow grade comment mark currently just focuses the sidebar card. The infrastructure is the same, so adding a tooltip with actions would be straightforward — but it's out of scope for this change.
