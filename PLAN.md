# qa-event-waitlist-copy-regression

## Goal

Build a focused platform Playwright repro for the demo event-link waitlist copy regression without changing product behavior.

## Scope

- Add a deterministic local demo stand-in spec that seeds a non-bypass event token, submits the public `/free?t=...` form, and verifies the resulting application is still a `LEAD`.
- Assert no release email log or `RELEASE` signed join token exists before checking the visible copy.
- Capture form, submitted page, and database/text evidence under the free-tier QA lane shots directory.
- Add a hosted demo path that skips unless an explicit disposable fixture token/url is provided, and only submits when a separate opt-in is set.

## Validation

- Run the focused Playwright spec with cached Chromium if available.
- If hosted demo fixture env is absent, verify the hosted path writes a skip artifact and exits cleanly.
- Update `FAILURES.md` and the fixes backlog/patch notes with the repro command and artifacts.
