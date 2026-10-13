## Plan

1. Restore the durable free-tier demo QA suite contract from the existing lane work: runner, Playwright config, seeded repro specs, helper tests, and docs only.
2. Verify the suite manifest/list output includes the required seeded repro specs and that hosted demo mutation paths skip unless explicit disposable fixture and mutation opt-in env are present.
3. Run narrow runner/helper contract tests for manifest/list, missing required specs, hosted skip artifacts, and known-failure dedupe behavior.
4. Capture suite manifest and skip artifacts under the lane shots directory.
5. Run typecheck if dependencies are available; document any environment/tooling blockers without changing product behavior.
6. Address review: make suite skip evidence appear when hosted access exists but disposable mutation opt-ins are absent, and align the student hosted fixture env list with the focused student sign-in guard.
