# Unified sign-on UI and backend handoff

`unified-sign-on` is registered in the existing feature-flag management contract.
There is no seed, environment override, or migration enabling it. Keep the setting
absent/off on demo and production through the October 16 intern session. Anonymous
entry requires `everyone`; targeted settings, missing/malformed settings, and read
failures retain the previous UI and POST dispatch. The existing `/auth/login`
anonymous guard still redirects authenticated visitors to the existing `/` destination. The required-password page
retains its authentication guard and action and changes presentation only when enabled.

The enabled entry is intentionally incomplete until **di-signon-backend (PR 3)**.
The UI item cannot resolve live identities, issue/verify codes, create accounts,
link Google, or select memberships. Those POST intents return 503 without side
effects. The enabled UI uses the router fetcher to read that response. Credential form submissions retain the original `loginAction`, including
validation, rate limits, password checks, session creation, forced-password
redirects, preview seat checks, and safe destinations. A selector in a URL or form
cannot select a screen or authenticate. No new app routes/APIs were added.

The UI and `SignonTransport` contract are in
`services/web-app/app/components/unified-signon/` and
`services/web-app/app/domain/unified-signon/contracts.ts`. Local state selection
exists only in `e2e/fixtures/unified-signon/`, served by the separate loopback Vite
configuration. It is outside the route tree and production build. Its transport
only returns in-memory presentation data; it never makes an authentication,
account creation, email, membership, or class-join request. Fixture success is not
a server capability. Production modules do not import fixtures.

## PR 3 integration contract

Every operation receives an operation name, field values, a safe `redirectTo`,
and the current presentation context. Return `{ state: SignonState }`, or
`{ error, fieldErrors?, retryAfterSeconds? }`. `flowToken` is reserved for an
opaque, expiring, server-held challenge reference. Posted state/identity/role/IDs
are never authoritative. Validate again on the server and bind every step to the
challenge/session, including the destination. Do not expose account/membership
status before the appropriate identity proof. The resolver must distinguish
email, handle, class code, and an ambiguous code/handle using live data.

| Operations | Integration required |
|---|---|
| `resolve`, `resolve-class`, `choose-class` | Authoritative identifier/class lookup, ambiguity, multiple matches, invalid/full states; retain class links and selected class through identity proof. Reuse existing class lookup/join semantics. |
| `password` | Existing `loginAction` and `UnifiedPasswordForm`; email field is the resolved identifier. Never replace password policy, rate limits or session logic. |
| `required-password` | Existing `/auth/required-password-change` form/action, already connected behind the flag. |
| `send-code`, `resend-code`, `verify-code` | PR 3 hashed expiring OTP, uniform reset response, rate limits and captured mail in tests. Bind purpose (signup/reset/sign-in) and invitation/class context. |
| `create-account` | Verified email or Google identity, invitation/account type and existing signup validators; Google variant collects name only. |
| `join-handle` | Existing `/join` operation: verified join token, class and capacity checks, existing username/password validators; never persist an email for a handle class. Recheck capacity on submit. |
| `trial-status`, `resend-invite`, `resend-approval` | Existing free-tier operations and guards; uniform anonymous status response. Existing `/free` and onboarding links stay in place. |
| `google`, `link-google`, `skip-google` | PR 3 OAuth state/nonce/PKCE, verified provider identity, callback/error/cancel mapping and first-time linking. Read `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` only when this path is implemented. Never create credentials. |
| `select-membership` | Authenticated active membership ownership check, current membership cookie contract, safe redirect. Reject stale/foreign/inactive IDs. |
| `partner-code` | Existing `/ua` context/validation and partner routing; PR 3 integration must preserve that contract. |

After authentication, enforce: required password change → no active membership →
free-trial onboarding/status → multiple active memberships → destination. The UI
renders these outcomes, but never calculates authorization from fixture data.
Use the existing class destinations only after a verified join. Signed-in login
entry retains the existing `/` redirect when off. Enabled authenticated entry maps to `/app` without changing the legacy path. Preserve safe `redirectTo` and class
context through every back/continue step, including reset and OAuth.

