# qa-repeat-signup plan

## Scope

- Add platform Playwright coverage for repeat free-tier sign-ups through `/free?t=<code>`.
- Keep changes test-only: focused e2e spec, focused Playwright config, and runner documentation.
- Use the existing local faithful demo stand-in pattern from the free-tier QA e2e suites.
- Do not rotate secrets, send real email, change product behavior, deploy, or touch production.

## Test design

- Create an isolated bypass-waitlist acquisition token in the e2e database.
- Submit the public event-link form once and assert a single invited application is created.
- Revisit the same event link in the same browser context with the same email and assert:
  - no 500 or stack trace appears,
  - application count for that email remains one,
  - token use count does not burn a second use.
- Submit again from a fresh cookie-cleared context with the same email and assert the same database invariants.
- Submit once more from a fresh context with the same email in uppercase form to verify normalized same-email reuse cannot mint a second active enrollment.
- Capture screenshots and text evidence under `QA_SCREENSHOT_DIR`, defaulting to `/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-repeat-signup`.
- Include a hosted demo check that writes `hosted-demo-skip.txt` unless disposable hosted demo fixtures are present.

## Validation

- Run:
  `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-repeat-signup bunx playwright test --config=playwright.free-tier-repeat-signup.config.ts`
- Run focused typecheck if practical; document blockers in `BUILD_RESULT.md`.
