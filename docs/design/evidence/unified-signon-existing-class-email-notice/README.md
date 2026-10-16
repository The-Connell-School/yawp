# Existing-account notice during class email signup

FAILURES.md slug: `di-signon-fix-existing-class-email-notice`.

Base: `9b78657e3` (main includes merged #579). Application/test source:
`20d099fbd3b3befcecd45a0669a5432dec800941`. Final evidence was captured locally
on 2026-10-16 against those exact application/test contents. The initial notice
implementation was committed at `10f3eff5d`; the follow-up clears its email-only
mode when Google cancellation or callback errors return to ordinary entry.
Final PR head, CI and independent Ship Review are recorded in the lane build result.

Current main's New action intentionally uses first/last name and a generated handle
for every class. Preserve that behavior and Returning handle sign-in. Email-based
classes now additionally offer **Use school email** below the primary registration
form. This reaches the specified v2 School email screen without reinstating the
obsolete editable-handle registration UI. Free-class registration and the merged
email-origin handle notice remain intact.

An existing email resolves to **Create your account**, the class card, the entered
email, **You already have an account with this email. Sign in to join this class.**
and **Sign in instead**. That action re-resolves the displayed email in server-held
class context before ordinary password/activation authentication. It grants no
proof, session, membership or class enrollment. Existing password verification,
rate limits, destination handling, enrollment eligibility/capacity checks and
provider proof remain the existing implementations. All additions are behind the
existing default-OFF unified-sign-on gate; no migration or rollout is involved.

Back can restore an earlier client email while the server holds a later address.
The sign-in action therefore discovers the displayed identity again. Back from the
email screen to primary registration also restores the server's New registration
state before the name/handle form can be submitted. The review-discovered regression
has a real browser test that submits immediately after Back, without an intervening
Returning/New operation that could hide the problem.

## Validation

CI=1, one Playwright worker, no watch mode. Project capabilities/doctor, isolated
bootstrap (app5396 / DB55526), and local-dev fixture verification passed. Runtime
setup initially encountered read-only global Bun/Prisma cache paths and one partial
package; recovery used lane-private Bun/XDG caches and the same worktree only.

- TDD: both widths fail on current main because School email entry is absent;
  focused handlers fail for the missing operation. Additional real red cases cover
  stale Back identity, missing activation Back, primary-registration Back, and the
  notice foreground color. Three more red cases record the Google-callback mode
  lifecycle problem before its correction. `checks/red-*` retains the actual failures; initial
  browser runs that stopped a serial suite do not count unexecuted cases as passes.
- Project `signon-classcode` profile: **132 passed, 694 assertions**. This includes
  44 real-handler backend cases, 14 main class-student DB cases and existing policy,
  provider, flag dispatch and legacy registration/rate-limit controls. Six new
  handler cases cover no access/enrollment before proof, wrong passwords, safe
  continuation after valid proof, forged/stale/free contexts, unknown-email verified
  signup, passwordless activation, unavailable Google, and cancellation/provider-error/invalid-state
  callbacks returning to normal class-code entry without a new session.
- Project typecheck: **passed**; existing duplicate LTI route-ID warnings retained.
- Entire affected real-handler backend browser file: **13 passed** at 1280/390.
  Includes existing #579 email-origin/no-email registration checks and teacher,
  OTP/retry/reset, unknown signup, legacy OFF and rollback controls. Four new cases
  cover existing notice, exact banner CSS, client/server validation, changed-email
  Back, password proof/enrollment, and immediate return to primary registration.
- Main New/Returning browser cases: **2 passed** (1280/390).
- A later final-source browser refresh initially stopped at mobile hydration: five
  passed, one timed out, seven did not run. The trace recorded 13
  `ERR_NETWORK_CHANGED` failures fetching Vite modules. The failed log and sanitized
  network summary are retained separately. No source, timeout or retry change was
  made; the affected file was rerun on the same source. Final counts above refer
  only to that completed passing run.
- Final backend browser run began with an absent private mail capture directory.
  Setup creates it after the loopback DB guard; filesystem reads remain strict.
  No-email assertions remain active and pass. Local mail is captured only; no real
  delivery or hosted provider authentication was attempted.
- `git diff --check`: passed.

## Visual evidence and provenance

Eight triplets cover existing notice, subsequent password step, and client/server
validation at both widths. All application captures use real local handlers and mask
identifiers/passwords/codes/identity badges. Before/after primary-registration images
show the additional email option. Observed unknown-email activation captures are
included separately. `reference-metrics.json` records supplied/computed styles and
`reference-provenance.json` records source hashes and exact frame selection.

The exact **Email has an account** reference is the mobile state in the supplied
v2 signon-40 DOM, rendered by Playwright with scripts removed and original inline
styles unchanged. That same state frame is placed beside each viewport; it is not
claimed to be a supplied 1280px state. The supplied signon-39 default desktop PNG is
retained separately and is not relabeled as the existing state. Password references
use the supplied desktop PNG and the v2 signon-06 **Email user** mobile DOM frame.
Validation images combine the existing notice and an error; no separate exact
combined-state source frame exists.

Known reference artifacts/differences: broken reference logo and rounded device
frame; placeholder class/teacher labels; real runtime class labels; disabled Google
when unconfigured; added Back for class continuation. The long masked disposable
password identity wraps taller than the reference identity. Main's generated-handle
New and Returning copy are intentional main behavior; the primary form remains.

Flag-OFF login and class-link originals are byte/pixel-identical at both widths.
Signup originals differ only by newly required code masking (10,560 desktop / 10,880
mobile pixels). Original before captures are retained untouched. Dedicated comparison
copies overlay only exact magenta mask pixels from after captures; all six pairs
then have zero changed pixels. `flag-off-comparison.json` records both raw and common
mask results. No six-original-pairs-identical claim is made.

No hosted QA, preview action, #565 change, demo/production write, real email,
credential retrieval/creation or builder merge occurred. Historical hosted results
remain unchanged. Driver alone merges; backlog remains in_progress until verified
merge. Owned local runtime, database container/volume and generated/private outputs
are cleaned before handoff; sanitized evidence remains in the repo and lane shots.
