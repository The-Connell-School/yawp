# Free-Tier Disabled/Expired Event Link QA Runner

This QA suite exercises demo free-tier event-link rejection through the local faithful demo stand-in.

Run from `services/web-app`:

```bash
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-disabled-expired \
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
bunx playwright test --config=playwright.free-tier-disabled-expired.config.ts
```

Hosted demo assertions are currently documented as a clean skip unless these disposable fixture variables exist:

- `DEMO_FREE_TIER_BASE_URL`
- `DEMO_FREE_TIER_DISABLED_EVENT_TOKEN`
- `DEMO_FREE_TIER_EXPIRED_EVENT_TOKEN`
- `DEMO_FREE_TIER_DISABLED_AT_EVENT_TOKEN`

The suite writes screenshots and scan evidence to `QA_SCREENSHOT_DIR`, including `hosted-demo-skip.txt` when hosted demo access is unavailable.