Google is disabled on the deployed entry regardless of environment variables
until a real OAuth action exists. Configuring credentials alone cannot enable an
inert control. Local fixtures show configured, cancellation, and failure variants.

## Reference and policy deviations

- Source: `design/artboards/signon-01..32` and `classcode-01..12` in the design-impl lane; PNGs, copy exports, and computed DOM styles were read. Free classroom app artboards are excluded.
- Existing password minimum is **6**, not the design's placeholder `[8]`. Existing handles accept **3–30** letters, numbers, dots, underscores and hyphens, including reserved-name validation. Entry design's 3–20/underscore-only copy is replaced with the existing policy. Existing validators remain unchanged. The new entry strips a display `@` only for UI validation; PR 3 must normalize the canonical identifier before calling the unchanged password action.
- All-states artboards contain broken logo references. Implementation uses the real app logo. Desktop variants have desktop design PNGs; additional state references exist only as 390px panels and are centered without scaling for desktop comparison. Mobile desktop-default references use the corresponding all-states default panel.
- Use Arial followed by the system stack, matching the existing free-tier artboard implementation and supplied PNG font metrics. Use existing Input, Button, AuthFormCard and auth shell; scope new spacing/styles to the unified screens. Preserve existing theme colors and clear focus rings. Error, pending and disabled states remain keyboard readable; fields have labels and described errors.
- Status placeholders (`[Admin name]`, dates, organization/class names) occur in isolated fixtures only. PR 3 must supply authorized real data. No new resolver/OTP success is exposed in the live entry.
- Support links use the existing `mailto:support@yawp.school` destination; no mail is sent by the app. New UI does not send mail.

## Evidence and Ship Review

The generated [state manifest](unified-signon-manifest.json) maps every desktop and
all-states reference to its component screen, fixture, backend dependency, and
both viewport captures. Full evidence lives at:
`/home/bryant/work/yawp/codex-loop/lanes/design-impl/shots/di-signon-ui/`.
Each comparison has adjacent `-design.png`, `-impl.png`, and `-side-by-side.png`
files; `comparisons.json` records source crops and derivations. Selected actual
comparisons are committed in `evidence/unified-signon/` for PR inspection.

Ship Review must verify:

- Flag-off legacy loader/action dispatch, anonymous/authenticated login, safe redirects, password failure/rate limits, required password change, signup, class/handle joins, and free-tier status regressions.
- Direct enabled/disabled POST requests cannot select a fixture screen, grant a session, or bypass guards. Google unset/configured UI is safe.
- Targeted tests, typecheck, local browser tests, and the state manifest are complete. Screenshots are compared with exact copy, spacing, colors, inputs and buttons; policy deviations above remain intentional.
- No demo/production rollout, migration, credential creation, email, deployment or preview activity. Driver handles rebase/merge after review; builder does not merge.

Local commands use `CI=1`, the project CLI's pinned Bun/Node selection and one
Playwright worker. The browser executable came from the existing local cache;
no Playwright/browser install or runtime-version change was needed.

```sh
./bin/project capabilities --json
./bin/project doctor --json
./bin/project test --profile typecheck --json
# From services/web-app, with disposable local E2E database/captured-mail env:
bun x playwright test --config playwright.unified-signon.config.ts --workers=1
bun x playwright test --config playwright.unified-compat.config.ts --workers=1
```

There are **105 reference states / 210 viewport comparisons** across 40
artboards. The six original-versus-implementation flag-off login/signup/class-link
captures have **zero different pixels**; see
[evidence/unified-signon/flag-off-regression.json](evidence/unified-signon/flag-off-regression.json).
The state manifest also lists the relevant signon-01 decision-matrix rows.
The existing required-password action retains its `/app` destination; PR 3 owns
any new server-held destination handoff through password reset/OAuth steps.


Original implementation validation: 70 targeted unit/route checks; seven fixture browser tests; thirteen
server-backed compatibility/status checks (the enabled-entry check reran alone
after correcting an overbroad assertion about client-hint preference cookies).
The live enabled-entry test verifies no new database sessions and no HTTP-only
cookies. It also exercises direct stub requests. All 210 comparison files were
checked for existence. Hosted QA was omitted under the preview ban.

