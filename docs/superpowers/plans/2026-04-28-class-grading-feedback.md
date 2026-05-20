# Class-Level Grading Feedback

**Status:** Planning (refreshed against live assignments + batch grading)
**Date:** 2026-04-28 (refreshed 2026-05-20)

---

## The idea

When a teacher opens an assignment (e.g., "To Kill a Mockingbird Essay"), they can generate an AI report that synthesizes all graded submissions into class-wide feedback:

- **Strengths** — what the class did well collectively
- **Weaknesses** — common mistakes or patterns across students, organized by rubric category
- **Teaching next steps** — specific interventions the teacher can take, with links to relevant Teacher Training modules

This is a teacher-only planning tool. Students never see it.

---

## What changed since the original draft

The original draft (April 28) was written assuming the assignment feature wasn't yet wired into the UI, and that we'd need to build the assignment detail page, batch-grading flow, and rubric storage as part of this work. None of that is true anymore:

- The assignment detail page is **live** at `app.my-classes.$classId_.assignments.$assignmentId` (`services/web-app/app/routes/app.my-classes.$classId_.assignments.$assignmentId/route.tsx`). It already renders the assignment header (title, type, due date) and a tabbed submissions table with `in-progress` / `submitted` / `graded` / `released` filters.
- **Batch AI grading** is live: on the Submitted tab teachers select rows and click "Grade with AI", which fans out to `POST /api/domain/grade-essay-ai` (`services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`). **Batch release** is live on the Graded tab via `POST /api/domain/release-grades`.
- The rubric is now canonical in code at `services/web-app/app/domain/grading/rubric.ts`: five keys — `thesis_and_content`, `organization_and_structure`, `evidence_and_support`, `voice_and_style`, `grammar_and_mechanics` — with the weights the AI grader uses.
- `Submission` already stores `rubricScores: Json?`, `overallScore`, `overallComment`, `numericPercentage`, `letterGrade`, `feedback`, `gradedAt`, `releasedAt` (schema lines 506–538). All the per-student grading data the insights synthesis needs is already on disk.
- `TeacherCourse` / `TeacherCourseModule` were renamed to `TeacherTraining` / `TeacherTrainingModule` as part of the assignments-unification work. The old `/app/teacher-courses/:id` route now redirects to `/app/teacher-trainings`. Module-link targets need to be updated accordingly.

So this feature now slots **on top of** the existing detail page rather than alongside a new one.

---

## Decisions made

| Question | Decision |
|---|---|
| Where does it live? | New "Class Insights" panel inside the existing assignment detail route (`app.my-classes.$classId_.assignments.$assignmentId`), above or alongside the submissions tabs |
| When is it generated? | On-demand (teacher clicks "Generate Class Insights"). Likely surfaced once the Graded tab has ≥1 row |
| Which submissions feed it? | Graded submissions only (`Submission.gradedAt IS NOT NULL`). Released vs. unreleased both count |
| Module linking | Approach 1: pass the list of available `TeacherTrainingModule`s into the prompt; the AI references them by id |
| Storage | `classInsights: Json?` + `classInsightsGeneratedAt: DateTime?` on `Assignment` (no new table for v1) |
| Visibility | Teacher eyes only; no student-facing surface |
| Rubric categories | Use the canonical keys from `rubric.ts` — do not re-define category names in the prompt |

---

## What the storage looks like

Two new fields added to the `Assignment` model (`packages/prisma/schema.prisma` lines 53–70):

```prisma
model Assignment {
  // ...existing fields (id, classId, assignmentTypeId, title, prompt, tutorContext, dueDate)
  classInsights            Json?
  classInsightsGeneratedAt DateTime? @db.Timestamptz(6)
}
```

The `classInsights` JSON shape:

```ts
type ClassInsights = {
  strengths: string[];            // 2-3 bullets, what the class did well
  weaknesses: {
    rubricCategory: RubricKey;    // one of the 5 keys from rubric.ts
    label: string;                // human label (also from rubric.ts)
    observation: string;          // what the pattern was
    affectedCount: number;        // how many students showed this weakness
  }[];
  nextSteps: {
    step: string;                 // the teaching move
    moduleId: string | null;      // TeacherTrainingModule.id, or null if no match
    moduleTitle: string | null;   // TeacherTrainingModule.title, or null
  }[];
  submissionCount: number;        // how many graded submissions were analyzed
  totalDocuments: number;         // total documents on the assignment (for context)
}
```

Why JSON on Assignment rather than a separate table: simple, v1, easy to regenerate. If we ever want historical snapshots (e.g., re-generate after more essays come in and compare), we'd extract this to an `AssignmentInsight` table keyed by `(assignmentId, generatedAt)`.

---

## UI structure

The route already exists. We're adding a new section to it, not creating a new page.

**Current layout** (`route.tsx`, loader returns `assignment`, `klass`, `submissions[]` filtered by status):

```
← Back to [Class Name]

[Assignment title]  [Type]  Due: [date]
[Tabs: In progress | Submitted | Graded | Released]
[Submissions table with batch grade / batch release actions]
```

**Proposed layout** (additions in **bold**):

