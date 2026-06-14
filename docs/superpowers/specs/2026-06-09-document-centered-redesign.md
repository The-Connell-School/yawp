# Document-Centered Redesign

**Date:** 2026-06-09
**Status:** Design approved, ready for implementation plan.

## Background

Yawp has accumulated multiple one-off surfaces that show documents, submissions, and student writing in slightly different ways: the dashboard document cards, class pages, assignment pages, grading/submission pages, and released-grades pages. The product feels less coherent than it should because there is no shared conceptual model tying these surfaces together.

The core insight: documents are the durable central artifact in Yawp. Classes, assignments, students, submissions, and grading are all contexts *around* documents. Every teacher path — from the dashboard, from a class, from an assignment, from a grading queue — eventually leads to a document. The redesign makes this explicit.

## Goals

1. Establish a unified document-centered product model with a shared document view component.
2. Add a master Documents page as the top-level browsing and grading surface.
3. Redesign the nav to reflect three primary teacher areas: Classes, Documents, Lounge.
4. Refactor the class detail page with a Students · Assignments · Documents sub-nav.
5. Simplify the Dashboard to shortcuts + a rule-based activity feed.
6. Enforce single-class assignment creation; replace multi-class creation with a "Duplicate to class" action.
7. Update the DocumentLink card badge from module title to document status.

## Non-Goals

- Data model schema changes (no migrations needed; `Assignment.classId` is already a required single FK).
- Backwards compatibility scaffolding — this ships on a preview branch, QA'd before merge.
- Smart recommendation algorithm on the dashboard — the feed is rule-based at launch.
- Student-facing navigation changes.
- Admin or Organization page changes.

## Ubiquitous Language

- **Document** — the live, current version of a student's writing. Always the source of truth for what the student has written.
- **Submission** — an immutable snapshot of a document at the moment it was handed in. A document can have multiple submissions.
- **Document status** — derived from the latest submission's state. Single status per document, with teacher and student labels that differ.
- **Assignment** — a teacher-created instance scoped to exactly one class. References an AssignmentType and adds prompt, due date, and grading settings.
- **AssignmentType** — the reusable template (Five-Paragraph Essay, Thesis Essay, etc.).

## Navigation

Teacher left sidebar (unchanged structure, updated labels and items):

```
Dashboard       /app
Classes         /app/classes          (teacher only; was /app/my-classes)
Documents       /app/documents        (teacher only; new)
Lounge          /app/teacher-trainings (teacher only; label was "Teacher's Lounge")
Organization    /app/organization     (owner only; unchanged)
Admin           /app/admin            (admin only; unchanged)
```

The `/app/my-classes` route redirects to `/app/classes`.

## Document Status Model

A single status is derived from the latest submission. No "revised" or "resubmitted" states — only the most recent submission's state matters.

| Condition | Teacher label | Student label |
|---|---|---|
| No submissions | In Progress | In Progress |
| Latest submission: `gradedAt` null | Needs Grading | Submitted |
| Latest submission: `gradedAt` set, `releasedAt` null | Graded | Submitted |
| Latest submission: `releasedAt` set | Released | Graded |

**Derivation** (no new fields). `latestSubmission` = the submission with the most recent `submittedAt`, excluding `archivedAt` submissions:
```ts
function getDocumentStatus(latestSubmission: Submission | null, viewer: 'teacher' | 'student') {
  if (!latestSubmission) return 'In Progress';
  if (latestSubmission.releasedAt) return viewer === 'teacher' ? 'Released' : 'Graded';
  if (latestSubmission.gradedAt)   return viewer === 'teacher' ? 'Graded'   : 'Submitted';
  return viewer === 'teacher' ? 'Needs Grading' : 'Submitted';
}
```

Students never see "Graded" until `releasedAt` is set. Students never see "Needs Grading" or the intermediate "Graded (not released)" state.

**Badge colors (teacher view):** In Progress — gray · Needs Grading — orange · Graded — blue · Released — green

**Badge colors (student view):** In Progress — gray · Submitted — blue · Graded (released) — green

## DocumentLink Card — Updated Design

The existing `DocumentLink` component is updated:

**Badge (top-right):** Document status label (teacher or student variant). Replaces the current module title badge entirely.

**Footer:** `"[timestamp] · [AssignmentType name]"` — e.g. "Submitted 2h ago · Five-Para Essay". The timestamp verb changes with status: "Updated" for In Progress, "Submitted" for Needs Grading/Submitted, "Graded" for Graded, "Released" for Released.

**Module/session information:** Removed from the card. No longer shown as a badge or secondary label. It remains accessible inside the document editor if needed.

**What does not change:** Card dimensions, document HTML preview, title display, the ⋮ archive/unarchive dropdown, the link target.

## Dashboard `/app`

The dashboard is a shortcuts and activity surface — not a document browser.

### Quick Access (top section)
Three cards, always present, linking to the three main areas:

| Card | Subtitle | Links to |
|---|---|---|
| Classes | "{n} active classes" | /app/classes |
| Documents | "{n} need grading" (orange if >0, gray if 0) | /app/documents?status=needs-grading |
| Lounge | "Teacher training" | /app/teacher-trainings |

### Activity Feed (below Quick Access)
Rule-based rows surfacing the most actionable items. Ordered by priority:

1. **Needs Grading** — grouped by class+assignment. Row shows: "{n} submissions waiting in {Class} — {Assignment}". Action: navigates to `/app/documents?classId=…&assignmentId=…&status=needs-grading`.
2. **Ready to Release** — grouped by class+assignment. Row shows: "{n} documents graded and ready to release in {Class}". Action: navigates to `/app/documents?classId=…&status=graded`.
3. **Active Writing** — grouped by class. Row shows: "{n} students actively writing in {Class}". Action: navigates to `/app/documents?classId=…&status=in-progress`.

