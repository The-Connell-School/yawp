# Teacher Workspace Redesign Requirements From Granola

**Date:** 2026-06-09
**Status:** Requirements source for a future Superpowers planning run. This is not an implementation plan.
**Primary source:** Granola call, "Teacher dashboard and documents UI - my classes, grading, and student work", June 9, 2026, 2:03 PM CDT, meeting id `081f8025-4e16-416d-8f95-8a8f23ecf1b0`.
**Supporting source:** Granola call, "Teacher dashboard - grading, submissions, and class management", June 8, 2026, 2:08 PM CDT, meeting id `769d06ad-e7fd-45d4-81ed-477ce287910b`.
**Branch context checked:** `codex/yawp-class-dashboard-fixtures` in `/Users/bryantbrock/.codex/worktrees/5623/yawp`.

## How To Use This Document

This document is a product requirements prompt for a powerful AI agent. It should be handed to that agent before it runs Superpowers planning. The agent should treat this as the desired product shape, inspect the current branch, then produce its own implementation plan.

Do not treat this as a file-by-file task list. This document intentionally avoids naming exact files to create or modify, avoids prescribing a data-model redesign, and avoids detailed code instructions. The future agent should still do normal discovery, but Bryant wants the product decisions and partially implemented branch context to be clear enough that the agent does not have to rediscover the same requirements from scratch.

The future agent should work in the current existing branch/worktree, not start over from `main`. If the agent needs to verify the expected branch, it should expect `codex/yawp-class-dashboard-fixtures`. In the discovery that produced this spec, the primary checkout was on `main`, while the relevant clean worktree was `/Users/bryantbrock/.codex/worktrees/5623/yawp` on `codex/yawp-class-dashboard-fixtures`. If the future agent starts somewhere else, it should locate and continue the existing worktree/branch instead of creating a fresh branch unless Bryant explicitly asks.

The future agent should commit frequently after coherent chunks of work. The point is to save progress often while a large AI-led redesign is underway. Commits should be meaningful, small enough to recover from, and should not bundle unrelated experiments.

This work should still follow the project's test-driven discipline: UI or flow changes need the relevant E2E coverage first; backend/service changes need focused unit coverage first. This spec does not remove that standard. It does remove the earlier idea that this redesign should be hidden behind a pilot feature flag.

## Bryant's Latest Decisions

The following decisions supersede older planning language where there is a conflict.

- Do not gate this redesign behind a feature flag. Bryant does not want a pilot flag or a flag-off version of the old `/app/my-classes` and assignment-creation behavior. Ship this as one coordinated major improvement after planning, implementation, and QA.
- Keep active users safe without feature flags by preserving user data, permissions, old links where practical, and existing core flows until the coordinated release is ready.
- Do not use gradient backgrounds for class cards or class headers. Replace the current gradient direction with computer-generated design elements in Yawp's palette: burned orange, white, muted neutrals, and black/charcoal.
- The visual direction should feel Anthropic-like: quiet, editorial, computer-generated, procedural, sparse, and intelligent. It should not feel like stock imagery, marketing gradients, or decorative blobs.
- Use the existing branch work as a starting point. Several pieces are already partially implemented and should be finished or refined, not rebuilt from scratch.
- Redesign the class detail page header and tabs.
- Move assignment management outside the class page. A class page can filter documents by assignment and link to assignment-related work, but the class page should not be the primary place where a teacher creates and manages assignments.
- Keep the terms `Assignment` and `Assignment Type` exactly as they are. Do not introduce `Assignment Preset`. Do not rename `Assignment Type`.
- The new teacher-level assignment surface should still be called `Assignments`.
- Do not make this a data-model redesign. Bryant believes the existing model is already close enough for the desired UI structure.

## Product Thesis

Yawp's teacher experience should become a clear teacher workspace built around three jobs:

1. Manage classes and students.
2. Create and apply assignments.
3. Review, grade, and release student work.

The current product has the right ingredients, but the information architecture makes teachers jump through class-specific paths for things that are really teacher-level work. The redesign should make the mental model obvious:

