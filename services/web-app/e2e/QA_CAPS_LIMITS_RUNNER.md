# Free-Tier Caps/Limits QA Runner

Run the local faithful demo stand-in:

```bash
cd services/web-app
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-caps-limits \
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
bunx playwright test --config=playwright.free-tier-caps-limits.config.ts
```

Hosted demo checks intentionally skip unless disposable fixture env is provided:

```bash
DEMO_FREE_TIER_BASE_URL=https://demo.yawp.school \
DEMO_FREE_TIER_CAPS_EVENT_TOKEN=... \
DEMO_FREE_TIER_COOKIE_EVENT_TOKEN=... \
DEMO_FREE_TIER_ABUSE_EMAIL=... \
DEMO_FREE_TIER_DISPOSABLE_OK=1 \
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-caps-limits \
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
bunx playwright test --config=playwright.free-tier-caps-limits.config.ts
```

Until resettable hosted demo fixtures exist, the suite records `hosted-demo-skip.txt` and avoids mutating hosted demo data.
