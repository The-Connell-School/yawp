# Unified sign-on local QA evidence

Scope: merged backend `591b48024c8773eed8a0c32b478f0abf12ce2420` plus a browser-only
rollback regression. No application or schema changes. See the
[rollout runbook](unified-signon-rollout.md) for authorization and environment gates.
Hosted single-preview QA and live Google validation remain **pending**; no hosted
requests or activation ran. Demo and production stay OFF.

## Reproduction

Use the project CLI capabilities/doctor first, then bootstrap one fresh lane
worktree with collision-free ports. This cycle used app 5396, Postgres 55516 and
compatibility server 5397. Temporary storage, captures and test output stay under
lane-private `$TMPDIR`; use `CI=1` and one Playwright worker. Do not reuse another
lane's database. The backend browser configuration currently fixes app port 5396;
check it is free before starting. No runtime/browser install is necessary beyond
CLI bootstrap and the existing compatible browser cache.

```sh
export CI=1
./bin/project capabilities --json
./bin/project doctor --json
RECORD_PORT_DATABASE=55516 RECORD_PORT_APP=5396 ./bin/project bootstrap --fresh --json
# The generated config contains local disposable credentials. Do not print it.
set -a
. .worktree-local/config.env
set +a
export SIGNON_LOCAL_TEST=1 NODE_ENV=development
export E2E_DATABASE_URL="$DATABASE_URL"
export SIGNON_MAIL_CAPTURE_DIR="$TMPDIR/signon-rollout/mail"
export SIGNON_EVIDENCE_DIR="<permanent-task-screenshot-directory>"
# Use the Bun selected by the project CLI; BUN_TMPDIR/cache must be lane-private.
bun test services/web-app/app/domain/unified-signon/backend.real-db.integration.test.ts
bun test services/web-app/app/domain/unified-signon/policy.test.ts services/web-app/app/domain/unified-signon/google.test.ts services/web-app/app/routes/auth.login/unified-dispatch.test.ts
NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json
./bin/project dev start --json
# Stop the owned server with ./bin/project dev stop --json in an EXIT trap.
# From services/web-app, with optional PW_EXECUTABLE_PATH to the existing browser:
bun x playwright test --config playwright.unified-backend.config.ts --workers=1 --grep-invert 'mocked Google'
```

Restart the **same local server** with `SIGNON_MOCK_GOOGLE=1`, dummy
`GOOGLE_OAUTH_CLIENT_ID=local-client`, `GOOGLE_OAUTH_CLIENT_SECRET=local-secret`
and `NODE_OPTIONS=--import=<absolute-checkout>/services/web-app/e2e/unified-google-provider.mjs`;
then run the backend config with `--grep 'mocked Google'`. Stop it afterward.
The preload refuses non-local databases/non-test credentials; Playwright intercepts
the authorization URL, and the server mock validates PKCE and signs local JWTs.
No live provider or Internal OAuth credentials participate.

With Google vars/preload unset and the first server stopped, run from
`services/web-app`:

```sh
E2E_PORT=5397 bun x playwright test --config playwright.unified-compat.config.ts --workers=1 --output="$TMPDIR/signon-compat-results" e2e/tests/auth.unified-compat.spec.ts
```

That config starts/stops its own server and **resets the supplied disposable
database**, migrates and seeds the E2E fixtures. Never point it at hosted data.
Tests delete the local sign-on setting; this cycle's initial value was absent.
Delete captured mail, traces/results, generated fixture/env files and owned
Postgres container/volume after validation; preserve permanent sanitized evidence.

## Executable test key

`Dnn` names below are exact test titles in
[`backend.real-db.integration.test.ts`](../../services/web-app/app/domain/unified-signon/backend.real-db.integration.test.ts).
Run the entire narrow file (37 scenarios, including four parameterized teacher
activation rejections), or select a title with Bun `--test-name-pattern`.
These call real entry/actions and callbacks against disposable Postgres and
captured mail. They are not presentation fixtures. Their IDs below are evidence
references, not signon-01 row numbers.

