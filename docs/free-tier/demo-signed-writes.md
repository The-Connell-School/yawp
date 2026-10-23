# Demo signed-write deployment handoff

Task: `ft-create-link-demo-auth`. QA filing: `qa-create-link-post-89-verify`.
This remains **in_progress** until manager deployment and independent hosted QA.

## Confirmed evidence

- Latest successful Demo environment run checked read-only:
  [38609335025](https://github.com/The-Connell-School/yawp/actions/runs/38609335025),
  revision `35dbf87fb4b9707d12ecb8f83f6c2aca825ffab5`, finished
  2026-10-14T17:52:53Z. The earlier handoff records `reset_data=false`.
- Internal Deploy run corresponding to the failed attempt:
  [38610518244](https://github.com/The-Connell-School/yawp-internal-v3/actions/runs/38610518244),
  revision `52dc904448adb61a9752a76c59218c4aaa957e4b`, finished
  2026-10-14T17:56:00Z. This is the Internal service serving `?env=demo`.
- On review repair, the latest successful Internal Deploy checked read-only is
  [38620637805](https://github.com/The-Connell-School/yawp-internal-v3/actions/runs/38620637805),
  revision `3b587188748824ddb5ed4553b8ac9ab9e269dc50`, finished
  2026-10-14T19:06:27Z. Demo's latest successful run remains `38609335025`.
  Internal's environment resolver, demo signing selection and free-tier client
  are unchanged between these two Internal revisions. Workflow revision/run
  metadata does not establish effective runtime secret availability.
- Authenticated demo attempt at 2026-10-14T18:18:48Z: one create POST,
  HTTP 401, action `ok=false`, zero matching rows on independent reload.
  Evidence: lane `shots/ft-create-link-action-400/hosted/`.
- #542 merged at 18:50:26Z as `ec68c73c`. It added regression coverage;
  main deployment does not update demo. The historical 400 is a different issue.
- At both the deployed platform revision and current main, token writes require
  `X-Yawp-Signature` before parsing input. Missing signature returns 401 even with
  a valid bearer. Signed requests with no parsed server HMAC keys return 404;
  wrong key id/secret or changed actor returns 401; wrong scope returns 403.
  Valid HMAC writes require `management:write` and signed actor attribution.
- Internal at its deployed revision selects `DEMO_PLATFORM_URL`,
  `DEMO_MANAGEMENT_SERVICE_KEY`, `DEMO_MANAGEMENT_KEY_ID`, and
  `DEMO_MANAGEMENT_KEY_SECRET` for `env=demo`. Missing or placeholder signing
  settings omit HMAC headers. Production uses separate variables.
- The previous demo workflow and renderer only forward the bearer management
  credential, with no `YAWP_INTERNAL_API_KEYS` path. Read-only GitHub secret-name
  metadata lists `DEMO_MANAGEMENT_SERVICE_KEY` in environment `demo`, but no
  `DEMO_INTERNAL_API_KEYS` there. Secret contents and live container settings
  were not inspected.

The 401 is consistent with absent/unusable Internal demo signing configuration,
or another failed HMAC check. Missing server HMAC keys alone would yield 404 for
a signed request. The exact live mismatch is **unconfirmed**; configuring the
server path alone cannot guarantee hosted success.

## Delivered configuration path

The Demo environment workflow consumes the GitHub environment `demo` secret
`DEMO_INTERNAL_API_KEYS`. Its value is the existing demo key configuration as a
JSON array of `{id, secret, scopes}` entries, matching the platform auth schema.
At least one entry must include `management:write`. Keep the existing required
read/rubric/flag scopes; do not broaden privileges or replace unrelated keys.

The reviewed control-plane validator checks it before SSH or host changes. An
absent/malformed configuration fails with a variable-name-only error. The SSH
environment forwards it using `shell_quote`. The detached runner passes that
command as a positional argument to a fixed Bash script, preserving its escaping
until the intended `bash -lc` execution. It does not embed the quoted command
inside another double-quoted shell program. The renderer puts it into
`YAWP_INTERNAL_API_KEYS` on the **demo web container only**, preserves literal
dollar characters through Compose, and refuses any PR-number or non-demo target.
Toolbox, renderer, and LTI mock receive no HMAC credentials. PR preview workflows
have no secret reference. Authentication, actor checks, nonce protection and JSON
idempotency are unchanged. No migration is included.

Execution regressions run the actual detached runner with local SSH/SCP stand-ins
and real Bash, `flock`, `setsid`, polling and exit-status handling. Compact,
spaced and pretty-printed JSON, including dollar, quote, backslash and shell
metacharacters, must execute the target and arrive byte-for-byte unchanged. The
existing scalar credential and nonzero target exit are checked too. Tests own
their log-copy path via `LOCAL_LOG_COPY`; the workflow's default path is unchanged.
This proves local transport, not hosted authentication or persistence.

## Manager steps

1. Driver reviews and merges the platform PR. Keep the caps #541 handoff separate.
2. Bind the existing correctly scoped demo key JSON to the platform repository's
   GitHub **demo** environment secret `DEMO_INTERNAL_API_KEYS` through approved
   secret storage. Reuse credentials; do not rotate or print them. No production
   fallback is supported. Organization-inherited secret availability was not
   inspected; the preflight establishes effective availability at deploy time.
3. Verify Internal's current ECS task definition has the demo-specific secret
   references for `DEMO_MANAGEMENT_KEY_ID` and `DEMO_MANAGEMENT_KEY_SECRET`, as
   well as demo URL/bearer settings. They must identify the existing demo server
   key; do not copy production configuration. Internal's workflow retains the
   deployed task definition's secret references. Manager owns any task-definition
   configuration/deployment needed to make those references available.
4. Manager dispatches **Demo environment**, reviewed ref containing this change,
   `reset_data=false`. Builder does not dispatch it. Record the actual deployed
   revision and run ID, plus Internal's deployed revision/run (or task deployment
   identifier if configuration alone changed). Recheck both services before QA.
5. Independent QA runs its existing unique-label Create/reload coverage with
   `env=demo`. Require exactly one successful `intent=create` POST, action
   `ok=true`, one matching persisted row after independent filtered reload, and
   masked dialog/list screenshots. Preserve required-label/error retry and
   same-key replay/distinct-operation regression results. Keep this P0 open
   until this hosted confirmation succeeds.

## Safe verification

With the existing secret injected into an isolated manager shell (no `set -x`),
the following validates structure/scopes and prints **no values**:

```bash
node scripts/preview/demo-internal-api-config.mjs
```

Secret-name metadata only:

```bash
gh secret list --repo The-Connell-School/yawp --env demo --json name,updatedAt
```

Before rebinding `DEMO_INTERNAL_API_KEYS`, dispatch the **Demo internal API keys
audit** workflow (`.github/workflows/demo-internal-keys-audit.yml`). It SSHes to
the demo host, reads `YAWP_INTERNAL_API_KEYS` from the running demo **web**
container, and logs only each key's `id`, `scopes`, and field names — never
`secret` values. Do not dispatch the audit while a **Demo environment** deploy
is running or queued on the same concurrency group: GitHub allows only one
pending run per group, so a queued deploy can be dropped behind a manual audit.

Independent QA, from its prepared Internal worktree, sources credentials silently
and uses the existing browser suite (no preview, no production writes):

```bash
set +x
source /home/bryant/work/yawp/codex-loop/.env.qa
CI=1 INTERNAL_BASE_URL=https://internal.yawp.school \
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
QA_SCREENSHOT_DIR=<QA-lane-writable-evidence-directory> \
./node_modules/.bin/playwright test --config=playwright.config.ts \
  e2e/free-trial-create-link-no-post-fix-verify.e2e.ts \
  --project=chromium --workers=1 --retries=0
```

The spec fixes the target to demo and captures request/action/row-count evidence.
Do not collect credential values, event codes or QR values in artifacts. Historical
masked Playwright screenshots are reused because this PR changes deployment
configuration, not UI. Local real-handler tests stub persistence and cannot prove
hosted database persistence.
