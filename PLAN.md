# qa-disabled-expired plan

## Scope

- Add focused platform Playwright coverage for demo free-tier event links that are disabled, expired, or disabled via `disabledAt`.
- Keep changes limited to QA tests, runner config, and runner notes. Do not change platform product behavior, rotate secrets, send email, deploy, or touch Internal UI.
- Use the local faithful demo stand-in pattern from the free-tier event QA specs, with hosted demo assertions documented as a clean skip when dedicated demo fixtures/access are unavailable.

## Implementation

- Add a targeted Playwright spec under `services/web-app/e2e/tests/` that:
  - Seeds disabled, expired, and `disabledAt` acquisition tokens in the e2e database.
  - Visits `/free?t=<code>` for each rejected link and verifies a friendly closed-link state with no successful application.
  - Records and asserts scan behavior for rejected links.
  - Verifies repeat scans in the same browser stay de-duped within the 10-minute scan cookie window.
  - Captures screenshots and text scan evidence under `QA_SCREENSHOT_DIR`.
- Add a focused Playwright config using an isolated local port.
- Add a short runner note for local and hosted-demo execution.

## Verification

- Run the focused Playwright spec locally with `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright` and `QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-disabled-expired`.
- Run a narrow typecheck or related app test if feasible.
- If hosted demo access variables are unavailable, confirm the hosted path skips cleanly and writes a skip artifact.
- If a product failure is discovered, append `FAILURES.md` and add the matching fixes-lane backlog item under `P0b`.
