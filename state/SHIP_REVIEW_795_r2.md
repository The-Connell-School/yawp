# Independent Ship Review r2 — PR #795

| Field | Value |
| --- | --- |
| **Application PR** | [#795](https://github.com/The-Connell-School/yawp/pull/795) — `fix(health): /api/healthcheck fails when Postgres is unreachable` |
| **Branch** | `cursor/fix-healthcheck-db-probe-3117` |
| **Reviewed head (full SHA)** | `715855af59f5556f548990793b014aee3ce2e5c4` |
| **Prior review** | r1 **SHIP** @ `d3ed22c22c8e85ca31e160f15b6de210a112da22` ([docs PR #796](https://github.com/The-Connell-School/yawp/pull/796)) |
| **Base** | `origin/main` @ `0f8727459ba40054265bff6152a4799bb6310805` |
| **Reviewer** | Independent Ship Review (Cloud Agent r2) |
| **Date (UTC)** | 2026-10-26 |

## Verdict

**SHIP** — product tree unchanged from r1; healthcheck behavior and tests re-verified on this head. Do **not** merge #795 via this artifact.

## r2 trigger: head move without product diff

GitHub `headRefOid` for PR #795 is `715855af59f5556f548990793b014aee3ce2e5c4`.

The only commit since r1 is `715855af` — **`ci: retrigger after hung E2E smoke shard 3`** (empty commit).

| Check | Result |
| --- | --- |
| `git diff d3ed22c..715855af` | Empty (no hunks) |
| Tree SHA @ r1 head | `08f6393a409fcc6c5532c77be317dd8007887064` |
| Tree SHA @ r2 head | `08f6393a409fcc6c5532c77be317dd8007887064` |

No unintended product, UI, flag, Terraform, or workflow file changes were introduced by the retrigger commit.

## Scope (unchanged from r1)

Three-way diff `origin/main...715855af59f5556f548990793b014aee3ce2e5c4`:

| File | Change |
| --- | --- |
| `services/web-app/app/routes/api.healthcheck.ts` | `isDatabaseReady()` → 200/`OK` or 503/`UNAVAILABLE` |
| `services/web-app/app/health/api-healthcheck.test.ts` | Success, failure, no secret leakage in body or logs |
| `scripts/deployment-contract.test.ts` | Static contract: route uses `isDatabaseReady` and 503 |

## Behavioral checklist (re-verified @ r2 head)

| Criterion | Result | Notes |
| --- | --- | --- |
| DB down → 503 + `UNAVAILABLE` | **Pass** | Loader returns non-2xx when probe fails |
| DB up → 200 + `OK` | **Pass** | Unit test asserts status and body |
| No secret/error leakage in response | **Pass** | Body is literal `UNAVAILABLE`; test rejects `secret` / `postgres` / `@` |
| Shared probe with readyz semantics | **Pass** | Same `isDatabaseReady()` (`SELECT 1`, 2s timeout, 2s cache, single-flight) as `/api/readyz` |
| Unit + deployment-contract coverage | **Pass** | 2 runtime tests + 1 static contract test |
| `/api/readyz` / unrelated product | **Pass** | Not in PR diff; readyz tests still pass on same tree |

## Verification executed (review head)

Detached checkout @ `715855af59f5556f548990793b014aee3ce2e5c4`:

```text
bun test services/web-app/app/health/api-healthcheck.test.ts  → 2 pass
bun test services/web-app/app/health/api-readyz.test.ts       → 4 pass
bun test ./scripts/deployment-contract.test.ts -t "deploy health probe" → 1 pass
```

## CI / deploy signal (r2 head)

Workflow runs triggered on `715855af` at review time:

| Workflow | Status @ review time |
| --- | --- |
| Migration Integration | success |
| PR preview | success (preview deploy + policy) |
| CI (main PR gate) | pending (retrigger after hung E2E smoke shard 3) |

r2 does not change application code; r1’s SHIP rationale stands. Remaining CI completion is an operational gate, not a new product defect on this tree.

## Findings

### Blocking

None.

### Non-blocking

1. Same as r1: deployment-contract assertion is static; runtime behavior covered by unit tests.
2. Shared 2s readiness cache between `/api/healthcheck` and `/api/readyz` (intentional).

## Recommendation

**SHIP** PR #795 at head `715855af59f5556f548990793b014aee3ce2e5c4`. Merge when repo CI policy is satisfied on that SHA. This review does not merge #795.
