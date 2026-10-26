# Independent Ship Review — PR #781 (r1)

| Field | Value |
| --- | --- |
| **Verdict** | **SHIP** |
| **Reviewed head SHA** | `aa0c64a9960b6c79285ac64c7e071754b249626f` |
| **Application PR** | https://github.com/The-Connell-School/yawp/pull/781 |
| **Branch** | `cursor/safe-error-logging-8m-18a2` |
| **Base** | `main` @ `e2ad04ebf59dd814722bfd1d2a1e9b4f2c9430fb` |
| **Reviewer** | Independent Ship Review r1 (quality #8m) |
| **Review date** | 2026-10-26 |

## Freshness

- GitHub `headRefOid` matches the expected SHA exactly.
- Merge-base with `origin/main` is `e2ad04ebf59dd814722bfd1d2a1e9b4f2c9430fb` (current `main` tip). The PR is **two commits ahead** of `main`, **0 behind**; no freshness rebase required for this review.

## CI (snapshot)

At review time: **Changed paths** and **preview-policy** passed; TypeScript, Prisma migrations, migration-integration, preview tooling, and E2E shards were **pending**. This review does not gate on full green CI.

## Blockers

None.

## Scope check

| Area | Result |
| --- | --- |
| User-facing UI / product behavior | No changes |
| Feature flags / Terraform | Not touched |
| Secrets in diff | None |
| Behavioral change beyond logging | Preview ingress/wake and Prisma script **log payloads** only; HTTP status codes, catch/rethrow, and `process.exit` paths unchanged |

**Files changed (10):** `.github/workflows/preview-host-bootstrap.yml`, `scripts/preview/bootstrap-host.sh`, `scripts/preview/log-script-error.mjs`, `scripts/preview/log-script-error.test.js`, `scripts/preview/wake-server.mjs`, `scripts/preview/ingress-server.mjs`, `packages/prisma/scripts/migrate-remote.ts`, `packages/prisma/scripts/production-qa-profile-remote.ts`, `packages/prisma/scripts/preview-seats.ts`, `packages/prisma/sqlite-to-psql/migrate.ts`.

## Review focus

### Top-level imports (no #776 r1 nested-import regression)

All new `buildSafeErrorForLog` / preview helper imports are **standalone top-level** statements:

- Preview: `wake-server.mjs`, `ingress-server.mjs` → `./log-script-error.mjs`
- Prisma: four scripts → `../../../services/web-app/app/utils/server-error-request-context.server`

Repo scan on PR head: **no** dynamic `import()` and **no** nested `import {` inside another import block for these symbols.

### `scripts/preview/log-script-error.mjs`

- Plain-Node mirror of `buildSafeErrorForLog` / `logScriptError` (documented alignment with web-app helpers).
- Redacts token-like substrings, emails, URL query/hash; caps message length; includes sanitized V8 stack frames only when present.
- Prisma errors omit message body (name/code/stack), consistent with safe logging intent.
- `log-script-error.test.js` asserts token redaction contract.

### Bootstrap / preview-host sync

- `preview-host-bootstrap.yml` **scp** list includes `log-script-error.mjs` alongside `wake-server.mjs` and `ingress-server.mjs`.
- `bootstrap-host.sh` includes `log-script-error.mjs` in release **hash**, **install** into `ingress/releases/$release_id/`, so relative imports from deployed wake/ingress modules resolve on production preview hosts.

### Prisma remote / migration scripts

- Labeled `console.error('…', buildSafeErrorForLog(error))` at exception catch sites only.
- **SSH stderr stream** handlers remain `console.error(\`SSH Error: ${data}\`)` (unstructured chunks; correctly deferred).
- `sqlite-to-psql/migrate.ts` still `throw error` after logging in the inner catch; outer `process.exit(1)` unchanged.

### Deferred leftovers (accepted out of scope)

Application PR body lists remaining preview scripts (`smoke-login.mjs`, `certificate-manager.mjs`, etc.) and SSH stream lines — appropriately unchanged in this diff.

## Verification (reviewer)

Local runs on detached PR head @ `aa0c64a9960b6c79285ac64c7e071754b249626f`:

```text
bun test ./scripts/preview/log-script-error.test.js
# 1 pass, 0 fail

bun test ./scripts/preview/wake-server.test.js
# 21 pass, 0 fail

bun test app/utils/server-error-request-context.server.test.ts
# 11 pass, 0 fail

node -e "import('./scripts/preview/wake-server.mjs').then(() => console.log('wake-server import OK'))"
# wake-server import OK
```

## Summary

Focused completion of the #744 → #779 safe-error logging chain for **deferred** preview-host Node services and Prisma script call sites. Shipping the Node helper with bootstrap/workflow sync avoids preview-host module-not-found failures. No product or control-flow regressions identified. **Recommend merge of application PR #781** once CI completes satisfactorily.
