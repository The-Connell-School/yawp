# Independent Ship Review — PR #871 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/871  
**Title:** quality #8an — preview deploy log redaction (certificate-manager + preserve-demo-tester-feedback)  
**Base:** `main`  
**Reviewed head SHA:** `2e384019ae8ab60319da03e48f7e92d19d15e172`  
**Reviewer:** Independent ship review (Cloud Agent; did not author PR)  
**Date:** 2026-10-27  

SHIP

## Scope vs author claims

Diff `main...2e384019ae8ab60319da03e48f7e92d19d15e172` touches **exactly three files** (+39 / −5):

| File | Change |
|------|--------|
| `scripts/preview/certificate-manager.mjs` | Import `buildSafeErrorForLog`; DNS challenge cleanup warning, CLI failure loop, and ZeroSSL fallback rethrow use safe logging / redacted message text |
| `scripts/preview/preserve-demo-tester-feedback.mjs` | Top-level `catch` calls `logScriptError(error)` instead of raw `stderr.write` of `error.message` / `String(error)` |
| `scripts/preview/deploy-log-secrets.test.js` | Source-contract tests for both scripts |

No UI, feature flags, data model, or deploy-shell changes. Matches the PR description.

## Failure-path redaction (code review)

1. **`certificate-manager.mjs` deploy/CLI log paths**
   - DNS challenge removal warning: `console.error(..., buildSafeErrorForLog(error))` — no `` `${error.message}` `` on that path.
   - `waitForStatus` invalid ACME state: throws `new Error('ACME resource became invalid')` instead of `JSON.stringify(body.error || {})`, so ACME error payloads cannot leak into logs via that throw’s message.
   - ZeroSSL fallback branch: embeds `buildSafeErrorForLog(error).message ?? 'ACME issuance failed'` in the thrown `Error` (still redacted before any downstream log).
   - CLI maintenance failures: `console.error(\`${failure.hostname}:\`, buildSafeErrorForLog(failure.error))` — contract test rejects `` `${failure.error.message}` ``.

2. **Remaining `error.message` reads in `certificate-manager.mjs`** (lines ~234, ~280, ~349) are **internal retry / rethrow guards** (`/^ACME nonce request failed/` etc.), not `console.error` / deploy log emission. Acceptable; out of scope for this log-redaction sweep.

3. **`preserve-demo-tester-feedback.mjs`**
   - Only the top-level `catch` changed; informational `stderr.write` lines (usage, missing screenshot column) are unchanged and contain no exception dumps.
   - Failure path: `logScriptError(error)` → `console.error(buildSafeErrorForLog(error))` per `log-script-error.mjs`.

4. **Shared helper behavior** (`buildSafeErrorForLog`): redacts token/password/code-like substrings, emails, URLs; caps message length; Prisma errors omit raw message. Same pattern as `wake-server.mjs` / `ingress-server.mjs` / PR #867 smoke-login fix.

## Tests (local)

At reviewed head, with `/home/ubuntu/.bun/bin/bun test`:

```text
./scripts/preview/deploy-log-secrets.test.js → 7 pass (includes certificate-manager + preserve-demo-tester-feedback contracts)
./scripts/preview/log-script-error.test.js   → 1 pass
Total: 8 pass, 0 fail
```

Full `./bin/project test --profile changed` was not used as the gate (runs broad web-app suite; environment had unrelated failures). Targeted preview script tests are the relevant signal for this change.

## Security and behavior

- **Security:** Strict improvement — removes raw ACME JSON error dumps and raw exception strings from preview deploy log paths covered by this PR.
- **Behavior:** Certificate issuance / demo feedback export-restore logic unchanged; only failure **logging** and one **thrown** invalid-state message string (generic ACME invalid) differ. Operators lose verbatim ACME `body.error` in thrown text but still get hostname-scoped safe error objects on CLI failure output.
- **No drive-bys:** Single focused commit on the reviewed head.

## CI (observed at review time)

- **PASS:** Changed paths, preview-policy  
- **PENDING:** Preview tooling (primary runner for these script tests), TypeScript, migrations, E2E, preview-deploy, browser jobs  

No failed required checks observed at review time.

## Verdict

**SHIP** — Scoped preview deploy log redaction; claims verified on exact head; regression guarded by `deploy-log-secrets.test.js`. Safe to merge from an independent review perspective; this review does not merge.
