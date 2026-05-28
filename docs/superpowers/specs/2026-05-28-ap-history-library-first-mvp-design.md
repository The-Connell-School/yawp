# AP History Library-First MVP Design

## Recommendation

Restart AP History from a clean foundation branch and use the current PR #148/#149/#150 stack as prototype/reference material only.

The prototype proved that AP History can work as a Yawp experience, but the product direction should be narrower and more opinionated before it becomes app foundation. The first production slice should be a curated APUSH DBQ/LEQ assignment flow built on the existing Assignments rollout, not a broad AP authoring platform.

The MVP should prove:

> A teacher can assign a curated APUSH DBQ or LEQ in under a minute, students receive AP-specific coaching while writing, and the teacher reviews rubric-aligned GA feedback without any teacher-controlled tutor or grader customization.

## Product Principles

- Yawp is opinionated by default. That is a selling point, not a limitation.
- Normal teachers do not get a blank tutor prompt, grader prompt, PDF uploader, or from-scratch AP builder in v1.
- Kevin/Brian/Yawp staff can grow the curated AP library through seed/import tooling, not teacher-facing product UI.
- Tutor and grading assistant behavior is canonical to the assignment type.
- Teacher control stays where it belongs: choosing a curated prompt, assigning it to classes, setting due dates/points, reviewing and overriding GA output.
- AP History is a model for future assignment-type expansion, so it must fit the shared assignment architecture.

## Scope

### In Scope

- APUSH only.
- DBQ and LEQ.
- One canonical `AP History Essay` assignment type.
- Curated AP prompt library.
- Library row to assignment creation flow.
- Immutable assignment-level AP snapshot copied from the selected library entry.
- Student writing through the existing Yawp document/tutor pattern as much as possible.
- AP-specific tutor behavior resolved from assignment type plus assignment snapshot.
- AP-specific grading assistant behavior resolved from the same assignment type plus assignment snapshot.
- Teacher review/override of GA feedback.
- Feature access requiring both assignments access and AP History access.
- Internal seed/import path for curated library content with stable keys.

### Out of Scope

- PDF upload.
- From-scratch AP prompt/source builder.
- Teacher tutor customization.
- Teacher grading assistant customization.
- AP Euro.
- AP World.
- SAQ.
- Student self-serve practice library.
- GA reading tutor transcripts in MVP.
- Public custom assistant/commons workflow.

Advanced AP authoring can return later behind a separate approval feature such as `ap_history_advanced_authoring`, but that key and UI are not required for the MVP.

## Domain Model

AP History should layer onto the current assignment model rather than create a parallel system.

### AssignmentType

`AP History Essay` is an `AssignmentType`.

It owns canonical behavior:

- supported essay modes: `dbq`, `leq`
- canonical tutor profile
- canonical grading assistant profile
- rubric family and rubric version
- default timing/coaching rules
- allowed library filters
- capability policy: library-only in MVP

### Prompt Library Entry

A curated DBQ or LEQ prompt is reusable library content under the AP History assignment type.

It owns:

- stable external key
- course: `apush`
- essay type: `dbq` or `leq`
- prompt text
- period and period number
- reasoning skill
- difficulty/skill tags
- default timing suggestion
- source provenance
- DBQ source rows, only for DBQs

### Assignment

When a teacher assigns a library prompt to a class, that is an `Assignment`.

It owns:

- class
- title
- due date
- point value / submit-for-grade
- selected library entry provenance
- immutable AP snapshot copied from the library entry at assignment creation

The assignment may retain `sourceLibraryEntryId`, but runtime display, tutor prompts, and GA grading must read the assignment snapshot rather than the live library row.

### Document, Submission, Tutor Session

Student work should remain in the existing student writing model:

- `Document`: student draft/workspace for the assignment
- `Submission`: submitted version and GA output
- tutor/session history: coaching interaction for that document/attempt

Avoid AP-only session tables unless a generic session model cannot support the needed contract. AP History should not create a dead-end model that future assignment types cannot reuse.