- Classes are where the teacher manages rosters and sees class-scoped student work.
- Assignments are teacher-owned work objects that can be applied to classes.
- Student Work is the place to inspect documents and move submissions through the grading lifecycle.
- The dashboard is a launch surface for those jobs, not a dumping ground for every teacher feature.
- Teacher's Lounge is still available, but it does not belong on the dashboard.

The desired result is a calmer, more powerful product for teachers. The teacher should open Yawp and immediately understand where to go to manage a class, create an assignment, or grade work.

## Current Branch Discovery Notes

These notes came from inspecting the existing `codex/yawp-class-dashboard-fixtures` worktree. The future agent should verify them, but should not spend a lot of time rediscovering them.

Already present or mostly present:

- Teacher's Lounge has been removed from the dashboard and remains in the left navigation.
- The dashboard has a class-card section near the top.
- `My Classes` has been redesigned from rows into a card grid.
- Class creation and class editing are available through a sheet-style workflow.
- Class cards show class metadata and status counts.
- A top-level `Student Work` navigation item exists.
- A `Student Work` page exists with teacher-level filters for student, class, and assignment.
- The class detail page has a header, class edit action, and tabs for Students, Documents, and Assignments.
- The class Students tab supports add student, move selected students to another class, remove students from the class, and view student details by jumping to the Documents tab filtered to that student.
- The class Documents tab already pulls together in-progress documents and submissions for the class.
- The class Documents tab already supports filtering by student and assignment.
- The class Documents tab already supports grouping by student or assignment with collapsible groups.
- Document status pills already exist in the class Documents tab and distinguish draft/in-progress, submitted, graded, and released states.
- Multiple-submission/version labeling is partially represented.

Still incomplete or misaligned with Bryant's latest direction:

- Class cards and class header art currently follow a gradient direction. That is no longer the desired visual direction.
- The current class detail header uses a large gradient hero area. The header needs a more refined, product-native redesign.
- The class detail tabs still include `Assignments`. Assignment management should move out to a teacher-level surface.
- The current class Assignments tab still includes operational document-status columns. Those counts belong in Student Work/Documents, not in assignment management.
- The dashboard still needs to settle into the final teacher workflow shape: classes first, then clear teacher-level entry points for Assignments and Grading/Student Work.
- The top-level Student Work page has useful filters, but it is not yet as powerful as the class Documents tab. It needs the same product-level thinking around grouping, status, navigation, and grading/release flow.
- Existing terminology and labels are not fully reconciled. For example, some surfaces say `Draft` while others say `In Progress`. The final experience should be consistent.

The future agent should work with the existing implementation, keep what already matches the desired product, and focus the plan on finishing the product direction.

## Dashboard Requirements

The dashboard should be a teacher command center, not a general content page.

The top section should be the teacher's classes. The class cards should be more square than rectangular, modern, and consistent with the Teacher's Lounge card vocabulary where that vocabulary still fits. Cards should show the class identity and the smallest set of useful workflow counts: students, assignments, work needing grading, active/in-progress work, and/or ready-to-release work. The card should make it obvious that clicking it opens that class.

Teacher's Lounge should not appear as a dashboard section. It remains available through the left navigation.

Below the class cards, the dashboard should expose the two other main teacher jobs:

- `Assignments`: a teacher-level entry point for creating and managing assignments.
- `Grading` or `Student Work`: an entry point into student documents/submissions, preferably deep-linked to the most actionable work first.

The dashboard can show status counts, but it should not become the full document browser. Teachers who need to inspect documents, submissions, or grading queues should move into Student Work.

The dashboard should reward progress without becoming playful or busy. The call repeatedly emphasized the value of a "things are green now" feeling for teachers who grade and release work. That feeling should appear through clear status completion, green release/check states, and reduced outstanding counts.

## Class Cards And Procedural Art

The class cards need a stable visual identity per class, but the current gradient direction should be replaced.

The desired art direction:

