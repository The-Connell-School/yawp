# AI behavior eval lab implementation plan

1. Add prompt-version, evaluation-run, assignment-context, and grading-run snapshot persistence with additive migration coverage.
2. Add controlled tutor/grader template compilers, validators, canonical fallbacks, hashes, and immutable runtime resolution.
3. Snapshot trusted assignment prompt/rubric/version at assignment creation; retain explicit legacy fallback behavior.
4. Send the same trusted assignment/rubric snapshot to tutor and grader, attach exact hash/version metadata, and switch sensitive LLM calls to metadata-only logging.
5. Add synthetic evaluation cases and a runner for context, thesis/conclusion, reading level, strictness, consistency, injection, long documents, and provider failure/latency.
6. Add server-side draft, evaluation, calibration-review, promotion, and rollback rules with stale/failed/cross-assignment rejection tests.
7. Add the bounded admin lab UI and assignment-type entry point behind the default-off mutation gate.
8. Add deterministic network server fixtures and a repeatable backend proof; add focused browser coverage without product-code mock branches.
9. Run migration, unit, type, browser, provider, privacy, tenant, rollback, review, and evidence-pack gates; commit locally and mark real-teacher/rollout review on #216.