## Assignment Snapshot

The central data-model requirement is immutable assignment content.

Library rows can be revised by Yawp staff. Active and historical assignments must not change when the curated library changes. The assignment snapshot is the source of truth for student display, tutor context, and GA grading.

Recommended MVP shape is a dedicated nullable structured JSON field on `Assignment`, named `apHistorySnapshot`. If implementation discovers an already-merged generic assignment config field with equivalent validation and read boundaries, the implementation plan may use that instead, but the product contract remains the same: a versioned immutable AP snapshot on the assignment.

```ts
{
  schemaVersion: 1,
  libraryEntryId: "apush-dbq-new-deal-federal-power",
  course: "apush",
  essayType: "dbq",
  prompt: "Evaluate the extent to which ...",
  period: "1932-1980",
  periodNumber: 7,
  reasoningSkill: "causation",
  sources: [
    {
      externalKey: "apush-dbq-new-deal-federal-power-doc-1",
      position: 1,
      title: "Document 1",
      attribution: "...",
      body: "...",
      caption: "...",
      mediaType: "text",
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: "https://..."
    }
  ],
  rubric: {
    rubricId: "ap-history-dbq-2026",
    totalPoints: 7
  },
  timing: {
    mode: "untimed",
    durationMinutes: 60
  }
}
```

LEQ snapshots use the same shape with `essayType: "leq"`, no source rows, and the LEQ rubric.

## Feature Access

AP History visibility requires both:

- assignments access
- AP History access

The existing Feature Access model should be extended rather than bypassed. Runtime checks should support teacher, school, organization, and compatibility fallbacks consistent with the feature-access contract.

Normal enabled teachers see only the curated library assignment flow.

Do not implement teacher-facing PDF upload, from-scratch creation, tutor prompt customization, or GA prompt customization in v1. Disabled or unavailable actions should be hidden, not greyed out.

## User Flows

### Teacher Creates From Library

The teacher opens the AP History Essay assignment type page and sees a curated APUSH library.

Filters:

- DBQ / LEQ
- APUSH period
- reasoning skill
- difficulty or skill emphasis
- source count for DBQs

Clicking a library row opens a create assignment sheet using existing assignment-creation patterns:

- class or classes
- title
- due date
- submit for grade
- point value
- time mode defaulted from the library entry; full timed-mode enforcement is not part of MVP

The teacher cannot edit prompt/source content in MVP.

### Student Completes Assignment

The student opens the assignment as a normal Yawp document.

DBQ mode shows:

- prompt
- source set from the assignment snapshot
- writing workspace
- AP tutor

LEQ mode shows:

- prompt
- writing workspace
- AP tutor

The tutor sees the assignment snapshot, rubric family, essay type, period, reasoning skill, and current draft. It coaches rubric moves, not generic prose. It never writes the essay for the student.

### Teacher Grades / Reviews GA

After submission, the grading assistant produces draft rubric feedback using:

- assignment snapshot
- submission content
- rubric version
- source set for DBQ
- AP grading posture

The teacher reviews and overrides. This remains grading assistance, not automatic grading.

### Internal Library Content Operations

Curated content enters through internal tooling in MVP:

- checked-in JSON/TS seed data or import files
- idempotent seed/import script
- stable external keys
- upsert semantics
- source provenance fields

No teacher-facing content creation path is part of MVP.

## Tutor / GA Continuity

The MVP continuity requirement is shared configuration and shared source of truth:

- same assignment type
- same assignment snapshot
- same rubric version
- same prompt/source set
- same submission content
- same no-custom-teacher-prompt policy

Future continuity should let the GA see tutor transcript and process history for the document/attempt. That is valuable, but it is a separate feature because it touches privacy, prompt size, grading latency, attempt semantics, and process-history summarization.

## Preview Environment Plan

Create a new branch and preview for this recommendation rather than continuing from the current AP stack as the implementation base.

