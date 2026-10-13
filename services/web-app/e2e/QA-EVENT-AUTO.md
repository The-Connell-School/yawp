# qa-event-auto runner

Focused coverage for the demo free-tier event auto-admit path lives in:

```bash
services/web-app/e2e/tests/free-tier.event-auto-admit.spec.ts
```

Local faithful demo stand-in:

```bash
cd services/web-app
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/shots/qa-event-auto \
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
bunx playwright test --config=playwright.free-tier-event-auto.config.ts
```

If the top-level `codex-loop/shots` directory is not writable in the local sandbox, use:

```bash
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-event-auto
```

Hosted demo run inputs, when available:

```bash
DEMO_FREE_TIER_BASE_URL=https://demo.yawp.school
DEMO_FREE_TIER_EVENT_TOKEN=<event code from Internal demo>
DEMO_FREE_TIER_JOIN_TOKEN=<release link token for the created application>
```

When hosted demo access is missing, the suite writes `hosted-demo-skip.txt` in the screenshot directory and skips that hosted-only check cleanly.
