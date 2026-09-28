### Release Gate Core Rules (exactly 14, all testable)

1) Server-side flags for new behavior
- Any new or changed user-visible behavior must be protected by a server-side per-organization boolean (e.g. `Organization.writingPracticeEnabled`). UI-only gates do not count. Server routes/actions must deny before expensive work when the flag is off.

2) Additive, reversible migrations
- Schema changes are forward-additive and reversible. No destructive `DROP` or `ALTER … DROP`. Data rewrites are prohibited for scores/grades/rubric linkage.

3) Assignment rubric/scale immutability
- An assignment stays locked to the rubric and scoring scale with which it was created. “Basics-only” edits must preserve exact legacy grading JSON and must not increment `gradingAssistantVersion`.

4) Trust the session, not the client
- Never trust client-supplied org/class/user IDs. Resolve organization/class/membership from the authenticated session and enforce ownership/role checks on every server action and loader.

5) Legacy-compat safe reads
- Legacy or partially populated records must not crash new code. New loaders/resolvers handle nulls/missing fields with safe fallbacks; runtime checks guard optional paths.

6) Bounded AI calls with visible cost
- All AI requests set explicit model, max tokens, timeout, and limited retries. Capture a lightweight per-class cost note (tokens/cents) in logs/metrics.

7) Rollback is written and runnable
- Every risky change includes a concrete rollback plan and a runnable step (flag off, revert, or script) that restores the prior behavior without data loss.

8) Tests exist for each identified risk
- For each risk in this PR, there is at least one unit/integration/E2E test. Do not weaken existing assertions to make regressions pass.

9) Prompt/rubric versioning
- Any prompt/rubric shape or behavior change increments the owning version and persists a matching snapshot. Unchanged saves retain the prior version and snapshots exactly.

10) Gate checks live on the server boundary
- New or modified server routes/actions that touch gated features must reference the server-side flag check in the same file or called guard, prior to performing DB/AI work.

11) Persist relationships, don’t copy resolved config
- Library rubric selection persists a `rubricId` relationship (plus explicit snapshots) and must not copy resolved library JSON into legacy columns. Clearing a selection preserves the assignment’s own prompt configuration.

12) Ownership is enforced on reads and writes
- When referencing organization-scoped resources (classes, assignments, rubrics), look up by id and verify organization ownership from the session before proceeding.

13) No UPDATEs on grade/score/rubric tables outside controlled backfills
- Application code and normal migrations must not `UPDATE` rows in grade/score/rubric linkage tables. Controlled, idempotent backfills require their own gate and snapshots; this release gate flags any such UPDATEs.

14) PR hygiene and gates are mandatory
- PR body contains “Risks:” and “Rollback:”. Tests changed alongside source. Gate verdict file (if present) reports zero blockers/majors. Branch is up-to-date with `main`. All CI for the head commit is green.

How these map to checks
- The release gate enforces 1, 2, 8, 10, 13, and 14 mechanically.
- Rule 3, 5, 6, 7, 9, 11, and 12 are enforced via targeted tests you must include with this PR.

