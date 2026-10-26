# Independent Ship Review — PR #776 (r2)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/776 |
| Title | Quality sweep #8k: script logs + safe getErrorMessage UI text |
| Branch | `cursor/safe-error-logging-8k-c277` |
| Base | `main` @ `b4cb5db1be601b79926862f7b257c7496977334e` |
| Reviewed head | `490e1eda585f02dc0b5436c794bb3e6a71d07cde` |
| Prior review | r1 **BLOCK** @ `31df0654a432180f28305fae77cbaf8a6373e43f` ([docs PR #777](https://github.com/The-Connell-School/yawp/pull/777)) |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-26 |

## Verdict

**SHIP** on head `490e1eda585f02dc0b5436c794bb3e6a71d07cde`.

## Freshness

GitHub `headRefOid` for PR #776 matches the expected review SHA `490e1eda585f02dc0b5436c794bb3e6a71d07cde`. Merge-base with `origin/main` is `b4cb5db1be601b79926862f7b257c7496977334e` (0 commits behind `main`). No freshness block.

## r1 blocker resolution

r1 blocked on invalid TypeScript import syntax in five files where `logScriptError` was nested inside an existing multi-line `import { … }` block (commit `31df0654`).

Follow-up commit `490e1eda` (**Fix logScriptError import syntax in five script files**) moves each `logScriptError` import to its own top-level statement. Diff vs r1 head is exactly those five files (+5/−5 lines); no other behavioral or scope changes in the fix commit.

Verified at reviewed head:

| File | `logScriptError` import |
| --- | --- |
| `packages/prisma/scripts/org-membership-staging-verify.ts` | Standalone line before grouped `./org-membership-postcheck` import |
| `packages/prisma/scripts/seed-exit-ticket-assignment-type.ts` | Standalone before `./bootstrap-exit-ticket-assignment-type` import |
| `packages/prisma/scripts/seed-free-tier-bundle-assignment-types.ts` | Standalone before thesis-statement domain import block |
| `packages/prisma/scripts/seed-preview-planner-qa.ts` | Standalone before `./preview-planner-qa-ids` import |
| `services/web-app/scripts/capture-transactional-email-screenshots.ts` | Standalone before `./build-account-emails.server` import |

Repo scan on PR head: all 24 `logScriptError` call sites use top-level imports; no remaining nested-import pattern (`import {\nimport { logScriptError`).

## Scope (unchanged from r1 — 29 files)

Logging and safe error **text** only: `logScriptError` in script/CLI/e2e catches, shared `redactFreeformMessage` / `redact-email-for-log`, and `getErrorMessage` UI strings via freeform redaction. No Terraform, feature flags, or unrelated product changes.

### Behavior spot-check

- **Script exit behavior**: Unchanged at fix sites (e.g. `org-membership-staging-verify.ts` still `logScriptError(error)` then `process.exit(1)` in `main().catch`).
- **`getErrorMessage`**: String and `Error.message` paths use `uiSafeErrorText` → `redactFreeformMessage`; unknown shapes log scalar-safe metadata and return `Unknown Error`.
- **`logScriptError`**: Still `console.error(buildSafeErrorForLog(error))`.

## Verification

Local (PR head detached @ `490e1eda`):

```text
~/.bun/bin/bun test app/utils/misc.test.ts \
  app/utils/server-error-request-context.server.test.ts \
  app/utils/redact-email-for-log.server.test.ts
# 17 pass, 0 fail

NODE_OPTIONS='--max-old-space-size=8192' bun run typecheck  # services/web-app
# react-router typegen && tsc — exit 0
```

GitHub Actions for PR #776 (workflow run `40251606350`, triggered on `490e1eda`):

| Check | Status at review time |
| --- | --- |
| Changed paths | pass |
| Preview tooling | pass |
| ʦ TypeScript | in progress (local `tsc` clean on same tree) |
| Prisma migrations | in progress |
| E2E / browser shards | in progress |

r1’s TypeScript failure was caused by the five syntax errors; those are resolved. Remaining CI jobs were still running when this review was written; no new blockers identified in the diff.

## Blockers

None.

## Recommendation

Merge PR #776 when required CI checks (at minimum **ʦ TypeScript**) are green on `490e1eda585f02dc0b5436c794bb3e6a71d07cde`. This review did not modify application code on the feature branch.
