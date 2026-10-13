# QA Student Sign-In Runner

Focused local stand-in:

```bash
cd services/web-app
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
E2E_WEB_PORT=5174 \
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-student-signin \
bunx playwright test e2e/tests/auth.free-tier-student-signin.spec.ts --project=chromium
```

Hosted demo run:

```bash
cd services/web-app
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
E2E_WEB_PORT=5174 \
QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-student-signin \
QA_DEMO_BASE_URL=https://<demo-host> \
QA_DEMO_STUDENT_JOIN_TOKEN_ONE=<disposable-demo-join-token-1> \
QA_DEMO_STUDENT_JOIN_TOKEN_TWO=<disposable-demo-join-token-2> \
bunx playwright test e2e/tests/auth.free-tier-student-signin.spec.ts --project=chromium --grep "hosted demo"
```

If any hosted demo variable is missing, the hosted demo test skips cleanly and writes
`hosted-demo-skip.txt` to `QA_SCREENSHOT_DIR`.