- **D01**: `resolver derives identity and class context; a token alone and posted screens prove nothing`
- **D02**: `reset responses are uniform; expiry, purpose substitution and resend cooldown fail closed`
- **D03**: `active membership selection requires the authenticated owner and rejects foreign or inactive IDs`
- **D04**: `unset and partial Google configuration fail direct requests safely`
- **D05**: `enabled password POST keeps validators/session handling and ignores substituted identity and redirect`
- **D06**: `OTP attempts, supersession, context substitution and flow expiry are enforced by the database`
- **D07**: `invitation email proof supplies student class context without posted roles or class IDs`
- **D08**: `existing account accepts owner invitation only after real password proof and preserves inactive status`
- **D09**: `Google callback state is browser-bound, single-use and gated even on cancellation`
- **D10**: `membership picker validates active ownership and keeps the original destination`
- **D11**: `required password change outranks membership and continues the safe flow after the existing action`
- **D12**: `handle/code ambiguity offers both meanings; choosing a class clears the handle identity`
- **D13**: `Google matching email requires account proof and explicit first-time linking; a linked subject can sign in`
- **D14**: `trial routing uses existing application guards after proof and never reveals status during resolution`
- **D15**: `student without membership can recover through a class, but disabled membership and staff accounts stay protected`
- **D16**: `free-class code uses handle-only registration, validates policy and rechecks capacity at submit`
- **D17**: `multiple class matches require a current server-issued choice and reject arbitrary/stale selections`
- **D18**: `partner context uses the existing UA organization/code/cookie guards and requires verified email`
- **D19**: `local mailer captures existing free-tier helper delivery without network calls or sensitive logs`
- **D20**: `an address changed after resolution cannot receive an old-account session or invitation grant`
- **D21**: `student invitations can choose among permitted classes with different codes`
- **D22**: `teacher invitations with multiple schools retain the existing selector and safe destination`
- **D23**: `existing passwordless teacher activation retains identity, memberships and destination through the location selector`
- **D24**: `new Google classroom signup is name-only and links the verified subject atomically`
- **D25**: `unified teacher handoff cannot fall back to legacy authorization after expiry or flag-off`
- **D26**: `reset proof cannot change credentials after email reassignment, and substituted class context invalidates a code`
- **D27**: `Google multi-class invitations keep the exact picker variant and require an authorized class choice`
- **D28**: `expired invitation status is revealed only after email proof and cannot create an account`
- **D29**: `anonymous trial status requires email proof and resends only through the existing captured invitation contract`
- **D30**: `enabled mutations retain the existing read-only impersonation guard`
- **D31**: `additive flow and identity tables expose the intended unique and foreign-key boundaries`
- **D32**: `existing passwordless account activates only after email proof and keeps its membership`
- **D33**: `read-only authenticated GET continuation cannot accept invitations or enroll classes`

Additional sources: **P** = `policy.test.ts` (identifier normalization, routing
precedence, OTP digest); **G** = `google.test.ts` (configured/missing/partial
credentials, PKCE, JWT/provider rejection); **F** =
`routes/auth.login/unified-dispatch.test.ts` (absent/off/targeted/malformed/unreadable
settings, untouched body on legacy dispatch, anonymous guard and safe redirects).
**L** = legacy `routes/free._index/route.action.test.ts`,
`routes/free.admin.approve/route.loader.test.ts` and
`utils/free-tier/free-tier-feature-gate.server.test.ts`. These focused tests use mocks where
specified in source; they complement real database coverage, not replace it.

Browser cases in `services/web-app/e2e/tests/`:

| ID | Exact case / evidence |
| --- | --- |
| B1 | `auth.unified-backend`: real handlers: class, email code errors/retry, verified signup and reset at 1280 / 390 |
| B2 | `auth.unified-backend`: existing passwordless teacher activates through the location selector at 1280 / 390 |
| B3 | `auth.unified-backend`: bare short and reserved handle words resolve as real class codes in the browser |
| B4 | `auth.unified-google-backend`: mocked Google provider: real cancellation, account proof, linking and membership handlers at 1280 / 390 |
| B5 | `auth.unified-backend`: flag off retains live legacy login, signup, class links, and direct callback gates; local rollout rollback restores legacy views and blocks an in-flight reset |
| B6 | `auth.unified-compat`: missing/malformed/off/targeted setting retains login, signup and class-link views; legacy password error, safe redirect, signed-in entry and forced password change; enabled local resolver does not authenticate or accept fixture selectors |

