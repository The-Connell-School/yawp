# Independent Ship Review — PR #727 (round 1)

| Field | Value |
| --- | --- |
| **Verdict** | **BLOCK** |
| **Head SHA (exact)** | `40bd8be0b9b99fd3eac83ec37ba4c647a2f7bac9` |
| **Branch** | `cursor/weekend-qa-sweep-7b08` |
| **PR** | https://github.com/The-Connell-School/yawp/pull/727 |
| **Reviewer** | Independent ship review (Cloud Agent) |
| **Reviewed at (UTC)** | 2026-10-25 |

## One-line reason

**BLOCK:** CI `ʦ TypeScript` fails on new join-flow test typing (`TS2339` on `ensurePlatformCatalogAssignmentType` `where` parameter).

## Scope vs diff (vs `origin/main`)

Two commits on the PR; **5 files**, **+85 / −22** lines — matches claimed scope:

| Claim | Files | Assessment |
| --- | --- | --- |
| Join-flow integration test: minimal catalog seeds + 15s timeout | `site-license-locked-tiles.join-flow.integration.test.ts` | Matches intent; removes `importProdFidelityFixtures` fallback |
| Deploy log copy on timeout + success | `run-host-deploy-detached.sh`, `deploy-log-secrets.test.js` | Refactor to `copy_deploy_log_local`; timeout path uses `\|\| true` |
| `@faker-js/faker` ^10.6.0 | `packages/prisma/package.json`, `bun.lock` | DevDependency in `@app/prisma` only |

No Kevin PR branches touched. No `DEMO_RESET_DATA`, workflow prod-flag, or deploy-script prod toggles in this delta.

## Checklist

| Check | Result | Notes |
| --- | --- | --- |
| CI green or failures understood | **Fail (understood)** | Only failure observed: **ʦ TypeScript** (job `121048760324`). Other jobs still running/pending at review time; migration-integration and preview-deploy already green. |
| No secrets printed | **Pass** | `copy_deploy_log_local` runs `mask_deploy_log` before retaining `LOCAL_LOG_COPY`; failure tail re-masks. Static test `deploy-log-secrets.test.js` updated and passes locally (4/4). |
| No `DEMO_RESET_DATA` / prod flag changes | **Pass** | Grep of PR diff: no matches. |
| No Kevin PR touch | **Pass** | Diff limited to files above. |
| Diff matches claimed scope | **Pass** | See table. |
| Timeout / log copy safe | **Pass** | Timeout: best-effort SCP then masked tail (no secret regression vs prior success path). Success path still `set -e` on SCP failure (unchanged semantics). |
| Faker bump packages/prisma only | **Pass** | Sole `package.json` change; lockfile resolves `@faker-js/faker@10.6.0`. |

## CI detail — TypeScript failure (blocking)

Reproduced locally at head:

```text
site-license-locked-tiles.join-flow.integration.test.ts(19,64): error TS2339:
Property 'where' does not exist on type '{ ... } | undefined'.
```

Root cause: `Parameters<typeof prisma.assignmentType.findFirst>[0]['where']` — argument `0` is optional, so indexing `['where']` is invalid.

**Suggested fix:** e.g. `NonNullable<Parameters<typeof prisma.assignmentType.findFirst>[0]>['where']` or import `Prisma.AssignmentTypeWhereInput`.

## Local verification (head)

- `bun test ./scripts/preview/deploy-log-secrets.test.js` — **pass** (4 tests).
- Full `typecheck` — **fail** with error above (same as CI).
- Join-flow integration test not run here (requires `FREE_TIER_DB_TESTS=1` + migrated Postgres).

## Deploy script review (non-blocking)

- Extracted `copy_deploy_log_local()` deduplicates SCP + mask for success and timeout paths.
- Timeout branch: `copy_deploy_log_local || true` avoids masking a timeout as SCP hard-failure.
- `emit_failure_log_tail` prefers masked local copy when present — improves CI/debug context on slow deploys.

## Faker / advisory

- Bump addresses GHSA-qxc2-j82w-r537; scoped to prisma seeds/dev tooling only — acceptable for this sweep.

## Recommendation

Fix the TypeScript error on the join-flow test helper, push, and re-run CI. Re-review after green `ʦ TypeScript` and completed **Prisma migrations** job (validates the original 5s timeout flake fix).

**Do not merge** at `40bd8be0b9b99fd3eac83ec37ba4c647a2f7bac9`.
