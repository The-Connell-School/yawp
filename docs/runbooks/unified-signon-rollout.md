# Unified sign-on rollout and rollback

Status: **guarded deployment path implemented; hosted decision-tree QA remains
separate**. `unified-sign-on` remains default OFF, including demo and production.
Bryant's BACKLOG authorization dated 2026-10-15 20:55 CT covers only PR **#565**
(`qa/unified-signon-preview`, `https://pr-565.preview.yawp.school`) for subsequent
hosted activation in `di-signon-hosted-qa`, after this implementation merges.
This implementation task does not visit, wake, label, redeploy, rebase, merge or
close #565. Every implementation PR body starts with `[skip preview]`.
The generic updater does not grant permission to activate any other preview.

## Gates and prerequisites

- Record Bryant's authorization reference, operator, exact isolated preview PR,
  hostname, deployed commit and QA window before any hosted request. Never use a
  TeacherKev PR. One preview only; do not deploy, wake, label or rerun a workflow
  using this runbook without separate explicit authorization.
- Verify deployment and migration completion independently. Merged UI #559 and
  backend #560 do not prove deployment. Backend merge: `591b48024c8773eed8a0c32b478f0abf12ce2420`.
  Migration `20261015213000_unified_signon_context` is additive. The driver must
  arrange and record an RDS snapshot **before any production migration**; neither
  merge nor local bootstrap proves a snapshot exists. No remote migration here.
- **No demo enablement before the Friday October 16, 2026 intern session has
  ended AND Bryant has authorized it. Production enablement is outside this task.**
- Arrange disposable accounts/classes and local or authorized isolated mail
  capture. The preview deployment updater needs no management signing key; do
  not add `YAWP_INTERNAL_API_KEYS` to previews to activate sign-on.
  Never retrieve Internal's Google credentials. Secret wiring belongs to
  `di-signon-secrets`; do not create, rotate or print credentials.
- Google requires both `GOOGLE_OAUTH_CLIENT_ID` and
  `GOOGLE_OAUTH_CLIENT_SECRET`. Missing or partial configuration disables Google
  and direct starts return 503. The current UI renders a disabled button; do not
  claim it disappears. Dummy local credentials and the mock provider prove code
  paths only, not hosted OAuth client/redirect provisioning.

## Select the environment before reading or writing

Internal's shell selector uses `?env=<target-id>` and remembers the selection in
`internal_environment`. An explicit valid query wins over that cookie. Check
selector, host and environment-specific control immediately **before every
write**, including rollback; never rely on a remembered selection.

Feature flags are Hybrid: definition/key/owner is shared, rollout is per
environment. `/flags?flag=unified-sign-on&env=demo` opens the definition and its
per-environment rollout panels. Each panel submits its own hidden `env`;
selecting the shell environment alone does not retarget a different open panel.
“Refresh flag list from Demo site” reads the platform without activating flags.
Read Platform, Persisted and Effective values, last operator and timestamp.
Changing the rollout saves immediately through Internal's server, platform
first, then Internal state/audit after platform acceptance. Do not edit groups,
shared definition or other flags to activate anonymous sign-on.

**Current limitation:** Internal's selector can list previews, but
`requireHybridCoreEnvironment` accepts only demo/production for flag writes.
The preview columns on `/flags` are not writable rollout controls. Do not pass a
preview ID to `set_mode`, substitute demo, repoint demo's connection, or scrape
platform admin. The isolated-preview deployment procedure below applies just the
sign-on Setting from reviewed deploy tooling; it does not create an Internal
rollout row or expose an HTTP flag-write endpoint. Existing signed management
APIs keep their authentication and audit requirements. No new Internal UI is
delivered by this change.

## Management contract

