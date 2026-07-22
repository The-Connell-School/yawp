# AI behavior eval lab design (#216)

## Decision

Port the smallest safe idea from #207—immutable prompt versions, versioned evaluation runs, gated promotion, and rollback—onto the current Summer branch. Do not transplant #207's 12k-line grading-only workbench because it predates the consolidated release, AP History snapshots, composition drills, LTI work, tenant hardening, and current grading context audits.

The resulting lab governs both tutor and grading surfaces with one compact server contract and one assignment-type admin screen.

## Runtime contract

Every tutor or grading request compiles from four trusted inputs:

1. the assignment's immutable context snapshot (assignment prompt, assignment-type grading version, rubric snapshot/hash);
2. the immutable production prompt version for that assignment type and surface, or the canonical built-in fallback when no version has been promoted;
3. the current immutable student submission/document snapshot;
4. bounded runtime state (module/step, strictness, reading level, student first name).

The client cannot supply assignment prompt, rubric, rubric version, or prompt-version identifiers. Tutor and grader log only hashes, lengths, identifiers, timing, and token counts; student/prompt/provider payloads are metadata-only. Tutor history no longer duplicates the full document in each message row.

## Persistence

`AssignmentTypePromptVersion` stores assignment type, surface (`tutor` or `grading`), monotonically increasing version, draft/production/retired status, immutable templates, variable schema, content hash, author, source, promotion run, and rollback target.

`AssignmentTypeEvaluationRun` stores the exact candidate prompt hash, paired production/fallback prompt snapshot, suite version/snapshot, per-case status and observability metadata, aggregate pass/fail/review counts, runner identity, and completion time. Evaluation inputs are synthetic and code-versioned; no production student records enter the lab.

`Assignment.aiContextSnapshot` freezes the assignment prompt, grading version, and rubric at assignment creation. Legacy assignments fall back to a clearly marked live-config snapshot. `SubmissionGradingAssistantRun` stores the exact prompt version/snapshot used so old in-flight work remains reproducible after promotion.

## Evaluation suite

The code-versioned suite covers:

- assignment-context visibility and the historical false “missing assignment” claim;
- thesis and conclusion feedback;
- beginner versus advanced strictness;
- grade-appropriate tutor language and over-praise avoidance;
- tutor/grader agreement on shared rubric/prompt context;
- prompt injection resistance;
- a bounded long document;
- malformed output, provider 500/429, connection drop, and latency/cost metadata.

The runner calls the unchanged provider client over HTTP. Deterministic network servers supply protocol-accurate responses for automated proof. Promotion requires a clean run for the exact content hash plus explicit calibration review. Failed, stale, incomplete, or unreviewed runs cannot promote.

## Admin workflow

From an assignment type, an admin opens “AI behavior lab,” creates a tutor or grading draft from the current production/fallback prompt, edits controlled templates, runs the full suite, records calibration review, promotes only a clean current run, and can roll back to the previous evaluated version (or the built-in fallback for the first promotion).

The lab is default-off in production behind `AI_BEHAVIOR_EVAL_LAB_ENABLED`; runtime use of already promoted versions remains deterministic. Disabling the lab prevents mutations, not safe rollback/fallback reads.

## Human markers

A real teacher still reviews the small calibration set and production rollout decision. The system, tests, sample cases, review action, and promotion block are implemented now; no engineering work waits on that marker.
