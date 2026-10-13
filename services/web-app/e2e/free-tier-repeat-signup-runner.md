# Free-Tier Repeat Sign-Up QA Runner

This QA suite exercises repeat sign-up behavior for demo free-tier event links through a local faithful demo stand-in.

Run from `services/web-app`:

```bash
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-repeat-signup \
XDG_CACHE_HOME=/tmp/.cache \
BUN_TMPDIR=/tmp \
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
bunx playwright test --config=playwright.free-tier-repeat-signup.config.ts
```

If the installed Playwright package expects a browser revision that is not present in the lane cache, point Playwright at an existing cached Chromium binary:

```bash
PW_EXECUTABLE_PATH=/home/bryant/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell
```

Hosted demo assertions are currently documented as a clean skip unless these disposable fixture variables exist:

- `DEMO_FREE_TIER_BASE_URL`
- `DEMO_FREE_TIER_REPEAT_EVENT_TOKEN`

The suite writes screenshots, hosted skip notes, and repeat-submission database evidence to `QA_SCREENSHOT_DIR`.
