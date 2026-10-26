# Independent Ship Review — PR #776 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/776 |
| Title | Quality sweep #8k: script logs + safe getErrorMessage UI text |
| Branch | `cursor/safe-error-logging-8k-c277` |
| Base | `main` @ `b4cb5db1be601b79926862f7b257c7496977334e` |
| Reviewed head | `31df0654a432180f28305fae77cbaf8a6373e43f` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-26 |

## Verdict

**BLOCK** on head `31df0654a432180f28305fae77cbaf8a6373e43f`.

## Freshness

GitHub `headRefOid` for PR #776 matches the expected review SHA `31df0654a432180f28305fae77cbaf8a6373e43f`. Merge-base with `origin/main` is `b4cb5db1be601b79926862f7b257c7496977334e` (0 commits behind `main`). No freshness block.

## Blockers

### 1. Invalid TypeScript import syntax (5 files)

Automated insertion placed `logScriptError` **inside** an existing multi-line `import { … }` block, producing parse errors (`TS1003` / `TS1005`). CI **ʦ TypeScript** failed on the PR run (`40251228658`).

Affected paths:

- `packages/prisma/scripts/org-membership-staging-verify.ts`
- `packages/prisma/scripts/seed-exit-ticket-assignment-type.ts`
- `packages/prisma/scripts/seed-free-tier-bundle-assignment-types.ts`
- `packages/prisma/scripts/seed-preview-planner-qa.ts`
- `services/web-app/scripts/capture-transactional-email-screenshots.ts`

Example (broken):

```typescript
import {
import { logScriptError } from '...';
  buildPostcheckReport,
```

**Fix:** Move `logScriptError` to its own top-level import statement in each file, then re-run TypeScript CI.

Until this is corrected, seed/preview scripts and the email capture script do not compile; merge would break local preview seeds and related tooling.

## Scope (29 files — logging / message shaping only)

Theme matches quality sweep #8k: replace raw `console.error(error)` in script/CLI/e2e catch handlers with `logScriptError`, extract shared `redactFreeformMessage` / `redact-email-for-log`, and pipe `getErrorMessage` UI strings through freeform redaction. No Terraform, feature flags, Kevin territory, or visual design changes beyond safer error **text** in UI.

### Intended behavior (when compile-clean)

- **`logScriptError`**: `console.error(buildSafeErrorForLog(error))` — structured, redacted metadata instead of dumping raw `Error` objects (stacks/messages with tokens).
- **Script exit behavior**: Unchanged at reviewed call sites — still `process.exit(1)` or `process.exitCode = 1` where present before; only the log line changes.
- **`getErrorMessage`**: String and `Error.message` paths run through `redactFreeformMessage`; empty-after-redaction falls back to `error.name` or `Unknown Error`. Unknown shapes still log scalar-safe metadata and return `Unknown Error` (no raw object text to UI).

### Cross-package imports

Prisma scripts import `logScriptError` from `services/web-app/app/utils/` — consistent with existing domain imports in the same scripts; acceptable for this sweep once syntax is fixed.

## Verification

Spot-check at reviewed head (core utilities only; full repo `changed` profile not used due to unrelated env failures):

```text
~/.bun/bin/bun test app/utils/misc.test.ts \
  app/utils/server-error-request-context.server.test.ts \
  app/utils/redact-email-for-log.server.test.ts
# 17 pass, 0 fail
```

Local `tsc` on `org-membership-staging-verify.ts` reproduces the import parse errors above.

GitHub Actions for PR #776 at review time (run `40251228658`): **Changed paths** and **Preview tooling** green; **ʦ TypeScript** and **Prisma migrations** **fail**; multiple E2E/browser jobs also failed (likely downstream of compile/deploy breakage — not independently root-caused here).

## Recommendation

Do **not** merge PR #776 until the five broken imports are fixed and TypeScript (at minimum) is green on the same head. Re-request independent ship review r2 after fix. This review did not modify application code on the feature branch.