Scoped discovery verifies three compatibility specs in the default configuration
and seven UI specs in the dedicated fixture configuration; the latter are
excluded from default app-server discovery. Broad default `--list` also loads
unrelated existing Bun-only and database-dependent specs and could not complete
in plain Node discovery without their setup. Those broader checks are left to
CI; this item used the targeted configurations above.

## Ship Review corrections (di-signon-ui)

The rejected review in the lane's `state/REVIEW.md` is addressed on the same PR.
The feature-flag HTTP expectations now include `unified-sign-on` and explicitly
assert persisted/effective off with no runtime override. Both class signup entry
paths use the same account-mode decision and retain class context and destination.
A transition-only email-class fixture complements the handle-class design fixture;
it is available only in the standalone fixture server. Expired-code resend clears
the expired presentation variant and error before returning to verification. All
OTP results remain in-memory fixture data with no delivery or authentication.

Email-code screens now include the 40px envelope badge, 22px icon, 8px heading
gaps, 24px copy-to-fields gap, and 18px monospaced code with 3.24px letter spacing.
Membership options use white outlined horizontal rows, 12px column gaps,
14px/16px padding, 15px organization text, 12px role pills and 16px chevrons,
with 10px between rows. Measurements were checked against the corresponding v2
DOM exports; the unchanged design PNG crops remain the comparison references.
The new scoped styles do not change shared auth components or flag-off pages.

Regression coverage adds both handle/email class transitions, expired → resend
→ verify, and desktop/mobile geometry plus keyboard membership selection.
Current local validation: 90 targeted unit/route tests, full project typecheck,
and 12 standalone Playwright tests with one worker. The full fixture run captures
all 210 comparisons; the 18 comparisons for signon-13/14/27/28 are refreshed and
committed for review. The lane evidence's `review-fixes/before/` preserves their
previous images. Prior server-backed compatibility results above were not rerun
for this presentation/fixture/test-only correction. Hosted QA remains omitted.

One intermediate broad screenshot run had a local Chromium
`ERR_NETWORK_CHANGED` loading fixture modules; its remaining 11 tests passed.
Final results are recorded in the lane evidence `checks/review-fixes/`.


## Remaining status/card review corrections (di-signon-ui)

The second REJECT in `state/REVIEW.md` identified missing status badges and the
shared class-summary treatment. Trial status now uses a clock for waitlist,
administrator-pending and manual-review states, an envelope for an invitation,
and information for rejected/expired requests. Inactive-account screens use
information; joined screens use the circled check. Each decorative badge uses
the existing secondary/foreground tokens, a 40px circle and a 22px Lucide icon,
with 8px to the heading. Status copy sits 8px below its heading; actions sit
24px below the copy. Empty action forms no longer add space to read-only statuses.

Class summaries now use the shared white auth-card surface, the existing border
token at 1px, 12px vertical/14px horizontal padding, and a 2px content gap.
The DOM exports specify 20px class-name and 18px detail lines; these keep the
summary content at the reference's 40px height before padding/border. These
changes apply only inside the default-off unified UI. Shared legacy auth
components, server operations, validators and settings remain unchanged.

Desktop/mobile regression assertions cover every trial/inactive/joined fixture's
icon choice, badge size, header/copy/action gaps, and class-summary geometry in
all seven consuming screen families. The badge assertion failed before the fix;
the additional line-height assertion caught inherited 22.5px text before the
spacing correction. Final validation: 90 targeted flag/login unit/route tests,
project CLI typecheck, and all 14 standalone Playwright tests pass with one
worker. All 210 viewport captures are refreshed; 98 affected comparisons across
18 artboards are committed. Prior affected evidence is preserved in the lane's
`status-card-fixes/before/`; final logs are `status-card-*-final.log` and
`status-card-targeted.log`. The manifest's `statusCardReviewFixes` links this set.

Server-backed compatibility/status browser checks and the six identical flag-off
comparisons remain the earlier evidence; these were not rerun for this scoped
presentation correction. Hosted QA remains omitted under the preview ban.
PR 3 contracts and all remote feature settings remain unchanged. Repeat Ship
Review and check final CI before the driver handles rebase, merge lock and merge.
