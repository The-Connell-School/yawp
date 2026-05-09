---
name: AP History essay — spec v1
status: draft
version: v1
owner: Kevin
priority: medium
created: 2026-05-09
updated: 2026-05-09
pm-spec: https://github.com/The-Connell-School/yawp-pm/blob/main/features/ap-history-essay-use-case.md
related:
  - features/narrative-essay-use-case.md (yawp-pm)
  - features/daily-pages-assignments.md (yawp-pm)
  - features/differentiated-rubrics-by-assignment-type.md (yawp-pm)
  - features/assignments-unification.md (yawp-pm)
launch-scope: APUSH-first; AP Euro / AP World follow with parallel research
flag: dbq_assignment_type
---

# AP History essay — engineering spec v1

> **Status: draft.** This is the engineering-facing v1 of the AP History
> essay AssignmentType, adapted from the PM use-case doc
> ([`features/ap-history-essay-use-case.md`](https://github.com/The-Connell-School/yawp-pm/blob/main/features/ap-history-essay-use-case.md))
> in `yawp-pm`. The PM doc is the source of truth for problem/goals/non-goals;
> this doc is the source of truth for engineering scope, data model, file
> paths, and rollout. Open questions stay in the PM doc until they're decided.
>
> Stacked on PR #108 (Teacher dashboard cleanup) so the AssignmentType row
> work and the dashboard surfaces this AssignmentType plugs into are visible
> together.

A single, reusable AP-history-essay AssignmentType covering both essay types
on the AP US, European, and World History exams: the **Document-Based
Question (DBQ)** and the **Long Essay Question (LEQ)**. Both share the same
four-row College Board rubric structure (thesis, contextualization, evidence,
analysis & reasoning); they differ in document use, point total, and exam
timing. One AssignmentType with `essayType: dbq | leq` keeps teacher
navigation simple, the prompt library shared, and the tutor/GA framework
reused — distinct rubric branches and authoring affordances live inside the
one AssignmentType.

## v1 launch scope

**APUSH-first.** v1 ships AP US History only. We have authoritative
pedagogical material for APUSH (the 7-point DBQ rubric in detail, the named
failure modes, the diagnose → drill → reintegrate → polish sequence,
period-specific outside-evidence anchors, calibration samples from College
Board released exams). AP Euro and AP World share the rubric structure but
need a parallel research pass to seed era taxonomies, context banks, and
library prompts at the same depth. Shipping APUSH well beats shipping all
three thinly.

**APUSH v1 contents:**

- DBQ + LEQ AssignmentType, three-entry-point authoring (library / PDF /
  from scratch), DBQ Builder, student drafting surface with tutor coaching.
- Prompt Library seeded with curated APUSH DBQs and LEQs across the testable
  periods (1754–1980).
- Tutor with reasoning-skill detection, per-essay-type phase flow, and the
  named failure-mode detectors.
- GA scoring against the 7-point DBQ / 6-point LEQ rubrics with
  calibration-sample anchoring and errors-don't-subtract enforcement.
- Tutor coaching scopes beyond `full`: at minimum `thesis` (smallest scope,
  biggest pedagogical win, no documents required) and `sourcing` (DBQ-only,
  reuses existing document infrastructure). The other four scopes
  (`contextualization`, `evidence`, `doc-analysis`, `complexity`) follow once
  we have usage data telling us which matter most.
- Context Bank for APUSH testable periods (1754–1980).
- Single-essay grading mode + feedback snippet bank (private to the teacher
  at v1). Column-wise mode and blind grading toggle in v1 if scope allows;
  otherwise v1.1.
- Phase-structured timed mode in v1 if feasibility check confirms; otherwise
  thinner "60-minute clock without enforcement" v0 with the full
  phase-structured version following in v1.1.

**Out of v1:**

- AP Euro / AP World seed corpora and era taxonomies.
- Image-bearing source documents (maps, political cartoons). Library tags
  `mixed-media` so we can flip later.
- Community-contributed prompts; upvote-driven library sort.
- AI-synthesis of calibration samples for teacher-authored prompts.
- Cross-teacher / school-shared dedup on PDF uploads.
- Student-initiated ungraded practice on a library prompt their teacher
  hasn't assigned (revisit in v2).

## Domain model

New **AssignmentType: AP History Essay**, sitting alongside Daily Pages,
Narrative Essay, and the existing thesis-driven default. Inherits the unified
Assignment / AssignmentType model from
[`features/assignments-unification.md`](https://github.com/The-Connell-School/yawp-pm/blob/main/features/assignments-unification.md).

Each AP history essay assignment carries:

| Field | Type | Notes |
|---|---|---|
| `essayType` | `'dbq' \| 'leq'` | Branches rubric, tutor phases, builder, library facets. |
| `prompt` | rich text | The essay prompt body. |
| `period` | `'ap-ush' \| 'ap-euro' \| 'ap-world'` | v1: only `ap-ush` is populated; the other values exist on the enum but no library prompts ship for them. |
| `era` | string[] (period-scoped tag) | Multi-value. APUSH eras = the 7 testable College Board periods. |
| `reasoningSkill` | `'causation' \| 'comparison' \| 'continuity-and-change' \| 'periodization'` | Inferred from prompt verb on creation; teacher can override. Drives tutor coaching defaults. |
| `skillEmphasis` | enum[] | `complexity-heavy`, `sourcing-heavy` (DBQ), `contextualization-heavy`, `outside-evidence-heavy` (LEQ-relevant), `balanced`. |
| `dateWindow` | `{from: number, to: number}` | The prompt's date window (e.g. 1932–1970). For APUSH, soft-warns if outside 1754–1980. |
| `timeMode` | `'untimed' \| 'timed'` | DBQ default 60min (15 read + 45 write); LEQ default 40min. Overridable per assignment. |
| `coachingScope` | enum | `full` (default), `thesis`, `contextualization`, `evidence`, `doc-analysis` (DBQ-only), `sourcing` (DBQ-only), `complexity`. Narrows tutor focus. |
| `rubricRef` | discriminator | Resolves to the 7-point DBQ rubric or 6-point LEQ rubric. |
| `sources` | `DbqSource[]` (DBQ only) | Ordered, 5–7 entries. `null` for LEQ. |
| `calibrationSamples` | `{high, mid, low}` | Optional. Library prompts ship samples; teacher-authored default to none. |

`coachingScope` notes: `doc-analysis` and `sourcing` require a parent DBQ
(they reuse the document set); the rest apply to both essay types.
Diagnostic-driven recommendations on a graded full essay produce
narrowed-scope assignments matching the rubric points the student missed.

**Multi-prompt-per-assignment shape (open).** Some scopes batch 3–5 prompts
into one practice session (`thesis` and `complexity` especially). Two
candidate models: (a) a single Assignment with an ordered prompt list, or
(b) a small batch of one-prompt Assignments grouped by a parent. Affects
gradebook clutter and student flow — needs an engineering call before
schema lands.

## Rubrics

Both rubrics are stored as structured data per
[`differentiated-rubrics-by-assignment-type`](https://github.com/The-Connell-School/yawp-pm/blob/main/features/differentiated-rubrics-by-assignment-type.md).
The DBQ rubric is the canonical 7-point template; LEQ is the 6-point variant
sharing 4 of 7 row definitions.

**Philosophy (applies to both).** The rubric is **additive** — each point is
earned independently, errors don't subtract. The GA reflects this: a clunky
essay that hits each rubric move plainly outscores a beautifully written one
that doesn't. See PM doc for full per-row descriptors.

**DBQ rubric (7 points):** Thesis (1) · Contextualization (1) · Evidence —
Document Use I (1) · Evidence — Document Use II (1) · Evidence — Outside
Evidence (1) · Analysis & Reasoning — Sourcing (HIPP) (1) · Analysis &
Reasoning — Complexity (1).

**LEQ rubric (6 points):** Thesis (1) · Contextualization (1) · Evidence I
(1) · Evidence II (1) · Analysis & Reasoning — Historical reasoning (1) ·
Analysis & Reasoning — Complexity (1). No sourcing row; single Evidence
section instead of two; evidence comes from outside knowledge alone, which
makes the **Context Bank** load-bearing for LEQ.

The rubric is **tutor-internal during drafting**: students don't see
categories or point boxes as a panel. The tutor speaks in rubric vocabulary
without naming categories. The rubric becomes visible after submission, on
the GA's feedback panel.

## Tutor flow

Phases run in **soft sequence** (same shape as the narrative-essay tutor):
the tutor recommends what to do next, the student can skip ahead or jump
back, the tutor decides when to suggest moving on based on what's on the
page. No hard gates. Phase set branches on essay type.

The tutor opens both essay types by **decoding the prompt** to identify the
historical reasoning skill (causation, comparison, continuity-and-change,
periodization). The verb tells you which. The tutor surfaces the detected
skill and tailors coaching accordingly.

**DBQ phases (5):** source analysis → thesis → contextualization → drafting
→ revision.

**LEQ phases (4):** thesis → contextualization + evidence brainstorm
(combined, since there's no document-reading phase to ground the period in)
→ drafting → revision.

### Failure-mode detectors

A small set of named anti-pattern detectors run continuously (lightly during
untimed drafting; always at GA scoring time). Each maps 1:1 to a feedback
template the teacher can accept, edit, or override on the grading panel.

Detectors: thesis-restates-prompt · walking-through-documents ·
description-not-argument · HIPP-without-relevance · generic-context ·
generic-outside-evidence · period-bleed · outside-evidence-from-docs ·
buried-thesis · length-not-sophistication.

See PM doc for full descriptions and tutor responses.

### Timed vs. untimed mode

Real exam timing differs by essay type:

- **DBQ: 60 minutes total — 15 reading + 45 writing.**
- **LEQ: 40 minutes total, no separate reading phase.**

**Untimed practice (default).** Tutor coaches deeply through every phase.
Student can iterate, jump phases, restart paragraphs.

**Timed DBQ.** Two structurally distinct windows:
- **Reading phase (15 min).** Editor is **read-only**; student can highlight
  and annotate prompt + documents and write into the planning sidebar
  (outline, thesis draft, document groupings, outside-evidence brainstorm).
  Tutor is silent unless asked.
- **Writing phase (45 min).** Editor unlocks; planning sidebar persists.
  Tutor remains silent. Soft phase markers suggest paragraph time budgets
  but don't enforce.

**Timed LEQ.** Single 40-minute writing window with the planning sidebar
always available. Soft phase markers (decode → evidence brainstorm → thesis
+ outline → drafting → self-check). No reading-period read-only lock since
there's nothing to read.

**Submission (both types).** On clock-out or self-submit, the tutor and GA
deliver a **retrospective coaching pass**: rubric panel with each point
earned/not-earned, named failure-mode flags, suggested edits the student can
apply in an "untimed revision" follow-up if the teacher allows. Whether the
retrospective shows immediately or waits for grade release is a
per-assignment teacher choice.

**v1 scope decision.** Phase-structured timed mode is the high-leverage
version but also the bigger build. v1 ships phase-structured if engineering
feasibility confirms; otherwise we ship the thinner "clock with no
enforcement" v0 and follow with the full version in v1.1.

## File paths in `yawp-2.0`

Best-guess; engineering will refine.

- `services/web-app/app/routes/assignment-types/...` — AP History Essay
  AssignmentType view, authoring entry-picker, library section, settings.
- `services/web-app/app/components/document/...` — DBQ-aware drafting
  surface: source viewer, citation chips, planning sidebar, coach panel.
- `services/web-app/app/components/dbq-builder/...` (new) — entry-picker,
  structured editor, side-by-side PDF review.
- `services/web-app/app/routes/upload/...` — endpoint for PDF intake
  (or new dedicated route).
- `services/web-app/app/components/grading/...` — 7-point and 6-point
  rubric panels, GA draft state, per-point overrides.
- `services/web-app/app/components/grading/column-mode/...` (new) —
  column-wise class-set grading view.
- `services/web-app/app/components/library/...` — shared library shell with
  Daily Pages; AP-history-specific facet config.
- `services/web-app/app/components/context-bank/...` (new) — period
  reference, student tab, teacher-extension UI.
- `services/web-app/app/components/timed-mode/...` (new) — phase markers,
  reading-only enforcement, planning sidebar.
- `packages/db/...` — AssignmentType discriminator, `DbqSource`, `DbqDraft`,
  `TimedSession`, `Drill`, `ContextBank`, `FeedbackSnippet`,
  `DbqCalibrationSample`, library table.
- `packages/domain/...` — DBQ + LEQ business logic, GA rubric scoring,
  reasoning-skill detection.
- `packages/tutor/...` — phase machines (DBQ + LEQ), coaching prompts,
  failure-mode detectors, scope-narrowing for drill modes.
- `packages/dbq-parser/...` (new) — PDF intake, document splitting,
  attribution extraction, per-source confidence flags.
- `packages/dbq-grader/...` (new, or extension of GA) — 7-point and 6-point
  rubric scoring, calibration-sample anchoring, errors-don't-subtract
  enforcement.

(No separate drill components — drills run on the existing
Document-with-tutor surface; the tutor reads `coachingScope` from the
assignment and adjusts behavior.)

## Data model implications

- `AssignmentType.kind = 'ap-history-essay'` with the per-assignment payload
  enumerated in [Domain model](#domain-model). `essayType` discriminates
  rubric and source-set presence within the kind.
- `DbqSource`: ordered list with `title`, `attribution`, `body`, optional
  `caption`, optional `image`. JSON column or relational table — call to
  make at schema time.
- `DbqDraft`: in-progress builder sessions, especially PDF-parsed drafts not
  yet confirmed. Holds parsed payload, original PDF reference, per-source
  confidence flags. Discarded on save-or-cancel.
- Original uploaded PDFs need a storage location (S3 or equivalent) — kept
  through assignment lifetime so side-by-side review works for re-edits.
- `Assignment.timeMode`: `'untimed' | 'timed'`, overridable per assignment
  instance.
- `DbqCalibrationSample`: tied to an AssignmentType row, holds three samples
  (high/mid/low) with score and rubric-point annotations. Used by GA at
  scoring time and surfaced in calibration drawers.
- `Drill`: `kind`, `sourceDbqId` (optional), `studentId`, `output`,
  `tutorFeedback`, `completedAt`. Drills are short and high-frequency —
  index for fast student-side listing.
- `ContextBank`: per period, ordered list of anchor entries (`name`,
  `category`: `person | law | event | court-case | movement`, `summary`,
  `dateOrRange`). Read-only at the global tier; school-scoped extensions
  live in a separate join table.
- `FeedbackSnippet`: per teacher, per rubric category, body text. Surfaced
  in the grading panel snippet picker. School-scoped sharing is v2.
- `TimedSession`: phase (`reading | writing | submitted`), `startedAt`,
  `phaseTransitionedAt`, `submittedAt`, annotations + planning-sidebar
  contents persisted alongside the document body. Lets the GA's
  retrospective coaching pass reason about what the student did during
  reading vs. writing.
- Rubric stored as structured data (depends on
  `differentiated-rubrics-by-assignment-type`); DBQ 7-point and LEQ 6-point
  are canonical templates.
- AP History Essay Library: separate table from AssignmentType, joined for
  runtime stats. Mirrors Daily Pages library schema for consistency.

**Backward-compat.** Existing AssignmentTypes get `kind = 'standard'` via
dual-write/backfill. No destructive migration. New fields are additive.

**Versioning question.** When a teacher edits an AP-history AssignmentType
after it's been assigned, do in-flight student documents see the change, or
are they version-locked? Same question Daily Pages and Narrative Essay
raise; resolve consistently across all three before this lands.

## UX (engineering-relevant)

PM doc carries the full UX prose and ASCII sketches. The engineering-shaped
points:

- **Authoring entry-picker** is a first step *before* the builder, since AP
  essays carry too much structured payload for a one-pane form. Three paths
  (library / PDF / from scratch) all converge into the same builder; the
  builder doesn't care which path it arrived from.
- **PDF upload path is first-class.** Re-typing a 7-source DBQ into a form
  is a non-starter. The parser splits documents at numbered/lettered
  headers, extracts attribution lines and bodies, and infers period when
  possible. Side-by-side PDF preview during review is non-negotiable.
- **Two-mode student drafting (DBQ).** Reading mode (docs are the canvas) +
  Writing mode (editor is the canvas, with a thin doc rail and inline
  citation chips). Citation chips that hover-to-expand are the writing-time
  superpower — the editor itself becomes the doc-navigation surface.
- **LEQ student drafting** is just editor + planning sidebar (with the
  period context bank pinnable) + collapsible coach. No doc rail, no
  two-mode split, no citation chips. Closer to a standard Yawp essay
  shape.
- **Teacher grading** has three modes: single-essay (default, with rubric
  panel + feedback snippet bank + calibration drawer), column-wise (grade
  one rubric category across all essays before moving to the next), and a
  blind-grading toggle that hides student names. Column-wise + blind toggle
  are v1-if-scope-allows.

## Test plan

To be written. Will reference existing patterns in
`services/web-app/app/routes/__tests__` and the AssignmentType test
fixtures once the schema discriminator lands. Coverage targets at minimum:

- AssignmentType creation (all three entry paths) for both DBQ and LEQ.
- Tutor phase progression for DBQ (5 phases) and LEQ (4 phases) including
  jump-ahead and jump-back.
- Failure-mode detector unit coverage — each detector hits a positive and
  negative fixture.
- GA rubric scoring fixtures: known-good high/mid/low essays for DBQ and
  LEQ score within ±1 point of the calibration sample.
- Timed mode: reading-phase editor lock, planning sidebar persistence,
  auto-submit at clock-out.
- PDF parser: a corpus of 5+ College Board released DBQs parses with all
  documents extracted; mixed prep-book PDFs flag low-confidence sources
  rather than silently dropping them.
- Backward-compat: existing AssignmentType fixtures continue to load with
  `kind = 'standard'`.

## Rollout

Feature flag (`dbq_assignment_type`). Default off.

**Pilot order (APUSH):**
1. UA professor — highest volume, single course, fastest feedback loop.
2. Washington.
3. Birmingham City.

Big-bang within a school once enabled — teachers need it consistently
across sections.

**AP Euro and AP World** launch later with their own research-backed
material, in the same shape.

## Engineering handoff checklist

- [x] Domain context covered (links back to PM doc for problem/goals)
- [x] File paths in `yawp-2.0` listed
- [x] Data model implications spelled out, including backward-compat plan
- [x] UX summary in prose (full sketches in PM doc)
- [ ] Edge cases enumerated (see PM doc; needs an engineering pass to
      classify which are blocking-for-v1 vs. follow-up)
- [ ] Test plan written (placeholder above; firms up once schema lands)
- [x] Rollout plan decided (APUSH-first, flagged, three-school pilot)

## Open questions tracked elsewhere

The PM doc owns all open questions (v1 scope decisions, multi-prompt shape,
calibration-sample sourcing, parser quality bar, copyright, etc.). When an
open question is decided, that decision lands in the PM doc first; this
spec then updates to reflect the engineering implication.
