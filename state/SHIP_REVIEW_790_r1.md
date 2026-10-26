# Independent Ship Review r1 — PR #790

## Verdict: SHIP

**Reviewed head SHA:** `76bdfa99faf08bfed2064a73a4a5e69c48f85755` (matches GitHub PR head at review time)

**PR:** https://github.com/The-Connell-School/yawp/pull/790  
**Branch:** `cursor/harden-flaky-ci-8p-4774` → `main`  
**Title:** test: harden flaky CI (#8p)

## Scope summary

Diff vs `origin/main`: **9 files**, +197 / −23 lines. Claimed scope (tests/CI/scripts only) holds:

| Area | Files |
|------|--------|
| CI workflow | `.github/workflows/ci.yml` |
| Scripts | `scripts/ci/release-docker-host-port.sh`, `scripts/ci/demo-feedback-worktree-cleanup.sh`, `scripts/worktree-local-setup.sh` |
| Tests / contracts | `release-docker-host-port.test.ts`, `worktree-local-setup.test.ts`, `deployment-contract.test.ts`, `project-agent.test.js` |
| E2E | `services/web-app/e2e/tests/dev-panel-free-tier-jumps.spec.ts` only |

No product routes/components, Prisma schema, secrets, tfvars, Kevin-track, or **#608** references in the changed set.

## Flake-fix soundness

### Port release (`release-docker-host-port.sh`)

- **Scoping:** Removes only containers explicitly listed as host TCP publish targets. Invalid ports are rejected; missing `docker` exits 0 (no-op).
- **Mechanism:** Uses `docker ps --filter publish=PORT` plus a fallback scan via `docker port` when the filter misses mappings — appropriate for CI “address already in use” on fixed `RECORD_PORT_*` values.
- **Safety:** Does not run `docker system prune`, does not stop all containers, and does not touch ports outside the caller’s argument list. On demo-feedback CI, cleanup passes **54489, 54490, 5489, 5490** — the same reserved demo-feedback app/database ports already declared in `ci.yml` env blocks.
- **Residual risk (non-blocking):** Any *other* container on those exact host ports on the runner would be removed. That is intentional for shared CI runners and matches the job’s fixed port contract; local developers should not bind unrelated services to those RECORD ports.

### Demo-feedback cleanup (`demo-feedback-worktree-cleanup.sh`)

- **Not overly broad:** Stops dev via `bin/project dev stop`, then removes **only** `CONTAINER_NAME` / `VOLUME_NAME` from `.worktree-local/config.env` (same behavior as the inlined trap it replaces), then calls port release with explicit ports.
- **CI traps:** Both demo-feedback browser sub-steps register `trap cleanup EXIT` **and** run cleanup once before `bootstrap --fresh`, closing the race where sub-step 1’s Postgres still holds `54489` when sub-step 2 binds `54490`.

### Worktree Postgres bind (`worktree-local-setup.sh`)

- **`release_postgres_host_port`** runs before bind/restart and only for configured `PG_PORT`.
- **Retry:** One retry on failed `docker run` with container remove + second port release — targets stale anonymous publishers without masking persistent misconfiguration (hard fail on second attempt).
- **Note:** Port release at the start of `ensure_postgres` can remove the worktree’s own container if it currently publishes `PG_PORT`; the existing volume-backed recreate path remains correct.

### Jump catalog E2E (`dev-panel-free-tier-jumps.spec.ts`)

- Adds `waitForLoadState('domcontentloaded')` after the existing 120s `waitForURL` — addresses hydration timing for states such as `approved.reporter-limit` (`pageTestId: free-reporter-monthly-limit`) without dropping pathname or toast checks.
- **`pageTestId` visibility timeout 30s → 60s:** Assertion unchanged (`toBeVisible` on the same test id); longer budget for slow CI hydration, not softened expectations.

### Contracts / CI wiring

- `deployment-contract.test.ts` asserts `release_postgres_host_port` and `scripts/ci/release-docker-host-port.sh` in worktree setup.
- Validate deployment contract job now includes `release-docker-host-port.test.ts`.

## Kevin / #608

No edits under Kevin-track paths; no `#608` or Kevin-specific references in the PR diff.

## Verification (reviewer)

At reviewed head (scripts checked out from PR branch tip):

```bash
bun test ./scripts/ci/release-docker-host-port.test.ts ./scripts/worktree-local-setup.test.ts
bun test ./scripts/deployment-contract.test.ts -t "worktree local setup contract"
bun test ./scripts/project-agent.test.js -t "worktree setup preserves"
```

All **12** targeted tests **pass** (Bun 1.4.4).

Full diff read: `git diff origin/main...76bdfa99faf08bfed2064a73a4a5e69c48f85755`.

## Findings

1. **Non-blocking:** `demo-feedback-worktree-cleanup.sh` has no dedicated unit test; behavior is covered indirectly via CI usage and port-release tests. Acceptable for this scope.
2. **Non-blocking:** `ensure_postgres` always releases `PG_PORT` before inspect/restart — slightly more aggressive than “stale container only,” but volume-backed recreate is correct and fixes unnamed stale publishers on CI.

No findings warrant **BLOCK** (no scope creep, no assertion weakening, cleanup/port release correctly tied to CI worktree ports).

## Recommendation

**SHIP** PR #790 at `76bdfa99faf08bfed2064a73a4a5e69c48f85755`. Do **not** merge via this review PR; merge #790 through its own CI green gate when ready.
