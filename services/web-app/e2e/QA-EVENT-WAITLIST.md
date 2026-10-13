# qa-event-waitlist runner

Focused coverage for demo free-tier event links in waitlist mode lives in:

```bash
services/web-app/e2e/tests/free-tier.event-waitlist.spec.ts
```

Local faithful demo stand-in:

```bash
cd services/web-app
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-fixes/shots/qa-event-waitlist \
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
bunx playwright test --config=playwright.free-tier-event-waitlist.config.ts
```

The local run seeds a non-bypass event link, submits a unique applicant, verifies the waitlist row, performs release through the internal release endpoint with an e2e-only management key, reads the captured local release email payload, and exercises the join/account-created path.

Hosted demo inputs, when available:

```bash
DEMO_FREE_TIER_BASE_URL=https://demo.yawp.school
DEMO_FREE_TIER_WAITLIST_EVENT_TOKEN=<non-bypass event code from Internal demo>
DEMO_FREE_TIER_RELEASE_OPERATOR_ACCESS=<dedicated hosted demo release fixture/access marker>
```

Hosted demo assertions are intentionally skipped in this PR until there is a dedicated disposable event/application fixture contract for demo. The suite writes `hosted-demo-skip.txt` in the screenshot directory and skips the hosted-only check cleanly.
