# Unified sign-on backend

`unified-sign-on` stays absent/off on demo and production. There is no environment
flag override, seed enabling it, remote migration, preview, or rollout in this PR.
Only the isolated local test database enables the flag. The October 16 legacy
sign-in and free-tier entry paths retain their existing handlers when it is off.

## Entry and authority

`/auth/login` dispatches the existing transport operations only after the existing
fail-closed flag check. Missing, off, malformed, targeted-only and unreadable
settings retain legacy dispatch before the body is read. The Google callback at
`/auth/unified/google/callback` independently checks the same gate. UI fixtures and
the mock provider are outside the deployed route tree and are never imported by
application modules. Enabled mutations retain the read-only impersonation guard, including authenticated
GET continuations that can accept invitations or enroll classes.

An opaque 256-bit flow reference is stored as a SHA-256 digest in `SignonFlow`.
An HTTP-only, signed, SameSite=Lax cookie binds it to a separate browser secret.
The flow expires after 30 minutes. An index supports expiry removal when new
flows are created. Posted screen names, emails, roles, organizations, classes and
memberships cannot supply proof. The server retains the safe destination, selected
class, allowed choices, invitation, provider context and proof. Account identity is
revalidated under a row lock before codes, password validation, credential changes
and invitation grants; address reassignment cannot redirect an old challenge.

Resolution checks canonical handles (including the display `@`), email and live
class codes. Bare strings that collide with a handle and class produce a choice.
Class matches are re-read before selection and submission, including archive and
capacity checks. Existing `/join?t=...` links retain their handlers. Free-classroom
account creation calls the existing handle registration operation; existing code
joins use the existing enrollment resolver and shared roster/capacity/budget guards.
Caller-owned transactions keep enrollment, sessions and flow consumption together.
Disabled memberships are never reactivated, and staff accounts cannot use the
unassigned-student recovery operation.

## Email, invitations and signup

Codes are six digits, expire in 10 minutes, allow at most five attempts, and are
consumed under the flow row lock. HMAC digests bind code, identity, purpose, flow,
invitation, class/partner context and a random generation. Resending after the
60-second cooldown replaces the old generation. Existing IP and identity budgets
apply to issue, verification, account creation and handle registration. Retry
responses include `Retry-After` and `retryAfterSeconds`. Reset responses are uniform
for existing and absent identities. The approved wrong/expired-code copy is inline;
expiry enables the existing “Send a new code” action.

Delivery uses the existing mailer abstraction. Isolated local/test delivery is
captured in a private directory under `$TMPDIR`; missing/unsafe capture fails
closed. Capture also intercepts existing free-tier resend helpers at the shared
mailer. Codes, provider payloads and secrets are not explicitly logged. Captured
messages are temporary and must be deleted after QA. No external mail was sent.

Verified signup uses existing name/password/handle policies and invitation metadata
schemas. New email accounts retain the existing student membership/class writes and
set `emailVerifiedAt`. Activation and reset retain password hashing and session
contracts; reset invalidates old sessions. Student invitation selections are limited
to the invitation's permitted classes, including several different class codes.
Staff/owner grants come only from proved, current invitation metadata. Expired
invitation status is shown after proof, without creating an account.

An invitation with several possible teacher locations uses the existing teacher
setup selector. Its signed handoff is marked as unified and remains bound to the
live flow; it cannot fall back to legacy authorization after expiry or flag-off.
The handoff cookie is destroyed on completion. Google signup in that selector is
name/location only; password fields remain unchanged for legacy email setup.
Free-tier status/invite/approval operations call their existing guards and helpers;
there is no alternate approval or release-email implementation. `/ua` continues
using the existing partner code, signed context, organization and billing contracts.

## Google and routing