```
← Back to [Class Name]

[Assignment title]  [Type]  Due: [date]

**--- Class Insights ─────────────────────────────────────────**
**[If no graded submissions yet:]**
**  "Grade some submissions to unlock class insights."**

**[If graded submissions exist but no insights yet:]**
**  "Generate insights once most essays are graded."**
**  [Generate Class Insights] button**

**[If insights exist:]**
**  Generated from N graded submissions  ·  [date]  [Regenerate]**

**  Strengths**
**  • ...**

**  Common Weaknesses**
**  • [Thesis/Content] — [observation] (N students)**
**  • [Organization]  — [observation] (N students)**

**  Suggested Next Steps**
**  • [step description]  → [Training module link]**
**  • [step description]  (no module match)**
**─────────────────────────────────────────────────────────────**

[Tabs: In progress | Submitted | Graded | Released]
[Submissions table]
```

The panel is collapsed/empty by default; nothing changes for assignments without grades.

---

## API + service surface

New route: `POST /api/domain/assignment-class-insights` (companion to the existing `api.domain.grade-essay-ai` and `api.domain.release-grades`).

Inputs: `{ assignmentId: string }`

Auth: must own the class (same pattern as the assignment detail loader — teacher profile is on one of `class.teachers`).

Implementation sketch:

1. Load assignment + class membership check.
2. Load all `Submission`s where `document.assignmentId = assignmentId` and `gradedAt IS NOT NULL`. Pull `rubricScores`, `overallComment`, `feedback`, `letterGrade`.
3. Load `TeacherTrainingModule`s the teacher has access to (via their assigned trainings). Trim to `{ id, title, description }`.
4. Call Claude (`@anthropic-ai/sdk`) with a structured-output prompt that returns the `ClassInsights` shape.
5. Validate the response (zod), then `prisma.assignment.update({ data: { classInsights, classInsightsGeneratedAt: new Date() } })`.
6. Return the parsed insights.

Reuse the model / tokenizer / streaming setup from `grade-essay-content.ts` rather than introducing a new SDK wrapper.

---

## AI prompt design (sketch)

**System:**
> You are a writing teacher's assistant. Analyze the following graded student essays for a class assignment and produce a concise class-level feedback report. Use only the canonical rubric categories you are given. Return only valid JSON matching the provided schema.

**User prompt includes:**
1. Assignment title + prompt
2. The 5 canonical rubric categories from `rubric.ts` (key, label, description, weight)
3. For each graded submission: per-category rubric score (1–5) + per-category AI comment, plus the overall comment
4. List of available teacher training modules (id, title, description)
5. The target JSON schema

**Module linking logic:** The AI receives:
```
Available training modules:
- [id] "Strong Thesis Statements" — How to craft a defensible, original thesis
- [id] "Evidence Integration"     — Selecting and weaving quotes into analysis
...
```
It references specific module IDs in the `nextSteps` output when a weakness maps to that content. Server-side, we re-resolve `moduleId → moduleTitle` against the DB so a hallucinated id can't poison the stored JSON.

---

## Open questions / not decided yet

- **Regeneration flow:** For v1, regenerate just replaces. Should the button warn if `classInsightsGeneratedAt` is recent (e.g., "Last generated 2 minutes ago")?
- **Module scope:** Currently teachers have `assignedTeacherTrainings` (renamed from `assignedTeacherCourses`). The prompt should only include modules belonging to those trainings — more relevant, less noise.
- **Minimum threshold:** Should the Generate button be disabled or warn until at least N submissions are graded? (e.g., "Only 2 of 24 graded — insights may not be representative.") Nice to have; not blocking.
- **Status placement:** Sit the Class Insights panel above the tabs (always visible) or behind a 5th tab? Above the tabs is closer to the current pattern — it's an assignment-level summary, not a per-status view.
- **Released-grades view interaction:** The new released-grades organization view (`app.my-classes.$classId.released-grades`) aggregates across assignments. Class Insights stays per-assignment for v1; an "org-level insights" rollup is out of scope but worth noting.

---

## What needs to be built

1. **Prisma migration** — add `classInsights Json?` and `classInsightsGeneratedAt DateTime?` to `Assignment`
2. **API route** — `POST /api/domain/assignment-class-insights` — graded-submissions + teacher-trainings → Claude → store result
3. **Loader update** — `app.my-classes.$classId_.assignments.$assignmentId/route.tsx` returns `classInsights` and `classInsightsGeneratedAt`
4. **Insights panel component** — empty state, generate button, rendered result, module links pointing at `/app/teacher-trainings/$id` (not the old `/app/teacher-courses/$id`)
5. **Feature flag** — gate behind a new flag in `services/web-app/app/utils/feature-flags.server.ts` following the existing pattern (e.g., `CLASS_INSIGHTS_ENABLED_ORG_IDS`) so we can ship to one org first. Required by `AGENTS.md` rollout rules

Per `AGENTS.md`: TDD the API route with unit tests before implementation, and add the e2e for the panel before the UI work.

---

## No longer blocked

The original doc said implementation was blocked until the assignment feature was integrated end-to-end. That's done — assignment create/edit, detail page, batch AI grading, batch release, and the per-submission grading pipeline are all live. This feature is ready to scope into a real implementation plan.
