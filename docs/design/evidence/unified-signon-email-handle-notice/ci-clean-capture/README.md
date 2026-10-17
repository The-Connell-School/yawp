# Clean-runner capture setup continuation

FAILURES.md slug: `di-signon-fix-email-handle-notice`; existing platform PR #579.
The prior approval covers `427e2e07368354c8ec4b8cc53a8682932cd4241f` only;
independent driver Ship Review of this follow-up is required before merge.

CI run 38950537103, job 117142587429 failed before the first browser journey:
`fs.readdirSync(capture)` encountered ENOENT because no email had yet caused the
mailer to create its capture directory. The other cases did not establish passing
evidence. Reproduced locally on the approved head using an initially absent
`$TMPDIR/di-notice-ci/red/mail`.

The fixture now creates that directory in `beforeAll`, after the localhost database
guard, with recursive creation and mode 0700. Both strict directory reads and the
before/after mail-count assertion are unchanged. No catch suppresses permission,
invalid-path or other filesystem errors; existing captures are not deleted.
Application, authentication, persistence, enrollment and UI sources are unchanged
from the approved head.

Fresh validation on the follow-up:

- Absent-directory reproduction: one expected ENOENT failure before the fix.
- Clean-path focused browser run: three passed (1280px/390px email-origin flows
  plus flag-OFF control). The path did not exist when the server started.
- Negative control: a temporary, uncommitted insertion created
  `negative-control.json` immediately before the existing final mail assertion.
  The real 1280px registration journey failed there with expected length 0,
  received length 1. The insertion was then removed.
- Clean-path complete affected browser file: nine passed, including the previously
  unexecuted teacher activation, signup/reset, direct-code and rollback checks.
- Focused handler/policy/provider-guard/dispatch regressions: 98 passed,
  381 assertions. Project typecheck passed (existing duplicate LTI route warnings).

The two fresh masked notice screenshots are beside this file. All four notice and
direct-code screenshots were compared with retained approved evidence: three have
zero changed pixels; desktop email-origin has 244 changed pixels confined to Back
link hover paint (`35x11+623+1030`). All six fresh flag-OFF login/signup/class-link
screenshots have zero changed pixels. Hashes and metrics are in the comparison
JSON files. The original four supplied-v2 comparison triplets and before/after
pairs remain valid; source hashes are in `../reference-provenance.json`. Existing
reference-logo/frame artifacts are unchanged; the supplied email-origin state is
mobile-only, as documented in the original evidence.

Full local logs and all fresh screenshots are retained under lane-local
`shots/di-signon-fix-email-handle-notice/ci-clean-capture/`. The browser fixture
continues to verify null email/emailVerifiedAt, no additional email identity,
password hash, session, membership and class enrollment, with no captured mail
files for handle signup. Back, invalid code, client validation, taken-handle
redisplay and the direct-code no-notice control remain asserted at both widths.

Commands (CI=1; CLI-selected Bun/Node, existing compatible Chromium):

```sh
./bin/project capabilities --json
./bin/project doctor --json
RECORD_PORT_DATABASE=55548 RECORD_PORT_APP=5406 RECORD_PORT_E2E=5408 ./bin/project bootstrap --fresh --json
./bin/project fixture verify local-dev --json
```

Loaded only the generated disposable `.worktree-local/config.env`. Exported
`NODE_ENV=development`, `SIGNON_LOCAL_TEST=1`, `E2E_DATABASE_URL=$DATABASE_URL`,
`SIGNON_MAIL_CAPTURE_DIR=$TMPDIR/di-notice-ci/<run>/mail`, lane-local evidence,
and lane-private dependency/cache paths. Separate red, green, negative and full
runs each began with an absent capture path. Red's orphan fixture was cleared
using `./bin/project fixture reset local-dev --json` before green.

Each browser run started/stopped `./bin/project dev` in the same execution session.
A temporary config preserved `playwright.unified-backend.config.ts` and changed
only its base URL to isolated port 5406 plus absolute import/test paths. From
`services/web-app`:

```sh
bun x playwright test --config "$TMPDIR/di-notice-ci/playwright.config.ts" --workers=1 e2e/tests/auth.unified-backend.spec.ts --grep 'email-origin.*1280'
bun x playwright test --config "$TMPDIR/di-notice-ci/playwright.config.ts" --workers=1 e2e/tests/auth.unified-backend.spec.ts --grep 'email-origin|flag off retains'
# Negative control used the first command and the temporary insertion above.
bun x playwright test --config "$TMPDIR/di-notice-ci/playwright.config.ts" --workers=1 e2e/tests/auth.unified-backend.spec.ts --grep '.*'
bun test app/domain/unified-signon/backend.real-db.integration.test.ts app/domain/unified-signon/policy.test.ts app/domain/unified-signon/google.test.ts app/routes/auth.login/unified-dispatch.test.ts
```

From the repository root:

```sh
NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json
git diff --check
```

Final pushed head, GitHub check results and cleanup are recorded in the lane's
`state/BUILD_RESULT.md`. Hosted re-QA remains a separate task after driver merge.