Each row has an icon, a description line, a secondary metadata line (assignment name + date context), and a consistent "View →" button on the right. Button style does not change by row type — only the destination changes.

If there is no activity to surface, the feed shows a friendly empty state: "No recent activity. Your classes and documents will appear here."

The algorithm is intentionally rule-based at launch. Smart ranking (e.g. surfacing based on due dates, teacher behavior patterns) is future work.

## Master Documents Page `/app/documents`

The central document browsing and grading surface for teachers.

### Filter Bar
Filters persist in the URL as query params:
- `classId` — dropdown of teacher's classes. Default: all.
- `assignmentId` — dropdown filtered to selected class's assignments. Default: all.
- `studentId` — dropdown of students. Default: all.
- `status` — dropdown: All · In Progress · Needs Grading · Graded · Released. Default: all.
- Document count shown at right: "{n} documents".

### View Toggle
Card view (default) and table view. Toggle persisted to user preferences (same pattern as existing `api.preferences.nav`).

### Card View
Responsive grid of `DocumentLink` cards with the updated design. Sorted by most recent activity (latest `updatedAt` or `latestSubmission.submittedAt`) descending. Paginated at 24 per page.

### Table View
Columns: Student · Document title · Class · Assignment · Status · Date · Action.

Date column shows the most relevant timestamp for the status: submitted-at for Needs Grading, graded-at for Graded, released-at for Released, updated-at for In Progress.

**Action column:** A single consistent "Open →" button on every row. Destination varies by status:
- In Progress → `/app/documents/:id`
- Needs Grading → `/app/submissions/:submissionId` (grading view)
- Graded → `/app/submissions/:submissionId` (release flow)
- Released → `/app/submissions/:submissionId` (read-only)

The button style does not change between rows. Same visual weight, same position, same label.

## Classes Page `/app/classes`

### Index
Card grid matching the Lounge card visual style from the current dashboard. Each card shows:
- Class name
- Student count · assignment count
- Status summary badge(s): "{n} need grading" (orange) and/or "{n} in progress" (gray) and/or "All released" (green)

"+ New Class" button top-right. New class creation follows the existing pattern (sheet or dialog — TBD, match existing patterns in the app).

### Class Detail `/app/classes/:classId`
Page header shows class name with a breadcrumb back to Classes. Sub-nav tabs: **Students · Assignments · Documents**.

#### Students Tab
Table: Name · Email · Documents · Last Active · View action.

Documents column shows "{n} docs" and highlights if any need grading: "· {n} needs grading" in orange.

"+ Add Student" button opens a sheet with an email input. The sheet adds the student's profile to this class by email (same logic as existing student management — manages the profile-to-class membership, not the user account).

Clicking a student row opens a sheet showing that student's profile details and their documents in this class (card view, scoped to this class + this student).

Remove student: available via a menu on the student row (⋮ or inside the sheet). Removes the profile from the class.

#### Assignments Tab
Card grid of assignments for this class. Each card shows:
- Assignment title (AssignmentType name if no custom title)
- Due date · student count
- Status summary: "{n} needs grading" / "All released" / etc.
- Edit and Duplicate actions.

"+ New Assignment" button and a ghost "new assignment" card in the grid.

**Creating an assignment:** The form always knows which class it belongs to (context is implicit from the current class detail page). The `classId` field is not user-facing — it is set automatically. The form collects: AssignmentType, prompt, due date, grading settings. No multi-class picker.

**Duplicate to class:** Opens a sheet. Shows: source assignment name, target class selector (teacher's other classes), optional due date. Copies prompt, AssignmentType, and grading settings. Due date is not copied — must be set for the target class. Creates a fully independent `Assignment` row in the target class. Editing the copy has no effect on the original.

**Edit/Delete:** Existing patterns (sheet or inline form). No change in behavior.

#### Documents Tab
The same document view component as the master Documents page, pre-filtered to this class. The class filter is hidden (implicit). Supports all the same filters (assignment, student, status), card/table view toggle, and action button behavior.

## Assignment Creation API Change

`POST /api/assignments/create` currently accepts `classIds[]` (plural) and calls `prisma.assignment.createMany`.

**Change:** Accept `classId` (singular string). Call `prisma.assignment.create` (single record). Remove `createMany` loop. Remove the multi-class feature flag checks that looped per-class.

The "duplicate to class" flow calls this same endpoint once with the target `classId`.

Update the route's tests to match the new single-class contract.

## Shared Document View Component

A new `DocumentsView` component (or equivalent) encapsulates the full filter bar + card/table toggle + document grid/table. It accepts:

```ts
type DocumentsViewProps = {
  defaultFilters?: {
    classId?: string;
    assignmentId?: string;
    studentId?: string;
    status?: DocumentStatus;
  };
  hiddenFilters?: ('class' | 'assignment' | 'student' | 'status')[];
  viewer: 'teacher' | 'student';
};
```

Used in:
- `/app/documents` (master page, no hidden filters)
- Class detail Documents tab (`classId` locked, class filter hidden)
- Student sheet inside class detail (`classId` + `studentId` locked, both hidden)
- Dashboard "View →" links pre-apply filters via URL params

## Route Changes Summary

| Old route | New route | Notes |
|---|---|---|
| `/app/my-classes` | `/app/classes` | Redirect old → new |
| `/app/my-classes/:classId` | `/app/classes/:classId` | Sub-nav replaces current tab UI |
| `/app/my-classes/:classId/released-grades` | Removed | Released documents accessible via Documents tab with status=released filter |
| — | `/app/documents` | New master Documents page |

## Open Questions

None — all design decisions resolved during brainstorming.
