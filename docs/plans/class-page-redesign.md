# Class Page Redesign

**Branch:** `claude/redesign-class-page-tabs-ggL4Z`
**PR:** #101

## Goal

Simplify the teacher class page from a busy 7-tab interface into something cleaner that still surfaces the right info.

## What's shipped so far

- Reduced tabs from 7 → 4: **Students | Assignments | Submitted | Released**
- "**+ Create New Assignment**" button always visible above the table
- Removed the summary stats cards (Students, In Progress, Submitted, To Release counts)
- Removed the assignment filter dropdown
- Defaults to the **Students** tab on load

## Open design questions

### The core tension
The old 7-tab view (In Progress, Submitted, Graded, Released, Assignments, Paste Activity, Students) was information-rich but hectic. The goal is to keep the signal without the noise.

Tabs currently not shown that had useful info:
- **In Progress** — drafts being actively worked on
- **Graded** (ready to release) — essays graded but not yet released to students
- **Paste Activity** — copy/paste monitoring

### Ideas to explore

**Fold info into Students tab**
- Each student row could show a status badge or mini-summary (e.g. "2 submitted, 1 released")
- Clicking a student opens a side panel with all their docs, statuses, and any paste alerts

**Fold info into Assignments tab**
- Each assignment row could show a breakdown: X in progress / Y submitted / Z released
- Clicking an assignment drills into that assignment's submissions

**Notification / alert layer**
- A small badge or banner at the top when there are ungraded submissions or unreleased grades
- Could be a "things needing your attention" strip rather than a full tab

**Keep Submitted + Released tabs (current approach)**
- Simple, familiar to teachers
- But still missing: Graded (ready to release) and Paste Activity

## Notes

