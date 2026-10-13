# qa-known-failure-dedupe-audit

1. Bring the existing free-tier demo QA runner/helper files from the latest suite-maintenance QA branch onto a fresh `origin/main` branch, keeping this change test/repro-only.
2. Add focused failure-filing contract coverage for the already-filed waitlist-copy condition so reruns do not append duplicate `FAILURES.md` sections or duplicate fixes-lane `P0b` snippets.
3. Preserve the seeded repro manifest enforcement and hosted demo skip artifacts in the runner tests.
4. Run the narrowest helper/runner tests with bounded resources, then push and open a platform PR.
