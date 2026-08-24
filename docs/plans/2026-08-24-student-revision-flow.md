# Student Revision Flow — V1

## Overview

Once a teacher releases a grade, the student can revise the essay. V1 gives
them a split screen at `/app/revise/:submissionId`:

- **Left** — the graded submission exactly as released: frozen HTML with the
  teacher's inline comment marks and the grading assistant's marks, plus a
  collapsible feedback panel (grade and rubric, teacher comments, assistant
  notes).
- **Right** — the student's live document, carrying no marks, so the feedback
  on the left can be worked into the draft on the right.

No tutor. The revision tutor is V2.

## Decisions

- **The student edits the same `Document`.** Submissions are already snapshots
  of the document, so the left pane is frozen by construction and the right
  pane is the same live draft the student has always edited. Nothing new is
  written to the graded submission.
- **Submitting a revision reuses `/api/domain/submit-document`,** which already
  creates a new `Submission` per submit. The revision lands as the next
  version; the graded one stays where it is.
- **Owner-only.** A teacher opening the screen would be typing into a student's
  live document, so teachers are sent back to their grading view.
- **Released-only.** Before release there is nothing to revise against, so the
  student goes back to the submission page.
- **"No notes" on the right is presentational.** The draft pane carries
  `draft-comments-hidden`, which neutralizes inline comment marks visually
  without touching the stored HTML — comment anchors in the document survive a
  revision.

## Rollout

Behind `Organization.revisionFlowEnabled` (default `false`), toggled per
organization in admin → organization settings.

- Flag **off** (every existing organization): "Revise Essay" keeps pointing at
  `/app/documents/:id?revise=1`, and `/app/revise/:submissionId` redirects
  there. Today's behavior, unchanged.
- Flag **on**: "Revise Essay" points at the split screen.

The legacy path stays live and is the fallback for every case the new screen
does not cover (not released, withdrawn, not the owner), so the flag can be
turned off at any point without stranding a student.

## Seeing it in a preview environment

A seed-mode preview database is created once and preserved on every later
deploy, so an environment created before a seed change keeps showing the old
fixtures no matter how many times the branch redeploys. Add the
**`preview:reset-data`** label to the pull request and redeploy: the database
is recreated and `seed-local-dev` plus `seed-preview-seats` run against the
current branch. The label cannot touch the demo environment, which keeps its
own backup-and-confirmation reset.

## Files

- `packages/prisma/schema.prisma`, `migrations/20260824120000_add_revision_flow_flag`
  — the org flag.
- `app/domain/revisions/revision-flow.ts` — entry-path and access rules, pure
  and unit-tested; the loader and the "Revise Essay" button share them.
- `app/routes/app_.revise_.$submissionId/` — the route and the collapsible
  feedback panel. The graded pane, grade summary and comment sidebar are
  reused from `app_.submissions_.$submissionId`; the editor and submit hook
  are reused from `app_.documents_.$id`.
- `app/routes/app.admin.organizations.$id/route.tsx` — the admin toggle.
- `e2e/tests/student.revision-flow.spec.ts` — the flow end to end.

## V2 — Revision Tutor

The feedback panel is where it plugs in: the tutor reads the same released
feedback the panel renders (rubric scores and comments, teacher comments,
assistant notes) alongside the live draft, and coaches the student through
addressing it. Nothing in V1 assumes the panel has only three tabs.

## Open Questions

- Should a revision be visibly linked to the submission it revises (a
  `revisesSubmissionId`), so teachers can see the pair? V1 leaves the
  submissions list flat, as it is today.
- Should teachers be able to require a revision, or cap how many a student can
  turn in?