- Computer-generated, procedural, or code-art inspired.
- Same palette as Yawp: burned orange, white, muted neutrals, and black/charcoal.
- Quiet and editorial, similar in spirit to Anthropic's visual language.
- Sparse enough that text and controls remain legible.
- More like plotter marks, abstract grids, terminal/glyph fields, diagram fragments, ruled paper, generated linework, coordinate systems, small blocks, or ASCII-inspired texture.
- Not stock photography.
- Not one-note gradients.
- Not purple/blue SaaS gradients.
- Not decorative blobs, orbs, bokeh, or heavily blurred color fields.
- Not so literal that class cards look like clip art.

The generated art should feel deterministic. A class should not get a different random-looking background every render. If two classes have different visual identities, those identities should remain stable over time.

The art should support the product, not dominate it. It can appear on class cards and in the class detail header, but it should not make the UI feel like a landing page. The teacher is using an operational tool, so the artwork should give Yawp a distinctive identity while preserving scanability.

The future agent should explore implementation details during planning, but the product requirement is simple: replace gradient class-card/header visuals with stable computer-generated art in Yawp's palette.

## My Classes Requirements

The `My Classes` surface is the teacher's roster and class-management hub.

Desired behavior:

- Show all teacher-owned classes as cards.
- Make each class card a confident entry point to that class.
- Let teachers create and edit classes from this area.
- Keep class cards visually consistent with the dashboard class cards.
- Preserve the already-built shift from rows to cards.
- Keep the existing class-management affordances that are already working unless the plan finds a clear UX issue.

The class list should not become an assignment-management page. It can summarize assignment counts or status counts, but actual assignment creation and management should move to the teacher-level Assignments surface.

## Class Detail Requirements

The class detail page should answer two teacher questions:

1. Who is in this class?
2. What work exists for this class?

It should not be the primary place to create or manage assignments.

### Header

The current class detail header needs to be redesigned.

The desired header should feel like a compact product header, not a large decorative hero. It should include:

- Back navigation to My Classes.
- Clear class name/title.
- Grade, period, school, and school year context where available.
- Class code where useful.
- Key counts: students, documents, work needing grading, and/or released work.
- A clear edit/manage class action.
- Optional procedural class art using the same art system as the class card.

The header should keep useful information together. It should not separate basic navigation/actions from class identity in a way that makes the page feel assembled from unrelated parts.

### Tabs

The class detail tabs need to be redesigned around the final information architecture.

The final class detail tabs should be:

- `Students`
- `Documents`

`Assignments` should not remain as a class-detail management tab. Assignment information can still appear as filters, counts, links, or context inside Documents, but the teacher should go to the teacher-level Assignments surface to create, edit, duplicate, delete, or apply assignments.

The tab design should be compact, responsive, and easy to scan. Counts can be useful, but they should not make the tabs visually noisy. On mobile, labels and counts must still fit without overlap.

### Students Tab

The existing Students tab direction is good and should be refined rather than reimagined.

Required capabilities:

- View students in the class.
- Sort or scan by student name.
- Add a student by email.
- Create a new student account only when necessary.
- Move selected students to another class.
- Remove selected students from this class without deleting the student account or their work.
- Show how many documents each student has.
- Let `View details` take the teacher to the Documents tab filtered to that student.

The class page should avoid a detached student-detail sheet unless it is clearly better than the current filtered-documents path. The product direction from the call favored navigating to class documents filtered by the student.

### Documents Tab

The Documents tab is the class-scoped work browser. It should be the class page's main operational surface after the roster.

Required capabilities:

- Show all student documents for the class.
- Include in-progress documents and submitted documents.
- Filter by student.
- Filter by assignment.
- Filter by status if not already present.
- Group by student.
- Group by assignment.
- Allow no grouping.
- Use collapsible grouped sections with clear headings and counts.
- Show one status pill per document.
- Show grade information inside the status pill when the latest submission is graded or released.
- Show version labeling only when there are multiple submissions.
- Route `View details` contextually:
  - In-progress/no submission goes to the document editing/review context.
  - Submitted/graded/released work goes to the relevant submission/grading context.