Google is available only when both `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET` are configured. This work creates no credentials.
Missing/partial configuration disables the button and fails direct starts safely.
Authorization uses state, nonce and S256 PKCE. Callback state is consumed before
provider requests. Signed ID tokens require the expected issuer, audience,
algorithm, nonce, verified email, subject and bounded issue/expiry times. Provider
endpoints are fixed. Access tokens are discarded; identity is read from the verified
ID token. See [Google's OIDC contract](https://developers.google.com/identity/openid-connect/openid-connect).

A matching email cannot automatically link or authenticate an existing account.
The user proves that account with its password or email code, then explicitly links
or skips. Provider subject and user constraints prevent conflicting links. A known
linked subject can authenticate directly; current target invitations are resolved
on both paths. New Google accounts collect a name without requiring a password.
Cancellation/provider errors return to the existing entry error states. There were
no live provider requests during validation.

Post-authentication routing preserves this order: required password change; no
active membership; existing free-tier onboarding/pending/status guard; several
active memberships; safe destination. Membership choices require an authenticated
owner and an active, current row, then use the existing membership cookie. Forced
password changes retain the server-held destination and class context.

## Migration and validation

Migration `20261015213000_unified_signon_context` adds only `SignonFlow`,
`SignonIdentity`, their indexes and a restrictive User foreign key. No table/column
is dropped or renamed and existing identity/password/membership writes remain.
Local bootstrap applied the migration chain to disposable Postgres; schema validation
and migration status pass. A broad database-versus-Prisma diff also reports existing
repository drift outside these two tables; it must not be applied as a migration.
CI runs the new server tests against its freshly migrated database and runs the
local-handler browser tests in the existing isolated E2E job. The driver must
arrange an RDS snapshot before any production migration and performs the merge.

Validation commands (CLI-selected runtimes; one browser worker, no watch mode):

```sh
./bin/project capabilities --json
./bin/project doctor --json
./bin/project bootstrap --fresh --json
./bin/project test --profile typecheck --json
# With DATABASE_URL pointing only at disposable local Postgres:
SIGNON_LOCAL_TEST=1 bun test services/web-app/app/domain/unified-signon/backend.real-db.integration.test.ts
bun test services/web-app/app/domain/unified-signon/policy.test.ts services/web-app/app/domain/unified-signon/google.test.ts
# From services/web-app; local server prepared through ./bin/project dev start:
bun x playwright test --config playwright.unified-backend.config.ts --workers=1
bun x playwright test --config playwright.unified-compat.config.ts --workers=1
```

The mocked-provider browser run additionally supplies `SIGNON_MOCK_GOOGLE=1`,
dummy `local-client`/`local-secret` values and the Node preload
`e2e/unified-google-provider.mjs`; the workflow records the full command. That
preload refuses non-local databases and non-test credentials. It validates PKCE
and signs local tokens; it is never an application endpoint or production import.

[Decision-row mapping](unified-signon-backend-decision-rows.json) covers all 30
signon-01 references plus signon-33/34 class-code branches. The retained UI manifest
remains the artboard-to-screen mapping. Local evidence is in
`/home/bryant/work/yawp/codex-loop/lanes/design-impl/shots/di-signon-backend/`:
comparison metadata, adjacent design/implementation/comparison images, retained
merged-UI before captures and final check logs. Selected comparisons are committed
[here](evidence/unified-signon-backend/). Enabled evidence uses real handlers/database
and captured mail; Google evidence adds the isolated provider mock. The retained
before files for enabled states are explicitly presentation-fixture baselines.

The 34 refreshed comparisons include six flag-off pairs with zero changed pixels.
The existing six-character password minimum and 3–30 character handle policy are
intentional design deviations. Bare class codes are resolved before applying handle
policy. Reference logo errors retain the merged UI's real logo. The existing identity pill
and inline error treatment are retained from the merged UI. Real account/class
names replace artboard placeholders; disabled Google is expected without credentials.
Hosted QA, live Google testing, remote writes and preview activity are excluded.

Final local validation: 32 real-database scenarios (180 assertions); 16 provider and
policy tests; 20 login/dispatch tests; 8 handle/password-policy tests; 11 free-tier
gate/approval tests; and 5 free-entry action tests pass. The project typecheck passes.
Browser validation covers four actual-handler scenarios, two mocked-provider
scenarios, 13 flag-off compatibility scenarios and 14 retained UI behavior/geometry
checks. New coverage explicitly exercises existing passwordless/LTI activation,
read-only authenticated GET continuation, and short/reserved-word class codes.

The broad migration diff has 28 unrelated statements matching the origin/main
baseline exactly; the new tables' columns/indexes are checked against real Postgres.
See `checks/migration-drift.json` for the comparison. This evidence does not claim
that the repository's pre-existing global schema drift is resolved.


## Review correction: passwordless teacher location selection

The driver's P2 rejection of PR #560 at `69c23422` reproduced a missing
combination: an existing passwordless identity with a teacher invitation requiring
location selection. The continuation attempted a new user insert and failed on
its existing email. This correction updates the proved identity, retains its user
and membership IDs and existing location relations, and adds the authorized teacher
location grant in the same transaction. Unrelated memberships remain unchanged.
The original flow destination reaches authentication routing unchanged.

The invitation now remains stored through selection and is consumed only when
activation and the grant succeed. Completion locks and rechecks the resolved
identity, verifies the still-current invitation and organization, rejects a foreign
location and refuses to overwrite credentials established after proof. Expired or
revoked invitations and changed email ownership cause no partial writes. The
existing Google new-account path and legacy selector rendering are retained.

Fresh correction validation: 37 database scenarios / 223 assertions; 31 focused
policy, Google and flag-dispatch tests / 93 assertions; project typecheck with
`NODE_OPTIONS=--max-old-space-size=4096`; and six actual-handler Playwright scenarios
at one worker pass. The latter include desktop/mobile existing teacher activation,
desktop/mobile signup/reset, flag-off compatibility, and class-code resolution.
Prisma validate/status pass against the fresh 174-migration local database. This
correction adds no migration. Earlier broader results above describe the original
implementation and are retained as historical evidence.

[Correction comparisons and check metadata](evidence/unified-signon-backend/teacher-activation-fix/)
include the actual failing desktop selector before the correction and successful
arrival at the retained destination afterward. Full local evidence and logs:
`shots/di-signon-backend/activation-fix/`. Four desktop/mobile artboard comparisons
cover activation and location selection; six fresh flag-off images are pixel
identical to the prior implementation. The existing legacy location selector has
no dedicated unified artboard: signon-15 is shown as the nearest name/password
reference, with its existing location field, layout and copy explicitly retained.
The actual activation screen is compared with signon-23/24. Real test identifiers,
existing logo rendering and existing validator-policy deviations remain visible.

The earlier Ship Review approval is superseded by the driver's rejection. The
required P2 fix is ready for repeat driver Ship Review and fresh exact-head CI;
this builder does not claim a new independent approval or merge. The driver must
arrange the RDS snapshot before any production migration. Unified sign-on remains
default OFF; no demo/production flag changes, remote migration, external email,
live OAuth, hosted QA, preview or deployment was performed.


## CI mobile reset follow-up

Run [38815971146](https://github.com/The-Connell-School/yawp/actions/runs/38815971146/job/116702444776)
failed at the mobile reset heading after the full-document continuation. The
unchanged narrow local test passed. A slow-client regression then reproduced the
same missing heading: its trace showed a native GET carrying the code query
parameter, rather than a verification POST, because the test interacted with the
server-rendered form before hydration. The CI upload omitted the sign-on output
directory, so that historical trace could not be inspected.

Commit `6254fc8c` adds the missing client-readiness wait at the reset reload, keeps
script latency in the desktop/mobile regression, and removes that latency before
the destination navigation. The existing heading and destination assertions,
5000ms assertion timeout, real handlers, mail capture and authentication protections
remain. CI now uploads sign-on traces and failure screenshots. No rendered or
backend behavior, flag defaults, schema or migration changed in this follow-up.

Fresh validation: 37 database scenarios / 223 assertions, 31 focused tests / 93
assertions, six actual-handler browser scenarios and two mocked-provider browser
scenarios pass with one browser worker. Full typecheck and Prisma validate/status
pass; bootstrap applied all 174 migrations to fresh disposable local Postgres.
Six fresh desktop/mobile signup/reset comparisons and six pixel-identical
flag-off pairs supplement the retained 34 original and four activation comparisons.
Existing validator and legacy location-selector exceptions remain.

[Diagnosis, validation and screenshot comparisons](evidence/unified-signon-backend/ci-followup/)
are committed; full local captures/logs are in `shots/di-signon-backend/ci-followup/`.
The APPROVE at `7616f025` is historical; the changed head requires repeat driver
Ship Review and passing exact-head GitHub checks. No new independent approval is
claimed. The driver handles merge and the RDS snapshot before any production migration.


The first follow-up CI at `94d81a14` passed the broad browser suite and all six
real-handler sign-on cases, including the original mobile reset failure. It then
exposed the corresponding readiness gap after the mocked Google cancellation
callback. The corrected artifact path captured its trace: the continuation GET
rendered the cancellation message, but the test's retry click sent no request.
A slow-client local regression reproduced the same missing password heading.

The mocked-provider test now waits for the new client after both cancelled and
successful callback reloads. Its script-latency interceptor delegates through
`route.fallback`, retaining the provider mock and preventing live provider calls.
Both desktop/mobile slow-client cases and fresh typecheck pass; all heading,
linking, membership ownership, identity-count and destination assertions and
existing timeouts remain. Four additional callback/proof comparisons and the CI
before screenshot are in the [Google callback evidence](evidence/unified-signon-backend/ci-followup/google-callback/).
There are still no application, schema, flag-default or rendered changes. Final
exact-head CI and repeat driver Ship Review are required for merge.
