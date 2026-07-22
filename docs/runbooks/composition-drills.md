# Composition Drills Runbook

Issue: #214

## Scope

Composition Drills adds constructed-response practice for exactly four skills:
Topic Sentences, Paragraph Transitions, Evidence, and Analysis. The existing
Grammar & Mechanics ACT path remains unchanged.

## Enablement

Composition requires both organization columns to be true:

1. `writingFundamentalsEnabled`
2. `compositionDrillsEnabled`

The new organization column defaults to false. An administrator can enable it
only while Writing Fundamentals is enabled. `COMPOSITION_DRILLS_ENABLED=false`
is a process-wide emergency kill switch; any other value merely defers to the
tenant column and cannot turn a tenant on.

Before enabling a tenant, a curriculum owner must review the authored examples
and tutor-feedback calibration. That human review is the only remaining
curriculum release marker; it does not block engineering or QA.

## Verification

From `services/web-app`, with the target database environment loaded:

```sh
bun run typecheck
bun run build
bun run proof:composition-anthropic
E2E_PORT=5174 bunx playwright test --project=chromium e2e/tests/writing-lessons-composition.spec.ts
```

The provider proof starts a real Anthropic-compatible HTTP server and points
the unchanged Anthropic SDK at it. It verifies request shape, deterministic
success, malformed output, transient retry recovery, exhausted-retry fallback,
and metadata-only `LlmLog` persistence.

## Data and privacy invariants

- Assignment-list payloads include skill metadata and progress counts only.
- Assigned actions resolve kind, position, lesson, and prompt against the
  server-owned stored sequence.
- Composition revisions are append-only and idempotent for an identical
  normalized response.
- Student responses are stored in tenant-constrained practice attempts for
  student history and teacher reporting; they are never copied into `LlmLog`.
- Read-only preview and impersonation cannot initialize or submit practice.

## Rollback

Set `COMPOSITION_DRILLS_ENABLED=false` for an immediate global stop, or disable
`compositionDrillsEnabled` for one organization. Either path hides Composition
library metadata, direct routes, assignment controls, active assignments, and
teacher results without deleting prompt sets or attempts. Re-enabling restores
the same durable revision history.