Suggested branch:

```text
codex/ap-history-library-first-mvp
```

Preview seed should include:

- one demo organization/class/teacher/student with assignments enabled
- `ap_history_essay` access enabled for the demo context
- `AP History Essay` assignment type
- at least one curated DBQ
- at least one curated LEQ
- DBQ source rows with stable keys and provenance

Preview proof should show:

- AP History hidden when assignments or AP access is disabled
- teacher creates AP assignment from curated library
- assignment stores immutable snapshot
- student opens DBQ and sees snapshot sources
- student opens LEQ and sees prompt-only mode
- submission stores versioned AP rubric output
- normal teacher never sees PDF upload, from-scratch builder, tutor prompt box, or GA prompt box

## Coding Agent Strategy

Do not start with five agents writing code against the same schema. The schema and feature-access contract are shared enough that too many implementation agents will create conflict.

Recommended sequence after this spec is approved:

1. One implementation lead creates the new branch and first implementation plan.
2. One data/access agent owns schema, library seed, snapshot creation, and feature access tests.
3. One UI/runtime agent owns library creation flow and student assignment display.
4. One AI contract agent owns tutor/GA prompt inputs and rubric score schema, preferably after the snapshot shape is stable.
5. One independent QA/review agent reviews the finished branch and captures preview proof.

The first coding step should be the data/access slice. UI and AI slices should not proceed until the assignment snapshot contract is green.

## Test Strategy

Follow the repo's TDD rule.

Data/access tests first:

- AP History requires assignments access and AP access.
- disabled users cannot see or create AP History assignments.
- library entry creation produces an immutable assignment snapshot.
- later library edits do not mutate assignment snapshots.
- seed/import is idempotent and uses stable keys.

Route/component tests:

- teacher can create an AP assignment from a library row.
- teacher cannot access PDF/from-scratch/custom tutor controls.
- student DBQ display reads assignment snapshot sources.
- student LEQ display does not require sources.
- submission/GA output stores rubric schema version.

E2E/preview proof:

- teacher library-to-assignment flow.
- student DBQ open/write/submit path.
- teacher review of AP rubric feedback.
- feature-disabled hidden-state checks.

## PR #148 Direction

Ask Kevin to treat the current stack as prototype evidence and revise the foundation around this bar:

1. AP History is an `AssignmentType`.
2. DBQ/LEQ prompts are curated library entries.
3. Teacher-created AP work is an `Assignment`.
4. Assignment creation copies immutable prompt/source/rubric/timing snapshots from the library.
5. Normal teachers cannot upload PDFs, create from scratch, or customize tutor/GA behavior in v1.
6. Tutor and GA resolve from canonical assignment type config and the same assignment snapshot.
7. `Submission.rubricScores` JSON is acceptable if schema-versioned.
8. Feature access must require assignments access plus AP History access.
9. AP-specific code should not create one-off dead ends where existing or generic assignment/tutor/session infrastructure can work.

## Risks

- The current prototype may contain useful UI work that is faster to reference than port. Treat it as a visual and implementation reference, not as product source of truth.
- Snapshot JSON can become unstructured if schema versioning and tests are weak. Add strict runtime validation at creation/read boundaries.
- Library-only may feel constrained to teachers with existing materials, but that constraint is intentional for v1 and protects product quality.
- Tutor/GA continuity beyond shared config is valuable, but adding transcript ingestion now could slow the MVP and blur the acceptance bar.

## Acceptance Bar

The MVP is ready for Bryant/Brian/Kevin review when:

- AP History is hidden unless both assignments and AP History access are enabled.
- A teacher can create an APUSH DBQ/LEQ assignment only from curated library content.
- The created assignment contains a versioned immutable snapshot.
- Student display, tutor input, and GA input all use the same snapshot.
- Normal users have no PDF upload, blank builder, tutor customization, or GA customization path.
- AP rubric output is versioned and reviewable by a teacher.
- The preview includes screenshots or video proof of the above.
