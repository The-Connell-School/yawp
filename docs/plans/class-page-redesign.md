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

Options:
- **Group by course** — section headers in the table dividing assignments by course. No extra clicks, scannable.
- **Filter by course** — dropdown above the table to show one course at a time.
- **Both** — grouped by default, filterable.

Not decided. Need to see what it looks like with real volume.

### Students tab
Currently just shows roster + total document count. Could also show per-student submission status (e.g. how many submitted, any paste alerts). Low priority for now but worth revisiting once the assignments view is settled.

## Notes

