# Class Page Redesign

**Branch:** `claude/redesign-class-page-tabs-ggL4Z`
**PR:** #101

## Goal

Simplify the teacher class page from a busy 7-tab interface into something cleaner that still surfaces the right info.

## What's shipped so far

- Reduced tabs from 7 → 2: **Students | Assignments**
- "**+ Create New Assignment**" button always visible above the table
- Removed the summary stats cards (Students, In Progress, Submitted, To Release counts)
- Removed the assignment filter dropdown
- Defaults to the **Students** tab on load
- **Assignments table** now shows per-assignment status breakdown: In Progress / Submitted / Graded / Released / Copy & Paste — color-coded so pending work stands out (orange = submitted, blue = graded but unreleased, red = paste alerts)
- **Student details panel** (opened from the Students tab) now shows categorized sections: Submitted, Graded, Released, and Drafts in progress — creating a second route to a student's work alongside the Assignments view

## Open design questions

### The core tension
The old 7-tab view (In Progress, Submitted, Graded, Released, Assignments, Paste Activity, Students) was information-rich but hectic. The goal is to keep the signal without the noise.

Current approach: fold submission status into the Assignments table so teachers can see the full picture for each assignment in one row.

Still unresolved:
- **Paste Activity** — copy/paste monitoring has no home yet. Could be a notification, a per-student flag, or a separate view
- **Drilling in** — clicking an assignment or a status badge could open a list of the specific docs in that state (e.g. "3 submitted" → shows those 3 essays). Not built yet
- **Students tab** — currently just shows roster + doc count. Could show per-student submission status too

### Ideas still to explore

**Notification / alert layer**
- A strip or badge at the top of the page when there are submissions needing grading or grades ready to release
- "Things needing your attention" rather than a full tab

**Drilldown from Assignments**
- Clicking a status badge (e.g. "4 submitted") opens a filtered list or side panel of those specific docs
- Keeps the top-level view clean while making details accessible

**Paste Activity**
- Per-student flag in the Students tab (e.g. a warning icon if paste activity detected)
- Or a small "alerts" section somewhere — it's an academic integrity signal, not a workflow step, so it might deserve different treatment

## Unresolved questions

### What happens when you click an assignment title?
Currently: nothing. The title is plain text with no interaction.

Options:
- **Drilldown page** — clicking the title navigates to a dedicated assignment page showing the prompt, all student docs, and their statuses. Most powerful long-term; most work to build.
- **Side panel** — clicking opens a sheet/drawer with the same info without leaving the class page.
- **Clickable status badges** — instead of the title, clicking "3 Submitted" filters to just those docs. Faster for the grading workflow.

Leaning toward a drilldown page but not decided.

### How do we organize assignments when there are multiple courses?
Right now assignments are a flat list sorted by due date, with the course name as a column. Fine for a small number of assignments but will get messy with a full year across multiple courses.

**Note:** This page is already scoped to a single class — so the teacher is already looking at a filtered slice of their work. That natural boundary might be enough and the multi-course complexity might be less of a problem than it first appears. Worth seeing how it feels with real usage before adding more organization.

Options if it does become an issue:
- **Group by course** — section headers in the table dividing assignments by course. No extra clicks, scannable.
- **Filter by course** — dropdown above the table to show one course at a time.
- **Both** — grouped by default, filterable.

Not decided. Need to see what it looks like with real volume.

### Students tab
The student details panel now shows Submitted / Graded / Released / Drafts in progress. Two routes to the same work: by assignment (Assignments tab) or by student (Students tab → View Details).

Still unresolved: whether to surface any status signals on the student *row* itself (e.g. a badge if they have ungraded submissions) rather than requiring the panel to be opened.

### Paste activity column — clicking does nothing
The assignments table shows a paste alert count per assignment, and highlights red when non-zero. But clicking it does nothing yet. Also worth considering whether paste activity belongs in this workflow column at all — it's an academic integrity signal, not a step in the grading process, so it might deserve different treatment (e.g. a warning icon on the student row, a separate alerts view, or a notification).

## Screenshots

Screenshots taken of the three major views in PR #101:

1. **Students tab (default)** — Answers: does the 2-tab layout feel clean, and does the Create New Assignment button work as a persistent header element rather than its own tab? Result: yes — clean roster, button always visible regardless of active tab.

2. **Assignments tab with status columns** — Answers: can collapsing In Progress / Submitted / Graded / Released / Paste Activity into inline row counts replace five separate tabs without losing signal? Result: yes — color-coded counts (orange = needs grading, blue = graded unreleased, red = paste alert) surface the important stuff at a glance.

3. **Student details panel** — Answers: does a second route to student work through the roster (Students tab → View Details) add enough value to justify it? Result: yes — panel shows the student's work organized by state (Submitted, Graded, Released, Drafts in progress) and also surfaces active drafts that the Assignments tab doesn't show.

## Notes

