# Independent Ship Review — PR #867 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/867  
**Title:** Quality sweep #8am: redact preview login smoke deploy failure logs  
**Base:** `main`  
**Reviewed head SHA:** `0de85601f165ae9371c5fba64b335baba852aee1`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## Scope vs author claims

Diff `main...0de85601f165ae9371c5fba64b335baba852aee1` touches **exactly three files** (+42 / −1):

| File | Change |
|------|--------|
| `scripts/preview/smoke-login.mjs` | Import `logPrefixedScriptError`; add exported `logPreviewLoginSmokeFailure`; CLI `catch` uses it instead of `` `Preview login smoke failed: ${error.message \|\| error}` `` |
| `scripts/preview/smoke-login.test.js` | Canary: `logPreviewLoginSmokeFailure` redacts token-like substrings |
| `scripts/preview/deploy-log-secrets.test.js` | Contract: source must use safe logging and must not contain old `` `${error.message}` `` interpolation |

No UI, deploy shell, or unrelated product changes. Matches the PR description.

## Failure-path redaction (code review)

1. **Only CLI failure logging changed.** `main()` still sets `process.exitCode = 1` in the `catch`; smoke behavior and exit semantics unchanged.
2. **Failure path:** `catch` → `logPreviewLoginSmokeFailure(error)` → `logPrefixedScriptError('Preview login smoke failed:', error)` → `console.error(prefix, buildSafeErrorForLog(error))` (`log-script-error.mjs`).
3. **`buildSafeErrorForLog`** redacts `error.message` via `redactFreeformMessage` (token/password/code patterns, emails, URLs, length cap). Non-`Error` values are stringified then redacted. No remaining `error.message` or `console.error` interpolation in `smoke-login.mjs` (grep clean).
4. **Success path unchanged:** `console.log` still prints login email on success (pre-existing; out of scope for this deploy-log fix).

## Tests (local)

Executed at reviewed head with `/home/ubuntu/.bun/bin/bun test`:

```text
./scripts/preview/smoke-login.test.js       → 22 pass (includes logPreviewLoginSmokeFailure canary)
./scripts/preview/deploy-log-secrets.test.js → 5 pass (includes smoke-login source contract)
./scripts/preview/log-script-error.test.js → 1 pass
Total: 28 pass, 0 fail
```

Canary proves `password=super-secret-token` becomes `[redacted-token]` and never appears in captured `console.error` args.

## Drive-bys / security

- **No weakened security:** Strictly replaces raw exception strings with existing shared redaction helper used by other preview `.mjs` scripts (`wake-server.mjs`, `ingress-server.mjs`).
- **No drive-bys:** Single focused commit; exporting `logPreviewLoginSmokeFailure` is for testability only.
- **Residual (non-blocking):** Redaction follows shared `TOKEN_LIKE` heuristics; bare preview seat codes in a message without `code=` / `password=` etc. may still appear (same as other callers of `buildSafeErrorForLog`). This PR still strictly improves over printing raw `error.message`.

## CI (observed at review time)

- **PASS:** Changed paths, preview-policy  
- **IN_PROGRESS / pending:** Preview tooling, TypeScript, Prisma migrations, E2E shards, preview-deploy, browser jobs  

Preview tooling is the likely runner for these script tests; full CI was not complete when this review was written. No CI failure observed on completed checks.

## Verdict

**SHIP** — Scoped deploy-log safety fix; failure path routes through `buildSafeErrorForLog`; tests and source contract guard regression. Safe to merge from an independent review perspective; this review does not merge.