Slow-client reset/callback hydration waits from #560 are retained, along with
identity-count, membership, destination and original timeout assertions. B5 checks
before OFF → everyone → OFF, a rejected in-flight verification POST (legacy 422,
no new session), callback 404, then fresh legacy login/signup/reset views at both
widths. An already-open unified client can retain its old screen after rollback;
reload/navigate to get the legacy view. No application behavior was changed.

## All 30 signon-01 rows

This refines the [merged mapping](../design/unified-signon-backend-decision-rows.json)
with actual test titles and coverage limits. A DB result is not a browser E2E
claim. A dash means **no fresh complete browser journey for that row**, even if
its UI reference was captured previously. No row is declared hosted-validated.

| Row | Branch | Real-handler / supporting cases | Fresh browser | Limits |
| --- | --- | --- | --- | --- |
| 1 | identifier/class resolution and permitted choices | D01, D17, D21 | B1 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 2 | verified email class signup | D01, D07, D21 | B1 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 3 | handle/class ambiguity and free handle registration | D12, D16 | B3 | Ambiguity and handle registration are DB-covered; browser only resolves bare short/reserved class codes. |
| 4 | unknown identity account choice and existing free entry | D01, D29 + L | B1 | Resolver and teacher trial/status branch covered; new teacher /free submission is a retained legacy action test, not unified browser E2E. |
| 5 | proved trial status | D14, D29 | — | Anonymous INVITED status and captured resend covered; no browser status screenshot refreshed. |
| 6 | existing invitation release contract | D19, D29 + L | — | Existing release helper capture covered; no remote release or full hosted waitlist-to-invite sequence. |
| 7 | trial onboarding after password proof | D14 | — | ACCOUNT_CREATED routing asserted after password proof; no browser onboarding run. |
| 8 | pending/manual-review routing | D14 | — | SENT and MANUAL_REVIEW destinations asserted; no browser pending-page run. |
| 9 | approved trial destination | D14 | — | APPROVED destination asserted; no new browser approved-trial journey. |
| 10 | rejected trial guard | D14 | — | REJECTED destination asserted; no browser status-page traversal. |
| 11 | expired trial guard | D14 | — | EXPIRED destination asserted; no browser status-page traversal. |
| 12 | invited account activation | D07, D22, D23, D25 | B2 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 13 | existing password identity | D05 | B1 | Real password and retained destination tested by DB; browser resolves password then resets it. |
| 14 | explicit first-time Google linking | D09, D13 + G | B4 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 15 | no-password account setup | D32, D23 | B2 | Passwordless student and teacher activation both DB-covered; fresh browser activation covers teacher selector. |
| 16 | existing administrator approval link contract | D08 + L | — | Owner invitation proof covered; separate legacy approval loader tests cover email-link guards. No new unified browser administrator-approval journey. |
| 17 | active staff sign-in | D08, D14 | — | OWNER proof and TEACHER trial password sign-in DB-covered; no dedicated staff browser login. |
| 18 | existing student class context | D15, D16 | B3 | Class recovery/enrollment DB-covered; browser only confirms class resolution. |
| 19 | handle and required-password routing | D05, D11, D16 | — | Forced change completion and class/destination retention DB-covered; legacy forced-change browser compatibility retained. |
| 20 | Google choice/handle-only account boundaries | D16, D24 + G | — | Google name-only and handle-only boundaries DB-covered; no new browser free-class Google-to-handle transition. |
| 21 | active owned membership selection | D03, D10 | B4 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 22 | inactive and unassigned student recovery | D08, D15 | — | Disabled membership/staff recovery rejection DB-covered; no fresh inactive browser screenshots. |
| 23 | unknown email student signup | D01 | B1 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 24 | new verified Google signup | D24, D27 + G | — | New Google name-only and multi-class signup DB-covered with mocked JWTs; browser provider case covers existing-account linking only. |
| 25 | expired invitation/code after proof | D02, D06, D28 | B1 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 26 | canonical handles and ambiguity | D05, D12 + P | B3 | Canonical @handle/uppercase password proof and ambiguity DB-covered; browser short/reserved class words only. |
| 27 | identifier validation | D01 + P | — | Pure policy normalization covers bad format; no new invalid-email browser screenshot. |
| 28 | bounded code attempts/rate limits/retry | D02, D06 + P | B1 | Actual handlers and captured mail; browser covers the representative path, not every branch combination. |
| 29 | UA code/context/billing guards | D18 | — | UA context, verified-email and billing guard contract DB-covered; no browser partner or payment-provider journey. |
| 30 | authenticated entry and safe routing | D10, D11, D33 + P | B5 | DB safe destination/ownership/read-only GET; fresh browser rollback, retained compatibility signed-in behavior. No hosted navigation. |

