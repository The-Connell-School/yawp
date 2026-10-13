# Free Tier Event Waitlist Copy Regression

Focused local repro:

```bash
FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-waitlist-copy-fix-verify-rerun \
PW_EXECUTABLE_PATH=/home/bryant/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
bunx playwright test --config=playwright.free-tier-qa.config.ts --project=chromium e2e/tests/free-tier.event-waitlist-copy-regression.spec.ts
```

Hosted demo is intentionally inert unless a disposable fixture is supplied:

```bash
FREE_TIER_QA_HOSTED_DEMO_URL=https://demo.yawp.school \
FREE_TIER_QA_HOSTED_DEMO_EVENT_TOKEN=<disposable-non-bypass-event-token> \
FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-waitlist-copy-fix-verify-rerun \
bunx playwright test --config=playwright.free-tier-qa.config.ts --project=chromium e2e/tests/free-tier.event-waitlist-copy-regression.spec.ts -g "hosted demo"
```

The hosted path only submits when `FREE_TIER_QA_HOSTED_DEMO_SUBMIT=true` and
`FREE_TIER_QA_HOSTED_DEMO_EMAIL` is present.
