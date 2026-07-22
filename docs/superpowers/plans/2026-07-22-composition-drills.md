# Composition Drills Implementation Plan

Issue: #214

1. Audit PR #206 against the consolidated branch and document excluded scope.
2. Add the default-off organization gate, migration invariants, admin control,
   seed support, and rollback checks.
3. Add section/kind metadata and authored lessons for Topic Sentences,
   Paragraph Transitions, Evidence, and Analysis.
4. Add constructed-response self-practice with bounded tutor feedback and
   deterministic degraded behavior.
5. Extend teacher assignment, student completion/revision, durable attempts,
   progress summaries, and teacher results without changing ACT behavior.
6. Prove assignment payload secrecy, tenant isolation, replay/idempotency,
   feature disablement, and Reporter-compatible result access.
7. Prove the tutor at the actual network boundary with a deterministic
   Anthropic-compatible server and outage/malformed/retry scenarios.
8. Run focused unit/database/browser/mobile/accessibility tests, typecheck,
   build, migration checks, and record the human curriculum/release markers.