## signon-33/34 class-code branches

| Branch | Reproducible evidence | Limit |
| --- | --- | --- |
| Email / Google continuation | D01, D07, D21, D24, D27; B1 | New Google signup uses signed local JWT mock in DB tests; B4 is existing-account linking |
| Invalid / full / submit seat race | D16 capacity recheck; D17 stale/archive/foreign selection; retained UI full/error references | No fresh full-class browser journey; invalid-entry UI remains retained presentation evidence |
| Several matches / stale choice | D17, D21, D27 | DB choice authorization and current class checks; no fresh picker browser journey |
| Handle and email class modes | D01, D12, D16; B1, B3 | Handle creation and ambiguity DB-covered; B3 resolves short/reserved class codes |
| Existing join / already-member | D15, D16, D33 | DB enrollment/membership/impersonation checks; retained legacy browser class-link evidence |
| Context / safe destination through password, code, provider | D05, D11, D13, D21–D27; B1, B2, B4 | Browser examples are representative; full cross-product remains untested |

The D16 test resolves an available class, fills all 35 seats with local invitations,
asserts submission is rejected without a user insert, then frees capacity and
asserts handle registration succeeds. An initially full resolver screen is retained
presentation evidence; there is no separate fresh real-handler assertion for it.
D17 archives a previously offered choice before selecting it. Presentation-only
classcode-01..12 references correspond to unchanged v2 signon-33..44; they do not
prove backend correctness. signon-01/02 and 33/34 are decision/copy diagrams, not
screens to recreate. Unchanged signon-03..32 references remain valid v2 designs.

## Evidence index and results

Permanent lane evidence: `shots/di-signon-flag-previews/`; selected comparisons,
full metadata/check logs and retained evidence hashes are committed under
[`docs/design/evidence/unified-signon-rollout/`](../design/evidence/unified-signon-rollout/).
See its `validation.json`, `comparisons.json` and `retained-evidence.json` for
actual counts, paths, source hashes and exceptions. Fresh implementation captures
use actual local handlers; Google captures additionally use the isolated provider
mock. Legacy OFF before/after images are compatibility references, not artboards.
Each fresh image has adjacent `-design.png` and `-side-by-side.png` files.

Retained UI comparisons cover 105 presentation states / 210 viewport comparisons
across 40 artboards. Backend evidence retains 34 initial, four activation and ten
CI-follow-up desktop/mobile comparisons. This cycle verifies their files/hashes
and references unchanged design crops; it does not rerun all fixture screenshots.
Backend final-head CI [38822098846](https://github.com/The-Connell-School/yawp/actions/runs/38822098846)
and [Migration Integration](https://github.com/The-Connell-School/yawp/actions/runs/38822098879)
passed at `66103d2d7dfc44f413561e93ffd095b5b2d5afcb`; that historical evidence is
retained separately from this PR's exact-head checks.

Retained deviations: six-character password minimum, 3–30 character handle
validation, real disposable names/identifiers, real logo in place of reference
render errors, existing identity/error styles, and legacy teacher location selector
(no dedicated unified artboard; signon-15 is the nearest reference). Missing Google
renders disabled in the current code. Mobile reference derivations and v1-to-v2
classcode filename mapping remain explicit in the retained manifest.

Completed local checks and cleanup are recorded in `validation.json`; Ship Review
must inspect comparisons side by side and assess flag-OFF compatibility, targeted
tests, typecheck and exact-head CI before approval. No independent review is claimed
by the builder. Outstanding: explicitly authorized hosted single-preview activation,
full browser journeys marked above, hosted deployment/migration readback, and live
provider/redirect verification under separately authorized secret wiring. Demo's
post-intern-session authorization and production rollout remain separate gates.
