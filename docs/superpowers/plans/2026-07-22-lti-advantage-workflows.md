# LTI Advantage Workflow Implementation Plan

Issue: #213

1. Add tenant-anchored persistence for course service bindings, Deep Linking
   requests/placements, LMS-managed roster enrollments, sync runs, and grade
   outbox events, with guarded migration checks.
2. Add a versioned tool signing-key loader and public tool JWKS endpoint.
3. Extend login/launch orchestration for one-time teacher Deep Linking and
   resource-placement binding without weakening #212 launch controls.
4. Implement provider-neutral NRPS reconciliation and AGS line-item/score
   services with database locks, idempotency, bounded retry, dead-letter, audit,
   and redacted diagnostics.
5. Enqueue released grades after the existing release transaction; never make
   student visibility depend on LMS availability.
6. Add teacher/admin routes for placement, sync, diagnostics, and recovery.
7. Extend the independent HTTP mock and deterministic seeds to prove placement,
   add/update/drop/duplicate/conflict, learner launch, completion, teacher
   release, retry/revocation, and LMS gradebook receipt.
8. Add the runbook, migration preflight/postcheck, focused and broad tests,
   typecheck/build/browser evidence, review evidence, and GitHub issue writeback.
