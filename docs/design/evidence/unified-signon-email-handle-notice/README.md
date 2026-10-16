# Email-origin handle notice evidence

FAILURES.md slug: `di-signon-fix-email-handle-notice`.

Unknown local email → student → real `qa-handle` free class → new account now shows exactly **We won't save your email. This class uses a handle and password.** after the class card and before Display name. A presentation boolean is retained for client history and derived from the existing server flow for server redisplay. It never supplies identity proof or changes registration input/persistence.

Clean-runner continuation: [capture fixture fix, fresh browser evidence and commands](ci-clean-capture/README.md).

## Verification

- TDD: both real browser flows failed on the missing notice before implementation; handler regression failed on missing `emailOrigin` during capacity redisplay. Logs in `checks/red-*`.
- 98 focused tests / 381 assertions PASS, including the disposable database handler suite and existing policy, Google guard and flag dispatch regressions.
- Three selected real-handler browser checks PASS: email-origin flow at 1280/390 and flag-OFF compatibility at both widths. New cases exercise client validation, Back, wrong class-code server validation, real taken-handle server redisplay, and successful local registration. They assert null account email/emailVerifiedAt, no new SignonIdentity, correct hashed password, one session, and ordinary STUDENT membership/class enrollment. No mail capture is created. Direct code entry has no origin notice.
- Project typecheck PASS; existing duplicate LTI route-ID warnings remain.
- Six before/after flag-OFF login/signup/class-link views have zero changed pixels (`flag-off-pixels.json`).
- Four artboard comparison triplets: email-origin and direct-code control at both widths. Email-origin before/after pairs are included. Taken-handle screenshots are observational. All identifiers/password fields and generated handle errors/suggestions are masked.

The supplied v2 signon-38 PNG has mobile states only. Its Came from an email and Default crops are unscaled source pixels, including the reference's broken-logo and rounded-frame artifacts. The 1280 comparison intentionally places the same exact mobile-state reference next to a full desktop screenshot; it does not claim a supplied desktop notice artboard. See `reference-provenance.json` and `comparisons.json`. Builder visually inspected both notice comparisons; independent driver Ship Review is pending.

## Commands

Run in a fresh isolated lane worktree, with `CI=1` for runtime/tests and lane-private cache/temp settings. Use the runtime selected by the CLI and an existing compatible Chromium; do not install browser/runtime versions manually.

```sh
CI=1 ./bin/project capabilities --json
CI=1 ./bin/project doctor --json
CI=1 RECORD_PORT_DATABASE=55538 RECORD_PORT_APP=5396 RECORD_PORT_E2E=5398 ./bin/project bootstrap --fresh --json
CI=1 ./bin/project fixture verify local-dev --json
# Load only this worktree's generated disposable config, without printing it.
set -a
. .worktree-local/config.env
set +a
export CI=1 NODE_ENV=development SIGNON_LOCAL_TEST=1
export E2E_DATABASE_URL="$DATABASE_URL"
export SIGNON_MAIL_CAPTURE_DIR="$TMPDIR/di-email-handle/mail"
export SIGNON_EVIDENCE_DIR="<lane>/shots/di-signon-fix-email-handle-notice"
mkdir -p "$SIGNON_MAIL_CAPTURE_DIR"
# From services/web-app:
bun test app/domain/unified-signon/backend.real-db.integration.test.ts app/domain/unified-signon/policy.test.ts app/domain/unified-signon/google.test.ts app/routes/auth.login/unified-dispatch.test.ts
# From repo root; keep server and browser within the same execution session:
./bin/project dev start --json
# From services/web-app; red phase ran each width separately before the fix:
bun x playwright test --config playwright.unified-backend.config.ts --workers=1 e2e/tests/auth.unified-backend.spec.ts --grep 'email-origin|flag off retains'
# From repo root:
./bin/project dev stop --json
NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json
git diff --check
```

Local ports: app 5396, database 55538, reserved E2E 5398. Initial cold dependency install was interrupted after stalling; CLI bootstrap succeeded after copying the existing dependency cache into lane-private TMPDIR. Two preliminary browser invocations could not connect because the execution sandbox ends detached processes; final red and green browser runs started/stopped the CLI server within their own single execution session. Only the confirmed missing-notice failures above are TDD evidence.

No migration, hosted QA, flag rollout, Google-origin implementation, secret access or real email. Preview #565 is outside this task. Independent driver Ship Review must verify flag-OFF behavior, focused tests, typecheck and these artboard comparisons before driver merge. The backlog stays in_progress until merge verification.
