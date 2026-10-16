# Local approval evidence

Worktree: `fto-approval-page`, fresh from `origin/main` 6378459f. All verification
uses isolated local Postgres on port 54343 and the project CLI's owned server on
5199. Actual email delivery is mocked in database tests and captured locally in
browser QA. No hosted credentials, preview activity or environment writes.

## Checks

- `CI=1 ./bin/project test --profile free-tier-approval-unit --json`: focused
  lifecycle, input/mailto, route, legacy approval, Internal operator and transport
  tests, each in its own process to isolate module mocks.
- `CI=1 NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json`:
  full typecheck passes; existing duplicate LTI route warnings remain.
- `CI=1 ./bin/project test --profile project-cli --json`: 104 tests pass, including
  real runner discovery proving standard browser runs exclude the mutation spec
  and the dedicated profile discovers six flows without starting a server.
- `CI=1 PW_EXECUTABLE_PATH=<installed Chromium> ./bin/project test --profile free-tier-approval-browser --json`:
  six one-worker desktop/mobile flows pass, captured with installed Chromium 1248.
  The runner closes the browser and explicitly stops its owned server in `finally`.

Bootstrap uses `XDG_CACHE_HOME`, `BUN_TMPDIR`, `BUN_INSTALL_CACHE_DIR` under
`$TMPDIR`; no runtime version or browser installation is changed. The initial
Bun install required copyfile recovery for a missing package, in this worktree
only. Local fixture seeding includes the existing free-classroom bundle so legacy
approval provisioning runs against complete data.

## Screenshot provenance

Read `/home/bryant/work/yawp/codex-loop/lanes/design-impl/design/v2/DIFF.md` and
artboards freetier-09..14 PNG/DOM/text. The preserved sign-in form system specifies
320 px cards, 24 px card padding, 18 px headings, 40 px inputs, warm neutral tokens
and restrained controls. Brian-call requirements add sent dates, direct mailto,
forwarding, and the administrator information-left/form-right layout. These
extensions intentionally differ from the older single-column reference boards.
The administrator guide slot remains empty pending supplied content.

Evidence is in the writable lane directory:
`/home/bryant/work/yawp/codex-loop/lanes/di-freetier-inapp/shots/fto-approval-page/`.
The shared top-level `codex-loop/shots/` is outside this builder's writable roots.
Each canonical artboard has `-design.png`, `-impl.png`, `-side-by-side.png`.
Additional 1280/390 captures cover before/after waiting and admin layout, teacher
and admin forwarding forms, native validation, successful queued forwarding,
replaced/invalid links, waiting review/rejected/expired/approved states, flag-off,
non-target organization and paid membership controls. Compositions preserve the
full reference and implementation with explicit labels; originals retain their
native resolution. `checks/` holds final transcripts and initial red-test evidence.

Merge remains held. The driver requires independent Ship Review APPROVE and CI
before any release of state/MERGE_HOLD or merge. An RDS snapshot is required before
applying the additive migration to production. No environment flag is enabled.
