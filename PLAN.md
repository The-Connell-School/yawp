# qa-event-waitlist plan

## Scope

- Add QA-only platform Playwright coverage for demo free-tier event links in waitlist mode.
- Keep changes limited to tests/docs/artifacts; no product behavior changes, no secret rotation, no production mutations, no real email sends.
- Use isolated local demo stand-in data with unique labels and unique teacher email/login values.

## Implementation

- Add a focused Playwright spec under `services/web-app/e2e/tests/` that:
  - Creates a non-bypass acquisition token in the test database.
  - Visits `/free?t=...`, verifies scan behavior and the scan cookie.
  - Submits a unique applicant through the event form and verifies a `LEAD` waitlist application tied to the token.
  - Captures local waitlist evidence.
  - Releases the row through the real internal release endpoint using an e2e-only management key, reads the captured local release email payload, creates the account from the generated release link, and verifies the signed-in onboarding path.
  - Writes screenshots under `QA_SCREENSHOT_DIR`, defaulting to the lane shots path for this slug.
- Add a short runner note describing the local command and hosted demo requirements.
- Add a hosted demo check that skips cleanly and writes `hosted-demo-skip.txt` until hosted disposable event/application fixtures and release operator access are available.

## Verification

- Run the focused Playwright spec locally with `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright`.
- Run a narrow typecheck or relevant focused test command if feasible, and document any blocker.
- Commit, push, and open a platform PR for the suite code.
