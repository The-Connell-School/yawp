# Main conflict resolution for PR #579

FAILURES.md slug: `di-signon-fix-email-handle-notice`.

Continued published branch and PR without rewriting history. Original head
`0b9b44222b3922f645b938b638871166719f918a`; merged main
`d8c1f20bb56f7c83a82d2d111f99388314a2af5c` (#577) in `0670c78d`, then
`3574fd55985b3ad9b2490937bec1f126ea940275` (#582) in `67912f23`.
Source/test head `21c481618c0b322825767493e87f7afcc4c1364a`.

The only textual conflict was `createClassAccount` in unified-signon.tsx.
Main's server-backed student-choice operation is retained. Automatic merges in
contracts, flow, real-DB tests and browser tests were inspected. Main's New /
Returning flow clears the entered identifier before rendering a new account.
An initial real-handler regression failed (expected emailOrigin true, got false),
and the 1280px browser regression failed with zero notices. The correction saves
only a display-context boolean before clearing that identifier. stateFor uses
that boolean with Google exclusions; resolving another identifier resets it.
The marker grants no identity, proof, session, seat or enrollment authority.
No migration/schema changes relative to merged main.

Main intentionally supersedes the old editable-handle form: students provide
First name / Last name; an occupied handle receives an assigned number and the
student sees it before explicit continuation. Browser regressions preserve the
original intent through real server validation redisplay and a real occupied
LocalNotice alias that yields LocalNotice1. The old editable taken-handle error
is no longer rendered by main, so claiming to preserve that exact UI would undo
#577. Existing server exhaustion/collision/capacity tests remain intact.

Validation (CI=1, one browser worker, no watch):

- Project capabilities, doctor, isolated bootstrap and fixture verification pass.
  Initial frozen install failed one package; retry in the same worktree succeeded.
- Project signon-classcode profile: 126 pass, 642 assertions. Includes main's
  14 real-DB student cases and all 38 real-handler cases, plus policy, dispatch,
  provider guards, login-rate-limit targets and legacy student join.
- Access-gate unit file: 37 pass, 167 assertions, including #582's callback guard.
- Project typecheck passes; existing duplicate LTI route-ID warnings remain.
- Complete affected backend browser file: 9 pass. Main New/Returning browser:
  2 pass (1280 and 390); signed-provider cases were not selected or claimed.
- Each browser run began with an absent lane-private capture path. The retained
  fixture creates it only after the loopback DB guard; filesystem reads remain
  strict. Unexpected-mail negative control injected a capture file immediately
  before the unchanged final assertion: expected failure, length 0 versus 1.
  Temporary injection restored byte-for-byte to tracked source afterward.
- Both widths assert exact notice once, class context, Back, wrong-code recovery,
  client validation, server validation, direct-code no-notice, generated collision
  suffix and successful disposable registration. Null email/emailVerifiedAt,
  password hash, session, STUDENT membership, correct class and no additional
  identity or captured mail remain asserted.

Evidence: `final/` contains fresh masked 1280/390 captures. Four notice/direct-code
triplets reuse the supplied mobile state crops from the approved provenance.
Desktop notice comparison uses the same supplied mobile state, since no exact
supplied desktop email-origin state exists. Six additional New / registration /
Returning triplets use the supplied desktop v2 boards alongside each viewport.
The v2 references still show the earlier Display name / editable Handle and
choice copy; main's name fields, generated handle preview, New / Returning labels
and confirmation are intentional main-origin differences. Card tokens, exact
notice copy, shield and placement remain the comparison targets. Reference logo,
rounded frame and placeholder class/teacher text are supplied artifacts. The
local dev feedback control is an existing runtime artifact. Password/identifier
fields and handle preview/confirmation are masked where displayed.

All six final flag-OFF login/signup/class-link images match approved before
captures byte-for-byte and have zero changed pixels (`flag-off-comparison.json`).
`provenance.json` records source revisions, file hashes and capture timing.
`checks/` retains local red/green, negative-control and final logs. Final source
was committed while the browser process ran; the two pending test-only changes
were committed unchanged. Application sources match the recorded source head.

Commands: `./bin/project capabilities --json`, `doctor --json`, isolated
`bootstrap --fresh --json` (app5406 / DB55548 / E2E5408), `fixture verify local-dev
--json`, `test --profile signon-classcode --json`, `test --profile typecheck
--json`, access-gate test file, and Playwright's unified-backend/classcode configs
with one worker. The backend config was copied into lane-private TMPDIR with
absolute import/test paths and base URL changed only to localhost:5406. Each
server started/stopped through the project CLI in its execution session.

Independent review and final-head GitHub checks are recorded in BUILD_RESULT.
Driver alone merges; backlog remains in_progress until verified merge. No hosted
QA, preview action, demo/production change, email delivery, secret operation or
feature-flag rollout occurred. Hosted QA remains its separate task.
