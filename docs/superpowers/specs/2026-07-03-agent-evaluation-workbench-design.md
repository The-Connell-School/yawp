# Agent Evaluation Workbench Design

Date: 2026-07-03
Status: Implementation slice
Owner: Yawp product/engineering

## Summary

Yawp needs an internal admin workbench for testing and versioning the AI behavior governed by assignment types. The existing June 24 `ai-evaluation-benchmarks` design is the right north star: assignment type rubric/configuration is the educational contract, and tutor plus grading assistant behavior must be traceable to the exact contract version used.

This slice implements the foundation:

- immutable assignment type AI snapshots after admin edits,
- history recording for rubric, grading assistant, tutor module, and tutor instruction changes,
- admin-visible version history,
- a workbench route that can run tutor/grading test cases against the selected assignment type without needing Kevin to fight local or preview data.

## Source Evidence

- Kevin, June 27 email thread `Two Requests`: he asked for preview environments and specifically asked whether he could start testing grading assistant rigor.
- Brian, July 3 reply in the same thread: he wants Kevin to have room to develop while Brian is away.
- Brian Google Docs comments, June 18/29: update thesis-driven GA with the new rubric, change category scale to `0-5` with `0 = Absent`, and make the tutor use assignment context, especially prewriting.
- Granola, June 29 `Tutor feedback loops and grading rubric refinements`: give Kevin a playground to tweak tutor prompting for quick iterative feedback; rubric is now tied to assignment type; tutor should not become a 24-point checklist; longer-term labeled conversation data matters.
- Granola, June 22 `Assignment builder and grading assistant`: test the same essay across beginner/intermediate/advanced strictness; tutor and grading assistant must align against the same rubric.
- Granola, June 17 `Thesis-driven essay grading`: rubric should be source of truth for both tutor and grading assistant; analyze exactly what content is sent to AI for each message.

## Bigger Architecture

The product wants an AI evaluation loop, not a one-off admin test form:

1. Admin edits rubric, grading instructions, module alignment, or tutor instructions.
2. The app stores an immutable snapshot of the full assignment-type AI contract.
3. Admin/Kevin can run tutor and grading test cases against that snapshot.
4. Results can be compared against previous snapshots.
5. Bad production AI traces can later be promoted into benchmark fixtures.
6. If the tutor or grading assistant regresses, admin can inspect exactly which contract changed and revert manually or publish a prior snapshot as the new draft.

## Scope For This Slice

- Add an append-only `AssignmentTypeAiVersion` table.
- Snapshot current assignment type rubric, scoring scale, grading prompt config, output schema, calibration notes, module instructions, instruction-level tutor prompts, buttons, and module rubric alignment.
- Record a new snapshot after admin changes to:
  - assignment type rubric/grading config,
  - module tutor instructions or rubric alignment,
  - instruction prompts, tutor instructions, buttons, order, creation, and deletion.
- Show recent snapshots on the assignment type admin detail page.
- Add an admin workbench link from the assignment type page.
- Use existing LLM wrappers and deterministic fixture mode for tests; no new provider integration.

## Non-Goals

- Do not replace current assignment type editing.
- Do not block production publishes on benchmark results yet.
- Do not expose this to teachers or students.
- Do not migrate live assignments to pinned version ids in this slice.
- Do not build full candidate-vs-baseline benchmark comparison yet.

## Safety

This is additive and admin-only. Existing assignment type, tutor, and grading flows continue reading their current tables. History snapshots are audit/replay infrastructure and do not change runtime behavior until a later pinned-version rollout.

## Test Plan

- Unit: snapshot builder serializes rubric/grading/module/instruction state deterministically.
- Unit: unchanged irrelevant fields do not create malformed snapshots.
- Route: assignment type update creates a new AI history version.
- Route: module update creates a new AI history version with module and rubric alignment state.
- Route: instruction changes create a new AI history version.
- Route: history loader returns newest snapshots.
- E2E: admin sees a version history/workbench entry point on the assignment type page.

