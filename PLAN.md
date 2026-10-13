# qa-regression-loop plan

1. Confirm the platform worktree is fresh from `origin/main` on `codex/qa-regression-loop-20261013` and keep all changes limited to QA artifacts, test evidence, or local runner documentation.
2. Locate the free-tier demo E2E suite runner/config added by `qa-suite-ci`, plus any focused specs for the seeded repros `qa-dup-create-link`, `qa-approve-409`, and `qa-flag-vs-route`.
3. Run the available free-tier demo suite with `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright`, using hosted demo credentials only if already configured and taking the clean skip path when auth is absent.
4. Reconcile `/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/FAILURES.md`, `/home/bryant/work/yawp/codex-loop/lanes/free-tier-fixes/BACKLOG.md`, and `/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/STATUS.md` only from observed pass/fail evidence.
5. Preserve run output and screenshots under `/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-regression-loop/`, then commit, push, open the platform PR, and write the required lane `state/BUILD_RESULT.md`.
