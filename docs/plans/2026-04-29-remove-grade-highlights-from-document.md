# Remove Grade AI Highlights from Document

**Date:** 2026-04-29  
**Status:** Implemented — open questions remaining

## Background

When a teacher grades a submission, the AI generates grammar issue highlights that appear as colored spans directly in the essay text. Teachers could only manage these highlights from the **grading side panel** (`teacher-grading-panel.tsx`). There was no way to interact with a highlight from within the document itself.

## What Exists Today (Unchanged)

- Grammar issue highlights render as `<span data-grammar-issue-id="...">` elements
- The **Grammar/Syntax rubric section** in the side panel has a "Hide all / Show all" toggle — this is available to **both teachers and students** and is left untouched by this change
- **Hide** (side panel, per-issue) — removes the span from view, reversible
- **Remove** (side panel, per-issue, teacher grading mode only) — permanently deletes the issue from state

## Why These Actions Exist

**Remove** is for cases where:
- A teacher doesn't want a student to worry about a particular correction (e.g. a student far below grade level where any writing is a win)
- A teacher disagrees with an AI correction (e.g. Oxford comma disagreements)
- The AI flagged intentional syntax (e.g. a direct quote from a book)

**Hide** is for cases where:
- A teacher or student wants to temporarily mute highlights that are cluttering their view or workflow

## Decisions Made

- **Floating tooltip on hover** (not click-to-remove or right-click context menu)
- **Tooltip is teacher + grading mode only** (`isGradeMode` guard) — students see the message/rule but no action buttons
- **Tooltip shows**: "Remove comment" only — hiding a single comment in grading mode has no clear value since the student hasn't seen the doc yet, hidden state doesn't persist across reloads, and the "Hide all / Show all" in the rubric panel already covers the declutter use case
- The existing **"Hide all / Show all"** in the rubric panel is kept as-is for both teachers and students
- Scope is **grammar issues only** — yellow grade comment marks are out of scope

## What Was Built

Added a "Remove comment" button to the existing grammar issue hover tooltip in `route.tsx`:

- **Remove comment** — calls `handleRemoveGrammarIssue(id)`, permanently removes the issue from the submission
- Dismisses the tooltip after acting
- Only renders when `isGradeMode` (teacher in grading view, before grade is released)
- Students hovering a grammar mark see the message and rule only — no action buttons

## Open Questions

### 1. Should hidden state persist across page reloads?

`hiddenGrammarIssueIds` is in-memory React state — refreshing brings all hidden issues back. If teachers expect their hidden state to survive a reload, a persistence layer is needed (e.g. storing hidden IDs on the `Submission` record). Removed issues already persist (they're deleted from the JSON field).

### 2. Should grade comment highlights (yellow) get the same treatment?

Clicking a yellow grade comment mark currently just focuses the sidebar card. Adding tooltip actions there would follow the same pattern — out of scope for this change but straightforward to add later.
