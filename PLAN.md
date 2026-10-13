# qa-regression-loop-review

## Scope
- Platform-only suite hygiene from a fresh `origin/main` branch.
- Reuse the existing free-tier demo E2E runner from the `qa-suite-ci` work.
- Land only test/repro infrastructure and evidence docs; no product behavior changes.

## Steps
- Add the durable free-tier demo suite runner/config/docs to this branch.
- Run the manifest/list path and hosted demo skip path without disposable demo access.
- Run the available local deterministic Playwright coverage with cached browsers.
- Store fresh evidence under `/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-regression-loop-review/`.
- File `FAILURES.md` and free-tier-fixes `P0b` only if a new regression is observed.