Source: platform `app/domain/unified-signon/gate.server.ts`,
`app/utils/internal-feature-flags-http.server.ts`,
`app/utils/internal-platform-signing.server.ts`; Internal
`app/routes/flags.tsx`, `app/server/flags.server.ts`,
`app/server/platform-flags.server.ts`, `app/server/resource-scope.server.ts`.
Paths prefixed `app/` on platform are under `services/web-app/`.

| Operation | Contract |
| --- | --- |
| Read | `GET /api/internal/v1/feature-flags` → `{flags:[...]}` |
| Activate | `POST /api/internal/v1/feature-flags/unified-sign-on`, JSON `{"mode":"everyone","orgIds":[]}` |
| Disable | Same POST, JSON `{"mode":"off","orgIds":[]}` |
| Restore targeted prior value | Same POST, JSON `{"mode":"targeted","orgIds":["<original-existing-org-id>"]}`; retain all original IDs |
| Write result | `{flag, previous:{mode,orgIds}, changed, previousEnabled}`; reread afterward |
| Authentication | HMAC headers `X-Yawp-Key-Id`, `X-Yawp-Timestamp`, `X-Yawp-Nonce`, `X-Yawp-Actor`, `X-Yawp-Signature`; signed actor plus `x-yawp-operator-email` must identify the same operator |
| Scope/audit | Existing key needs `flags:read` / `flags:write`; signed writes record actor, key ID, endpoint and request hash in the platform audit path |

The API also accepts legacy `{enabled:true/false}`; use the mode contract above.
Internal retains bearer compatibility, but this procedure requires HMAC and must
not downgrade to bearer-only. Never put keys, signatures, OTPs or captured mail
in evidence or command-line arguments. A 401/403/429/5xx or unknown key is a stop
condition, not permission to bypass the signed path or edit a remote database.

Storage is `Setting.name = feature_flag.unified-sign-on`. Anonymous entry requires
**everyone**, not targeted. Absent, off, targeted-only, malformed (including invalid
optional org IDs) and unreadable settings fail closed. Legacy `true` means
everyone, `false` means off. There is no environment-variable override for this
flag. Readback must show `persisted == effective`, `runtimeOverride == null`, the
intended mode/org IDs and the operator. Each request reads the gate; no redeploy
is needed. OFF preserves legacy login/signup/reset actions and class links;
direct unified POST intents fall back to legacy validation and Google callback
returns 404. Rollback blocks unfinished unified flows. An already-open client can keep its old
screen until navigation; verify rollback through fresh requests. It does not delete accounts,
memberships, provider identities or revoke already-issued sessions.

## Authorized isolated-preview deployment procedure

After driver merge, the separate `di-signon-hosted-qa` task may operate only
**#565** under the authorization above. Do not use a TeacherKev PR. Implementation
PRs retain `[skip preview]`; label events never bypass that directive, fork/base
checks, admission limits or existing access controls. The following steps are a
runbook for that later task, not actions performed by this implementation.

1. Record authorization, operator, exact PR/hostname, deployed application SHA
   and reviewed control-plane SHA. Confirm the preview owns its isolated
   database: `yawp_pr_565`, application role `yawp_pr_565_app`, host
   `preview-postgres`, port `5432`. Do not print its URL/password. Do not use a
   shared database, external database, demo or production. No remote SQL writes
   or migrations are authorized by this runbook.
2. Activation uses the exact, case-sensitive PR label
   **`preview-flag:unified-sign-on`**. The existing preview workflow handles
   `labeled` and `unlabeled` events for this label; unrelated labels do not request
   a deploy. It reads the current live PR labels, emits a boolean and forwards
   `PREVIEW_UNIFIED_SIGN_ON` with shell quoting through the detached deployment
   helper, admission wrapper and toolbox configuration. A similar label or a
   label embedded in another name does not activate the flag.
3. On every deployment, after migrations and **all** seeds (including preview
   seats), the reviewed, read-only mounted
   `scripts/preview/unified-signon-flag.mjs` runs in the toolbox before web rollout.
   It runs outside the tooling-fingerprint early return, so unchanged-tooling and
   code-only redeploys also apply the label-selected state. Both fast and
   production-image preview runtimes use it; runtime image mode does not grant
   permission to touch the production environment.
