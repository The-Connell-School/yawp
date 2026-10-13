# PLAN

slug: qa-caps-limits
branch: codex/qa-caps-limits-20261013
repo: platform
scope: Playwright / e2e tests and runner docs only

## Goal
Add focused free-tier demo guardrail coverage for caps/limits, missing or invalid scan cookies, duplicate-safe abuse/rate limiting, and hosted demo skip behavior.

## Implementation
- Add a focused Playwright spec under `services/web-app/e2e/tests/` following the existing free-tier local demo stand-in pattern.
- Seed disposable local acquisition tokens directly through the E2E database and clean them up in `finally` blocks.
- Capture screenshots and text artifacts under `QA_SCREENSHOT_DIR`, defaulting to `~/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-caps-limits`.
- Cover:
  - exhausted max-use token link renders friendly closed-link copy, returns no HTTP 500, and does not create/approve an application;
  - missing, cleared, and invalid `__yawp_ft_scan` cookies through `/free?t=` recover gracefully and maintain deduped scan behavior;
  - repeated duplicate submissions are duplicate-safe and excessive submissions surface friendly rate-limit copy without stack traces;
  - hosted demo path skips cleanly with `hosted-demo-skip.txt` unless explicit disposable hosted env/access is provided.
- Add a narrow Playwright config/runner doc if needed so CI/local can run this spec directly.

## Verification
- Run the focused Playwright command with `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright` and `QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-caps-limits`.
- Run the narrowest relevant typecheck/check available for touched files; document any blocker.
- If any confirmed product failure appears, append `FAILURES.md` and file/prep the fixes backlog item.
