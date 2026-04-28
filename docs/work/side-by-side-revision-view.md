# Side-by-Side Revision View

**Branch:** `claude/plan-feedback-resubmission-FbxDo`  
**PR:** #102  
**Feature flag:** `side_by_side_revision_enabled`

## What this does

Adds a new revision route (`/app/submissions/:submissionId/revise`) that shows a student's graded feedback on the left and their live editable document on the right, so they can read feedback and revise simultaneously.

Previously, "Revise Essay" just opened the document editor with no feedback visible.

### Layout

```
┌─────────────────────────────────┬──────────────────────────────────┐
│ ← Back to feedback   Title  77% │         Submit Revised Version → │
├──────────┬──────────────────────┼──────────────────────────────────┤
│  Grade   │  Original essay      │  Your Revision                   │
│  Summary │  (with inline        │  (live editable editor)          │
│          │   highlights)        │                                  │
│  Grade   │                      │                                  │
│  Comments│                      │                                  │
└──────────┴──────────────────────┴──────────────────────────────────┘
```

## Files changed

- `app/routes/app_.submissions_.$submissionId_.revise/route.tsx` — new route
- `app/routes/app_.submissions_.$submissionId/route.tsx` — "Revise Essay" now points to new route when flag is on
- `app/utils/feature-flags.server.ts` — added `SIDE_BY_SIDE_REVISION` flag + `isSideBySideRevisionEnabled()`
- `e2e/seed-e2e.ts` — seeds the feature flag so e2e tests use the new flow
- `e2e/tests/student.revision-view.spec.ts` — new e2e tests for the revision view

## Enabling in an environment

The feature flag is DB-driven. To enable:

```sql
INSERT INTO "Setting" (name, value, "valueType")
VALUES ('side_by_side_revision_enabled', 'true', 'boolean');
```

To disable and fall back to the old flow:

```sql
UPDATE "Setting" SET value = 'false' WHERE name = 'side_by_side_revision_enabled';
```

## What we pulled in from the original document editor

These features from the original `app_.documents_.$id` editor were intentionally included in the revision view:

- **Formatting toolbar** — bold, italic, strikethrough, headings, alignment, lists, blockquote, horizontal rule, text color, line spacing, clear marks
- **Autosave** — debounced saves to IndexedDB + server sync with revision timer (every 5 min of idle editing)
- **Auth heartbeat** — background session validation that locks the editor if the session expires
- **Submit button** — with submitting state, disabled-when-empty guard, and confirmation dialog
- **Editable document title** — input in the nav bar that saves on blur via fetcher POST
- **Version history** — the clock/saved-status button that opens the full version history sheet
- **Session expired dialog** — non-dismissible modal that appears when the auth heartbeat detects an expired session, with a "Log In" button that preserves the current URL as a redirect target

## What we left out (and why)

These features from the original editor were deliberately excluded from this view:

- **Tutor sidebar** — the AI tutor/course module flow belongs to the original learning sequence, not the revision context. Adding it here would require a course module session, which may not exist for a revision.
- **Student inline comments panel** — the right-side panel where students and teachers exchange threaded comments on the draft. Left out because the left panel already surfaces all teacher feedback; adding another comments layer would clutter the UI.
- **Assignment prompt banner** — the amber box showing the assignment title and prompt. Omitted for now; could be useful context but adds vertical space and the submission title serves as a proxy.
- **Previous submissions popover** — the button showing all past submission versions with grade/date. Left out to keep the nav uncluttered; the grade badge already surfaces the most recent result.
- **Archive dialog** — allows students to view/restore archived submissions. Not relevant in the revision flow.
- **Mobile tab navigation** — the side-by-side layout is inherently a desktop UI, so the mobile tab switcher (Tutor / Editor / Comments) doesn't apply.

## Open questions

1. **Rubric score ordering** — rubric items appear in DB insertion order rather than a meaningful order (e.g. by score, or by a fixed canonical order). Low priority for prototype but should be addressed before wider rollout.

3. **Feature flag not set in production/preview** — the flag only exists in the e2e seed. It needs to be inserted manually in any environment where you want to test the new flow with real data (see SQL above).

4. **E2e tests not yet run against the live server** — `e2e/tests/student.revision-view.spec.ts` was written but hasn't been executed in CI or locally. Should be verified before merging.

5. **Submit flow destination** — after submitting a revised essay, the student is navigated to `/app/submissions/:newSubmissionId`. This path should be verified to render a sensible "submission received" or feedback view rather than an error.

6. **Old flow removal timing** — per AGENTS.md, the old `?revise=1` flow must stay active until the new flow has been tested in production for a couple of weeks. The feature flag handles this, but there should be a follow-up ticket to clean up the old path once confidence is established.