4. The updater first requires `YAWP_ENVIRONMENT=preview`, then validates the
   complete `DATABASE_URL` with `isYawpPrPreviewDatabase`: PostgreSQL scheme,
   exact dedicated host/port, matching positive PR database/application role,
   URL-safe password, canonical URL, no query/fragment. Missing, malformed,
   shared, demo, production, mismatched-role and alternate-host URLs fail before
   constructing a database client. Named environment deployments never invoke
   it. The toolbox alone receives the boolean; it is not a runtime application
   override and does not change the flag's default.
5. Exact label present writes only `Setting.name = feature_flag.unified-sign-on`,
   `valueType=json`, `value={"mode":"everyone","orgIds":[]}`. Label absent writes
   explicit `{"mode":"off","orgIds":[]}`, including a previously enabled
   database. Upserts are idempotent; unrelated settings are preserved. A seed
   cannot overwrite this final state. Invalid transport or updater failure is
   fatal and prevents rollout; the admission wrapper stops the failed preview.
   Logs report only the selected mode, never connection details. The Setting
   description identifies `preview deployment label` as its last writer.
6. After the authorized workflow succeeds, confirm its exact application and
   control-plane SHAs, then check entry in a fresh browser at the authorized
   hostname. Clear the existing preview access gate with the authorized seat;
   this change does not bypass it. `/auth/login` must show the unified identifier
   field and Continue with Google control when ON. Missing Google credentials
   still leave Google disabled. Save desktop/mobile entry readback and continue
   the full decision-tree matrix in the separate hosted QA task. No signed API
   key or captured-email inspection is needed just to read the entry surface.

### Removal and rollback

Removing the exact label requests the same gated deployment with `false`; the
updater restores explicit OFF even for an existing database with unchanged
tooling. Wait for successful deployment and verify legacy `/auth/login` in a
fresh request, along with legacy signup/reset and callback 404 when rollback
verification is authorized. An already-open page can retain its old client state
until navigation. OFF does not delete accounts, memberships or identities, or
revoke sessions. An absent label is the rollback source of truth, so later
redeploys keep OFF; manual management changes on this isolated preview will be
overwritten by its next deployment. Coordinate operators accordingly.

The manager's current #565 QA instructions require leaving its flag ON until
told otherwise; do not remove its label merely to exercise this rollback text.
If a deployment or updater fails, do not claim readback or OFF, bypass its guards,
add signing keys or edit remote storage. Record the failure and hand it to the
authorized driver. Rollback requires the same reviewed deployment path and
explicit authorization for the target. Demo/production remain OFF.

For a later **separately authorized** demo rollout, use Internal's Demo site
rollout panel for `unified-sign-on`: refresh/read, record prior rollout, choose
Everyone, verify readback, then restore the recorded mode/groups/org IDs through
that same panel and reread. This paragraph does not authorize that action now.
Do not use the preview updater for demo or production, or alter `free_tier`.

## Evidence and Ship Review

[Local QA and reproducible matrix](unified-signon-local-qa.md) separates actual
handlers, database tests, provider mocks and presentation references. Hosted
single-preview QA and live-provider verification are pending; local evidence
alone does not establish hosted readiness. Backend #560's final-head CI and
independent review are retained evidence, not proof of this PR's checks.

Before approval, Ship Review must assess flag-OFF compatibility and rollback,
targeted tests, project typecheck, desktop/mobile side-by-side artboard comparisons,
retained validator/location-selector exceptions, honest matrix gaps, and exact-head
required CI. Preview deployment must remain skipped. Only the driver rebases,
takes the merge lock and merges. Keep `di-signon-preview-flag` in progress until driver-verified merge. Hosted
activation and decision-tree QA remain tracked separately in `di-signon-hosted-qa`.
