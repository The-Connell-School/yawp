# Remove Grade AI Highlights from Document

**Date:** 2026-04-29  
**Status:** Planning / Open Questions

## Background

When a teacher grades a submission, the AI generates grammar issue highlights that appear as colored spans directly in the essay text. Currently, teachers can only manage these highlights (hide or remove) from the **grading side panel** (`teacher-grading-panel.tsx`). There is no way to interact with a highlight from within the document itself.

The goal of this change is to let teachers act on a highlight directly where they see it — in the essay.

## What Exists Today

- Grammar issue highlights render as `<span data-grammar-issue-id="...">` elements via `GradeHighlightsOverlay` (`grade-highlights-overlay.tsx`)
- Click handling on those spans already exists in the overlay but only triggers focus/hover callbacks — it does not surface any action UI
- Two actions already exist in the side panel:
  - **Hide** — removes the span from the document view but keeps the issue in state (`hiddenGrammarIssueIds` in `route.tsx:350`)
  - **Remove** — permanently deletes the issue from `grammarIssues` state and persists the deletion (`route.tsx:529`)
- A floating toolbar pattern already exists for text selection (`selection-toolbar.tsx`) and is the closest UX precedent

## Agreed Direction

**Floating tooltip on click.** When a teacher clicks a grammar issue highlight in the essay, a small popover appears near the span with action button(s). On action, the highlight is dismissed from the document.

This is preferred over:
- **Click-to-remove directly** — too easy to misfire, no confirmation
- **Right-click context menu** — feels heavy and inconsistent with the rest of the UI

## Implementation Sketch

- Attach a click handler in `GradeHighlightsOverlay` for `[data-grammar-issue-id]` spans (the delegation pattern is already in place)
- On click, calculate the span's bounding rect and render a positioned popover (similar to how `selection-toolbar.tsx` positions itself)
- Popover calls the existing `onRemoveGrammarIssue` and/or `onToggleGrammarIssue` callbacks already wired in `route.tsx`
- The popover should dismiss on outside click or Escape

## Open Questions

### 1. Hide vs. Remove — which actions appear in the popover?

This is the central open question. Options:

- **Remove only** — simpler, one button, lower cognitive load. Risk: teachers may accidentally delete issues they wanted to keep.
- **Hide only** — non-destructive, reversible. Risk: hidden issues accumulate silently and teachers may not realize the side panel still holds them.
- **Both Hide and Remove** — full control, but two buttons adds friction and requires teachers to understand the distinction.

A sub-question: is the **hide** concept even meaningful if the teacher is acting from the document? The act of dismissing something from view while it persists invisibly in the panel may be confusing in this context. Remove might be the cleaner semantic here.

### 2. Should hide/remove from the document stay in sync with the side panel?

If a teacher hides an issue via the side panel and then opens the document, should the highlight already be gone? (Yes, currently it is — `visibleGrammarIssues` filters hidden IDs.) But if they remove from the document tooltip, should the side panel card disappear immediately? This should be straightforward but needs to be confirmed as in-scope.

### 3. Scope: grammar issues only, or also grade comment highlights?

Grade comment highlights (yellow, `data-grade-comment-id`) also appear in the essay. Clicking them currently focuses the sidebar card. Should the same tooltip pattern eventually apply to those as well, or is this change grammar-issues-only?

### 4. Tooltip content beyond hide/remove?

Should the tooltip show the grammar issue's message/rule as a quick reference, or is it purely an action surface? Showing the message would reduce the need to scroll the side panel but adds complexity to the tooltip layout.
