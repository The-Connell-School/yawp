# Unified sign-on rollout and rollback

Status: **local QA only; hosted single-preview QA pending Bryant's explicit
preview authorization**. `unified-sign-on` remains default OFF, including demo
and production. This runbook grants no deployment, preview visit/wake-up, flag
write, credential access, external email or migration permission.

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
- Arrange disposable accounts/classes, local or authorized isolated mail capture,
  and an operator with flag-edit permission and existing management credentials.
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
platform admin. The isolated-preview procedure below uses the same existing
signed/audited platform API directly; it does not create an Internal rollout row.
If that approved operator path or a correctly scoped key is unavailable, stop and
record hosted QA pending. No new Internal UI is delivered by this change.

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

## Authorized single-preview procedure

Only after the gates above, copy this JavaScript into a private file under
`$TMPDIR` and run it with the project's pinned Bun from the platform checkout.
Supply these values through the approved operator environment, with shell tracing
OFF: `SIGNON_PREVIEW_ORIGIN`, `SIGNON_CONFIRM_ORIGIN` (the same exact HTTPS origin),
`SIGNON_AUTHORIZATION_REF`, `SIGNON_OPERATOR_EMAIL`, `SIGNON_KEY_ID`,
`SIGNON_KEY_SECRET`, `SIGNON_CHECKOUT` (absolute checkout path),
`SIGNON_STATE_FILE` (new private file under `$TMPDIR`). No values are supplied by
this document. Inspect the script first. It never deploys or provisions a key.

```js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const e = process.env;
const required = name => {
  if (!e[name]?.trim()) throw new Error(`Missing ${name}`);
  return e[name].trim();
};
const origin = required('SIGNON_PREVIEW_ORIGIN');
const target = new URL(origin);
if (target.origin !== origin ||
    !/^https:\/\/pr-[1-9][0-9]*\.preview\.yawp\.school$/.test(origin))
  throw new Error('Expected one exact isolated preview origin');
const authorization = required('SIGNON_AUTHORIZATION_REF');
const actor = required('SIGNON_OPERATOR_EMAIL').toLowerCase();
const stateFile = path.resolve(required('SIGNON_STATE_FILE'));
if (!stateFile.startsWith(path.resolve(required('TMPDIR')) + path.sep))
  throw new Error('State must stay under private TMPDIR');
const { signInternalApiRequest } = await import(pathToFileURL(path.join(
  required('SIGNON_CHECKOUT'),
  'services/web-app/app/utils/internal-platform-signing.server.ts')));
const confirm = () => {
  if (required('SIGNON_CONFIRM_ORIGIN') !== origin)
    throw new Error('Reconfirm the authorized target before every write');
};
const call = async (method, body) => {
  const url = origin + '/api/internal/v1/feature-flags' +
    (method === 'POST' ? '/unified-sign-on' : '');
  const text = body ? JSON.stringify(body) : '';
  const signed = signInternalApiRequest({ method, url, body: text, actor,
    keyId: required('SIGNON_KEY_ID'), secret: required('SIGNON_KEY_SECRET') });
  const result = await fetch(url, { method, redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { ...signed.headers, 'content-type': 'application/json',
      'x-yawp-operator-email': actor }, body: text || undefined });
  if (!result.ok) throw new Error(`Management request failed: ${result.status}`);
  return result.json();
};
const read = async () => {
  const flag = (await call('GET')).flags.find(f => f.key === 'unified-sign-on');
  if (!flag || !flag.persisted || !flag.effective || flag.runtimeOverride !== null)
    throw new Error('Missing explicit flag readback; stop');
  return flag;
};
const equal = (a, b) => a.mode === b.mode &&
  JSON.stringify([...a.orgIds].sort()) === JSON.stringify([...b.orgIds].sort());
const write = async (next, expected) => {
  confirm();
  if (!equal((await read()).persisted, expected))
    throw new Error('Prior value changed; coordinate with its operator');
  const result = await call('POST', next);
  const flag = await read();
  if (!equal(result.previous, expected) || !equal(flag.persisted, next) ||
      !equal(flag.effective, next) || flag.lastChangedBy !== actor)
    throw new Error('Readback mismatch; inspect audit and coordinate rollback');
  console.log(JSON.stringify({ origin, authorization, actor, flag,
    previous: result.previous, changed: result.changed }));
};
const mode = process.argv[2];
if (mode === 'read') {
  console.log(JSON.stringify({ origin, authorization, flag: await read() }));
} else if (mode === 'enable') {
  confirm();
  const prior = await read();
  if (!equal(prior.persisted, prior.effective) || prior.persisted.mode === 'everyone')
    throw new Error('Expected a disabled isolated preview; stop');
  fs.writeFileSync(stateFile, JSON.stringify({ origin, authorization,
    prior: prior.persisted, priorRead: prior }), { mode: 0o600, flag: 'wx' });
  await write({ mode: 'everyone', orgIds: [] }, prior.persisted);
} else if (mode === 'restore') {
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (saved.origin !== origin || saved.authorization !== authorization)
    throw new Error('Wrong rollback record');
  const now = (await read()).persisted;
  if (!equal(now, saved.prior))
    await write(saved.prior, { mode: 'everyone', orgIds: [] });
  else console.log('Prior value already restored; retain readback evidence');
} else throw new Error('Choose read, enable or restore');
```

1. Independently confirm the authorized preview is already running at its recorded
   commit, with its own database and correct management key scopes. An HTTP request
   can wake a sleeping preview: do not run even `read` before authorization.
2. Run `bun "$TMPDIR/<operator-script>.mjs" read`. Save sanitized output outside
   temporary storage with the authorization, host and deployed SHA.
3. Reconfirm `SIGNON_CONFIRM_ORIGIN`, then run the same script with `enable`.
   Save the prior-value record and successful readback before starting QA. The
   read/check/write sequence has no compare-and-swap guarantee: reserve the
   operator window and stop on concurrent changes. The snapshot is written before
   POST so it survives interruption. On ambiguous network failure, read first.
4. Verify anonymous entry in a fresh browser, direct gated paths, every decision
   row in the [local matrix](unified-signon-local-qa.md), desktop/mobile copy and
   layout, and explicit provider linking. Only use authorized disposable accounts
   and captured delivery. Record hosted gaps instead of sending real email.
5. In a `finally`/incident handoff, reconfirm the same origin and run `restore`.
   Reread with `read` even when restoration reports already restored. Confirm
   prior persisted/effective mode and IDs; then verify legacy login, signup,
   reset, class links, and callback 404 in a fresh browser. A targeted prior mode
   remains targeted and blocks anonymous sign-on. An absent/legacy/malformed raw
   setting is exposed only as normalized OFF by this API: restoration writes
   explicit OFF, not the original bytes or row absence. There is no delete API;
   do not edit remote storage to recreate absence or malformed data.
6. Retain sanitized before/enable/restore readbacks, operator/audit references,
   deployed SHA, test results and comparison index. Delete temporary state/mail
   and stop local processes. Close the operator window only after rollback
   readback and compatibility checks pass. If restoration fails, report the exact
   environment and last observed mode to the authorized driver; do not claim OFF.

For a later **separately authorized** demo rollout, use Internal's Demo site
rollout panel for `unified-sign-on`: refresh/read, record prior rollout, choose
Everyone, verify readback, then restore the recorded mode/groups/org IDs through
that same panel and reread. This paragraph does not authorize that action now.
Do not use the preview script for demo or production, or alter `free_tier`.

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
takes the merge lock and merges. Keep the backlog in progress while the hosted
gate remains unresolved.
