# Class-Level Grading Feedback

**Status:** Brainstorming / Pre-planning
**Date:** 2026-04-28

---

## The idea

When a teacher opens an assignment (e.g., "To Kill a Mockingbird Essay"), they can generate an AI report that synthesizes all graded submissions into class-wide feedback:

- **Strengths** — what the class did well collectively
- **Weaknesses** — common mistakes or patterns across students, organized by rubric category
- **Teaching next steps** — specific interventions the teacher can take, with links to relevant Brian modules/videos

This is a teacher-only planning tool. Students never see it.

---

## Decisions made

| Question | Decision |
|---|---|
| Where does it live? | Option B: assignment title links to a dedicated assignment detail page |
| When is it generated? | On-demand (teacher clicks "Generate Class Insights") |
| Which submissions feed it? | Graded submissions only |
| Module linking | Approach 1: give the AI the list of available teacher modules; it references them by name |
| Storage | `classInsights` JSON field + `classInsightsGeneratedAt` timestamp on `Assignment` |
| Visibility | Teacher eyes only; no student-facing surface |

---

## What the storage looks like

Two new fields added to the `Assignment` model:

```prisma
model Assignment {
  // ...existing fields...
  classInsights            Json?     // see shape below
  classInsightsGeneratedAt DateTime? @db.Timestamptz(6)
}
```

The `classInsights` JSON shape:

```ts
type ClassInsights = {
  strengths: string[];            // 2-3 bullets, what the class did well
  weaknesses: {
    rubricCategory: string;       // e.g. "thesis_and_content"
    label: string;                // human label, e.g. "Thesis/Content"
    observation: string;          // what the pattern was
    affectedCount: number;        // how many students showed this weakness
  }[];
  nextSteps: {
    step: string;                 // the teaching move
    moduleId: string | null;      // TeacherCourseModule.id, or null if no match
    moduleTitle: string | null;   // TeacherCourseModule.title, or null
  }[];
  submissionCount: number;        // how many graded submissions were analyzed
  totalDocuments: number;         // total documents on the assignment (for context)
}
```

Why JSON on Assignment rather than a separate table: simple, v1, easy to regenerate. If we ever want historical snapshots (e.g., re-generate after more essays come in and compare), we'd extract this to an `AssignmentInsight` table with a `generatedAt` timestamp as the primary key.

---

## UI structure

### Assignment detail page

New route: `/app/my-classes/:classId/assignments/:assignmentId`

The assignment row in the Assignments tab gets a title link instead of just an Edit button.

**Page layout:**

```
← Back to [Class Name]

[Assignment title]  [Course name]  Due: [date]
[Edit assignment button]

--- Prompt ---
[Full prompt text, collapsible if long]

--- Class Insights ─────────────────────────────────────────
[If no insights generated yet:]
  "Generate insights once most essays are graded."
  [Generate Class Insights button]  ← on-demand, hits new API route

[If insights exist:]
  Generated from N graded submissions  ·  [date]  [Regenerate button]

  Strengths
  • ...
  • ...

  Common Weaknesses
  • [Thesis/Content] — [observation] (N students)
  • [Organization]  — [observation] (N students)
  • ...

  Suggested Next Steps
  • [step description]  → [Module title link]
  • [step description]  → [Module title link]
  • [step description]  (no module match)
─────────────────────────────────────────────────────────────

--- Submissions ─────────────────────────────────────────────
[Table of graded submissions for this assignment]
Student | Essay | Score | Graded | View
─────────────────────────────────────────────────────────────
```

---

## AI prompt design (sketch)

**System:**
> You are a writing teacher's assistant. Analyze the following graded student essays for a class assignment and produce a concise class-level feedback report. Return only valid JSON matching the provided schema.

**User prompt includes:**
1. Assignment title and prompt
2. For each graded submission: student rubric scores per category (1–5) and AI-generated comment per category
3. List of available teaching modules (id, title, description)
4. The target JSON schema

**Module linking logic:** The AI receives something like:
```
Available teaching modules:
- [id] "Strong Thesis Statements" — How to craft a defensible, original thesis
- [id] "Evidence Integration"     — Selecting and weaving quotes into analysis
- [id] "Comma and Semicolon Rules" — Grammar fundamentals for essay writing
...
```
It references specific module IDs/titles in the `nextSteps` output when a weakness maps to that content.

---

## Open questions / not decided yet

- **Regeneration flow:** Should the teacher see a diff between the old and new insights, or just replace? For v1: just replace.
- **Module scope:** Teacher modules are assigned to `TeacherProfile` via `assignedTeacherCourses`. Should the insight prompt only include modules that *this teacher's assigned courses* contain? Probably yes — more relevant, less noise.
- **Route placement:** Does the assignment detail page live inside `app.my-classes.$classId` (nested, shares the class header) or is it a flat route? Nested makes sense — keeps the back-nav natural.
- **Minimum threshold:** Should the Generate button be disabled or warn until at least N submissions are graded? (e.g., "Only 2 of 24 graded — insights may not be representative.") Nice to have.

---

## What needs to be built

1. **Prisma migration** — add `classInsights Json?` and `classInsightsGeneratedAt DateTime?` to `Assignment`
2. **API route** — `POST /api/domain/assignment-class-insights` — fetches graded submissions + teacher modules, calls Claude, stores result
3. **Assignment detail route** — `/app/my-classes/:classId/assignments/:assignmentId` — loader + UI
4. **Assignment row → link** — update the assignments table to make the title a link
5. **Insights panel component** — generate button, streamed-in result display, module links

The module links in the UI would point to `/app/teacher-courses/:id` (the existing teacher course/module viewer).

---

## Open: see the current assignment feature fully integrated first

Before scoping the implementation, Bryant wants to see what the assignment feature looks like fully integrated in the current UI — specifically the assignment detail page shape and how storage feels — before committing to the above design.
