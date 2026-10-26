# Independent Ship Review r1 — PR #795

| Field | Value |
| --- | --- |
| **Application PR** | [#795](https://github.com/The-Connell-School/yawp/pull/795) — `fix(health): /api/healthcheck fails when Postgres is unreachable` |
| **Branch** | `cursor/fix-healthcheck-db-probe-3117` |
| **Reviewed head (full SHA)** | `d3ed22c22c8e85ca31e160f15b6de210a112da22` |
| **Base** | `origin/main` at review time (`0f8727459…`) |
| **Reviewer** | Independent Ship Review (Cloud Agent r1) |
| **Date (UTC)** | 2026-10-26 |

## Verdict

**SHIP** — merge gate satisfied for the stated quality #8r scope. Do **not** squash-merge via this review artifact; merge #795 per repo policy when the driver is ready.

## Scope reviewed

Full three-way diff `origin/main...d3ed22c22c8e85ca31e160f15b6de210a112da22`:

| File | Change |
| --- | --- |
| `services/web-app/app/routes/api.healthcheck.ts` | Delegate to `isDatabaseReady()`; 200/`OK` vs 503/`UNAVAILABLE` |
| `services/web-app/app/health/api-healthcheck.test.ts` | Success, failure, no-leakage tests |
| `scripts/deployment-contract.test.ts` | Static contract: route uses `isDatabaseReady` and 503 |

No Terraform/tfvars, CI workflow, worktree scripts, or unrelated product changes in this PR diff.

## Behavioral checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| DB down → non-2xx | **Pass** | Returns **503** when `isDatabaseReady()` is false |
| Response body safe (no secret leakage) | **Pass** | Body is literal `UNAVAILABLE`; errors logged as `{ kind }` only via shared helper |
| Tests: success + failure + no leakage | **Pass** | `api-healthcheck.test.ts` (2 tests); contract test guards regression to always-200 |
| `/api/readyz` unchanged | **Pass** | Not modified in PR; existing `api-readyz.test.ts` still passes at same head |
| Probe semantics correct for App Runner / deploy | **Pass** | Same shared probe as readyz (`SELECT 1`, 2s timeout, 2s cache, single-flight) |
| Kevin / #608 untouched | **Pass** | No files or references in this diff tied to Kevin or issue #608 |

## Implementation notes

`/api/healthcheck` now mirrors the database portion of readiness using the existing `isDatabaseReady()` helper in `db-readiness.server.ts` (already used by `/api/readyz`). Failure paths log `[readyz] database check failed` with `{ kind: 'timeout' \| error.name \| 'unknown' }` — not connection strings or driver messages.

Preview/Docker tooling already treats non-OK healthcheck as failure (`curl -fsS`, `response.ok`); that behavior now correctly waits for Postgres, aligned with `smoke-login.mjs` expecting HTTP 200 when the stack is healthy.

## Deploy / load-balancer risk

**App Runner** (`infra/main.tf`, unchanged in PR): path `/api/healthcheck`, `interval = 10`, `unhealthy_threshold = 5`, `timeout = 5`, `healthy_threshold = 1`. Up to **five consecutive failed probes** (~50s at nominal interval) are tolerated before marking the instance unhealthy — brief 503s during cold start (app up, DB not yet reachable) are expected and mitigated by this threshold.

**Residual risk (accepted, not blocking):** A deploy where Postgres remains unreachable for longer than that window could fail the revision health check; that is desirable fail-closed behavior for quality #8r, not a silent always-200 route. Production RDS is expected to be up before/new alongside web tasks; boot-time DB connection is typically well inside 50s.

No change to in-app preview gate routing; contract comments note `/api/healthcheck` stays outside the master-org gate.

## Verification executed (review head)

Checked out `d3ed22c22c8e85ca31e160f15b6de210a112da22` and ran:

```text
bun test services/web-app/app/health/api-healthcheck.test.ts  → 2 pass
bun test services/web-app/app/health/api-readyz.test.ts       → 4 pass
bun test ./scripts/deployment-contract.test.ts -t "deploy health probe" → 1 pass
```

## Findings

### Blocking

None.

### Non-blocking

1. **Contract test is static** — it asserts source contains `isDatabaseReady` and `503`; runtime behavior is covered by unit tests, not an integration test against a down Postgres.
2. **Shared cache with readyz** — concurrent `/api/healthcheck` and `/api/readyz` hits share the 2s readiness cache (intentional, reduces DB load).

## Recommendation

**SHIP** PR #795 at head `d3ed22c22c8e85ca31e160f15b6de210a112da22`. This review does not merge #795.