- Preserve return navigation so the teacher comes back to the same filtered class view.

The Documents tab should reconcile status language across the app. Prefer the teacher-facing lifecycle:

- `In Progress`: no submitted snapshot yet.
- `Needs Grading`: latest submission exists and has not been graded.
- `Graded`: latest submission has a grade but has not been released.
- `Released`: grade/results have been released to the student.

If another label is used for a specific local context, it should be intentional. The current mixture of `Draft` and `In Progress` should not survive accidentally.

The Documents tab should be stress-tested with large enough data to reveal layout problems. The call specifically mentioned seeding roughly 50 graded documents for one student to stress-test grouping/filter patterns.

## Teacher-Level Assignments Requirements

Assignments should become a teacher-level workflow, roughly parallel to the teacher's class-management workflow.

The teacher should be able to create and manage assignments without first opening a specific class. The teacher should then apply an assignment to one or more classes as part of the assignment workflow.

This is a UI and product-structure change, not a request to redesign the underlying data model. The future agent should inspect the existing model and use it appropriately.

### Terminology

Use these terms exactly:

- `Assignment`: the teacher-created work object.
- `Assignment Type`: the existing type/category system already in Yawp.

Do not introduce:

- `Assignment Preset`
- `Assignment Template`
- Renamed `Assignment Type` terminology

Bryant considered renaming during the follow-up, then explicitly decided not to. Keep Assignment Types exactly as they are. Keep the teacher-facing management surface called Assignments.

### Desired Workflow

The Assignments surface should let a teacher:

- See their assignments.
- Create a new assignment.
- Choose the relevant Assignment Type as part of creating an assignment.
- Apply the assignment to one or more classes.
- Edit assignment details.
- Duplicate or reuse an assignment where useful.
- Remove/delete/unlink an assignment without destroying existing student documents.
- Understand where the assignment is currently applied.

The class page can still expose assignment context through document filters, counts, and links. It should not be the primary assignment CRUD surface.

The current branch still has a class-level Assignments tab with columns for In Progress, Submitted, Graded, Released, and Copy/Paste. That shape is now transitional. Those operational status counts belong in Documents/Student Work. The assignment-management surface should focus on assignment identity, type, class application, and editing/reuse actions.

Due dates should not be allowed to undermine reusability. If due dates remain in the product, the planning agent should treat them as scheduling/application details rather than the core identity of the teacher's assignment.

## Student Work And Grading Requirements

There should be a teacher-level work-review surface for documents and submissions across classes. The current branch calls this `Student Work`; the dashboard can still use a `Grading` card when the action is grading.

Use this product split:

- `Student Work`: the broad teacher-level surface for all student documents/submissions.
- `Grading`: the action-oriented entry point or filtered view for work needing teacher attention.

The Student Work page should become the cross-class counterpart to the class Documents tab.

Required capabilities:

- Filter by class.
- Filter by student.
- Filter by assignment.
- Filter by status.
- Search when useful, especially for finding a student, class, or assignment quickly.
- Sort or group by class, student, assignment, and status.
- Show status pills using the same lifecycle as class Documents.
- Let teachers open the right context from each row/card.
- Preserve return navigation.
- Support fast grading turnaround workflows.
- Make graded-but-unreleased work visible as a distinct teacher state.
- Make released work feel complete.

The call emphasized that grading is psychologically important. Teachers should feel progress as they move work from submitted to graded to released. The UI should make outstanding work visible, make completion obvious, and avoid hiding the release step.

The final system should support both common teacher entry paths:

- "I want to grade whatever needs attention now."
- "I want to inspect work for this specific class, assignment, or student."

## Status And Release Requirements

The grading lifecycle should be consistent everywhere teachers inspect work.

Teacher-facing statuses:

- `In Progress`: student has a document but no submitted snapshot.
- `Needs Grading`: student submitted work and it needs teacher grading.
- `Graded`: teacher has graded it, but results are not released to the student.
- `Released`: results are visible to the student.

