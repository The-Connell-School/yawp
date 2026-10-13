# qa-event-auto plan

## Scope

- Add QA-only platform Playwright coverage for the demo free-tier event auto-admit path.
- Keep changes to tests/docs/artifacts; no product behavior changes, no secret rotation, no email sends.
- Use unique labels, email, handle-ish account values, and password values so repeated runs do not collide.

## Implementation

- Add a focused Playwright spec under `services/web-app/e2e/tests/` that:
  - Creates a bypass-waitlist acquisition token in the test database as a faithful local demo stand-in.
  - Visits `/free?t=...`, verifies HTTP 200/no unexpected redirect, and asserts the scan cookie is set.
  - Submits the event form, verifies token usage/application status, mints a release link without sending email, creates the teacher account, and verifies sign-in.
  - Captures screenshots into `QA_SCREENSHOT_DIR`, defaulting to the lane shots path for this slug.
- Add a short runner note describing hosted demo env requirements and the local command.
- If hosted demo credentials/access are not present, create a skip artifact rather than failing noisily.

## Verification

- Run the focused Playwright spec locally with `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright`.
- Run the narrow relevant app tests/typecheck command where feasible and document any pre-existing blockers.
- Commit and push the suite code; open a platform PR.
