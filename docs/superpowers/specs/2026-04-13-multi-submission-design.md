# Multi-Submission Design

Students can submit multiple drafts of a document for grading. Each submission is an immutable snapshot with its own title, grade, and feedback. No schema migrations required.

## Data & Loader Changes

### Submit action (`api/domain/submit-document`)

Remove the guard at line 78 that blocks resubmission ("Resubmitting is temporarily disabled"). Accept an optional `title` field from form data. If provided, use it as the submission title; otherwise default to the document's current title.

### Document page loader (`app_.documents_.$id/route.tsx`)

- Fetch **all** submissions for the document (remove `take: 1`), lightweight select: `id, title, submittedAt, gradedAt, releasedAt`.
- Remove the teacher redirect to `/app/submissions/:id` (lines 248–253). Teachers land on the document page and use the submissions popover to pick one.
- Remove the student redirect when `releasedAt` is set (lines 255–262). Students always land on the document page.
- Remove the green "Graded" banner (lines 577–606). The submissions popover replaces it.

### Dashboard loader (`app._index/route.tsx`)

Change `submissions: { take: 1 }` to fetch all submissions (lightweight select: `id, title, releasedAt`).

### DocumentLink component (`components/document-link.tsx`)

- Always link to `/app/documents/:id` (remove the conditional that links to `/app/submissions/:id`).
- When any submissions have `releasedAt` set, show a badge: "1 graded" / "2 graded" / etc.
- Keep showing "Submitted" badge when submissions exist but none are released.

### Submission title update endpoint

Add PATCH handler to `api/model/submission-comment` or a new route `api/domain/update-submission-title`. Accepts `submissionId` and `title`. Auth: document owner (student) OR teacher of the student's class.

The existing `api/domain/update-submission` route (used for auto-saving grades) can be extended to also accept `title` updates — check if this is simpler than a new route.

## Submit Dialog

The existing finalize dialog (`app_.documents_.$id/route.tsx`, lines 664–721) is enhanced:

- **Version number**: Computed as `submissions.length + 1` (where `submissions` is the list from the loader). Displayed as "Version N" in the dialog header.
- **Editable title field**: Text input defaulting to the document's current title. Sent as `title` in the form data to the submit action.
- **Prior submissions list**: Below the title input, show each previous submission with:
  - Title
  - Relative date (e.g., "2 days ago")
  - Status badge: "Graded" if `releasedAt` is set, "Submitted" otherwise
  - Link that opens `/app/submissions/:id` in a new tab
- **Submit button**: Labeled "Submit Version N". Sends `documentId` and `title` to the submit action.

## Submissions Popover (Document Page)

A button in the document page nav bar: "Submissions (N)" where N is the count.

Popover content:
- List of all submissions, sorted most recent first.
- Each row: submission title, relative date, status badge.
- Status for students: "Graded" when `releasedAt` is set, "Submitted" otherwise. Students never see intermediate states.
- Each row is a link to `/app/submissions/:id`.
- Students can edit submission titles inline (pencil icon → text input → blur to save).

If no submissions exist, the popover shows "No submissions yet."

## Submissions/:id Page (Student View)

The submission detail page (`app_.submissions_.$submissionId/route.tsx`) already handles teacher grading views. Student views need gating by `releasedAt`:

### When `releasedAt` is null (submitted, not yet graded/released):

- Left panel: "Submitted" status. Placeholder text for grade fields: "Pending grade", "Pending feedback". No rubric scores shown.
- Center panel: Essay snapshot (read-only, as today).
- Right panel: "No feedback yet" — no comments shown, no creation UI.
- No grammar highlights or tooltips.

### When `releasedAt` is set (graded and released):

- Full grade view as it works today: rubric scores, feedback, comments, grammar highlights, tooltips.
- Read-only for students (no edit/delete on comments — already implemented via `readOnly` prop).

### Editable title (both views):

- The submission title in the nav bar is click-to-edit for the document owner.
- Teachers can also edit (already have edit capabilities on this page).
- Saves via the title update endpoint on blur.

## Dashboard Changes

- `DocumentLink` always points to `/app/documents/:id`.
- Badge logic:
  - No submissions → show course module badge (existing behavior).
  - Submissions exist, none released → "Submitted" badge.
  - N submissions released → "N graded" badge (green).
- Remove the conditional at lines 52–54 of `document-link.tsx` that links to `/app/submissions/:id`.

## What's NOT Changing

- The Prisma schema — no migrations. Submission model already supports multiple submissions per document.
- Teacher grading workflow — teachers still grade from `/app/submissions/:id` with the full rubric UI.
- The teacher class detail page (`app.my-classes.$classId`) — it already lists all submissions.
- Grammar issues, highlights, and tooltips — no changes to how they work, just gated by `releasedAt` for students.