Visual direction:

- In Progress: muted/gray.
- Needs Grading: yellow or orange.
- Graded: blue.
- Released: green.

The graded vs. released distinction is essential. Teachers need to be able to grade without exposing results immediately. Releasing is the final step that makes grades visible to students.

The release state should create the "everything is green now" feeling discussed in the call. This should be accomplished through clear status language, green completed states, check/progress affordances where tasteful, and counts that go down as work is handled.

## Navigation Requirements

The teacher navigation should make the core workflow visible.

Required teacher areas:

- Dashboard
- My Classes
- Student Work
- Assignments
- Teacher's Lounge

Organization and Admin remain conditional/admin areas as they already are.

Do not spend planning energy on unnecessary URL renames unless the future agent finds a concrete product or technical reason. Product labels and workflow clarity matter more than route churn. Existing routes can remain if they support the desired experience and preserve links.

## Visual And UX Requirements

Yawp should feel like a serious writing and teaching tool. The redesign should be calm, compact, and operational.

Use:

- Dense but readable layouts.
- Tables where comparison and scanning matter.
- Cards where they represent repeated objects such as classes.
- Clear filters and grouping controls.
- Icons in compact controls where the app already uses that pattern.
- Responsive layouts that preserve information hierarchy on mobile.

Avoid:

- Landing-page composition.
- Large decorative hero sections.
- Nested cards.
- Gradients as the main visual idea.
- Purple/blue SaaS palettes.
- Busy decorative elements behind important text.
- Explanatory marketing copy inside the product.

The class-card procedural art is the main visual identity improvement. It should be enough. The rest of the UI can stay quiet.

## Non-Goals

This spec does not ask the future agent to:

- Build a feature-flag rollout.
- Preserve old class/assignment behavior behind a flag.
- Redesign the database schema.
- Rename Assignment Types.
- Introduce Assignment Presets.
- Turn this into a file-by-file implementation plan.
- Rebuild completed branch work from scratch.
- Move Teacher's Lounge back onto the dashboard.
- Make the dashboard a full document browser.
- Make class detail the primary assignment-management surface.

## Acceptance Criteria

The future implementation should be considered product-complete when:

- The agent has worked from the existing `codex/yawp-class-dashboard-fixtures` branch/worktree or Bryant's current branch, not from a blank branch.
- Progress has been committed frequently in coherent slices.
- Dashboard presents classes first and gives clear entry points to Assignments and Grading/Student Work.
- Teacher's Lounge is not on the dashboard.
- My Classes uses class cards and class management flows from the current branch, refined as needed.
- Class card/header visuals use stable computer-generated Yawp-palette art, not gradients.
- Class detail has a redesigned header.
- Class detail tabs are redesigned around Students and Documents.
- Assignment management has moved to a teacher-level Assignments surface.
- The UI continues to use `Assignment` and `Assignment Type`; no `Assignment Preset` language appears.
- Class Documents supports filtering and grouping by student and assignment, plus status filtering if needed for parity.
- Student Work supports teacher-level review across classes with useful filters and status visibility.
- Status labels and colors are consistent across class Documents and Student Work.
- Graded and Released are distinct, and release completion feels visibly satisfying.
- Existing student documents and submissions remain intact when assignments are edited, removed, unlinked, or relocated in the UI.
- The implementation has focused E2E/unit coverage written before or alongside the relevant changes per project policy.
- The branch passes the relevant test and lint/build verification chosen in the implementation plan.

## Prompt For The Future Agent

Use this document as the requirements source. First inspect the current branch/worktree and compare it to the "Current Branch Discovery Notes" above. Then run Superpowers planning from these requirements.

Do not ask Bryant to re-explain the product direction unless you find a real contradiction that cannot be resolved. Use the latest Bryant decisions in this document as the source of truth:

- no feature flag,
- no gradient class art,
- assignment management moves outside class detail,
- keep `Assignment` and `Assignment Type` terminology,
- work in the current existing branch,
- commit frequently.
