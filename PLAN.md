# qa-student-signin Plan

## Scope

- Add focused platform Playwright coverage for free-tier student handle account setup and sign-in behavior.
- Keep the suite change to tests/repro only.
- Use a local faithful demo stand-in by seeding disposable free-tier organization, teacher, class, and join-token data.
- Add a hosted demo guard/runner note that skips unless explicit disposable demo fixture environment is provided.

## Implementation

- Reuse `services/web-app/e2e/tests/auth.free-tier-handle-join.spec.ts` patterns for handle creation, sign-in, and cleanup.
- Add screenshot capture controlled by `QA_SCREENSHOT_DIR`.
- Assert:
  - first released/joinable applicant creates a unique handle and password;
  - sign-out then sign-in with the handle reaches the student surface tied to the expected free-tier membership/class;
  - wrong password remains unauthenticated;
  - second applicant cannot reuse the handle;
  - duplicate user/account side effects are absent.
- Add a small hosted demo spec that writes a skip artifact when disposable demo env vars are missing.

## Verification

- Run the focused Playwright spec from `services/web-app` with:
  `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-student-signin bunx playwright test e2e/tests/auth.free-tier-student-signin.spec.ts --project=chromium`
- Run any hosted demo guard spec if added.
- Document skipped hosted demo credentials/fixtures in `state/BUILD_RESULT.md`.
