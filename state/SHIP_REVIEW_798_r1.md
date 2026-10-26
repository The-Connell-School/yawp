# Independent ship review r1 — application PR #798

**Verdict:** SHIP

**Reviewed head SHA:** `f318c081291b6d8d8d81dc4b1862eba9f359ab54`

**Application PR:** https://github.com/The-Connell-School/yawp/pull/798 (`cursor/ci-harden-bun-install-hangs-b654`)

**Base compared:** `main` at `42d2c692f` (fetched 2026-10-26)

**Reviewer role:** Independent (not PR author). This artifact does not merge #798.

---

## Scope confirmation

Diff `42d2c692f..f318c081291b6d8d8d81dc4b1862eba9f359ab54` touches **four files only**:

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Wire helper + `timeout-minutes: 22` on install steps; add contract test to deployment-contract job |
| `.github/workflows/migration-integration.yml` | Same wiring for `Install deps` |
| `scripts/ci/bun-install-frozen.sh` | New CI helper (executable `100755`) |
| `scripts/ci/bun-install-frozen.test.ts` | Contract tests |

No product UI, feature flags, Terraform, secrets, or App Runner / deploy healthcheck workflow changes.

---

## Findings

### Blockers

None.

### Non-blocking nits

1. **Workflow test coverage is partial.** `bun-install-frozen.test.ts` asserts `ci.yml` no longer pairs `📦 Install dependencies` with bare `bun install --frozen-lockfile`, and that at least one such step includes `timeout-minutes: 22`. It does not assert all eight `ci.yml` steps or `migration-integration.yml` individually (manual diff confirms all nine former frozen-lockfile call sites are updated).

2. **Out-of-scope install paths unchanged.** `deploy.yml` and `production-qa-profile.yml` still run non-frozen `bun install` without the helper. Reasonable for this PR’s stated goal (frozen-lockfile CI hangs); those paths could hang similarly in theory.

3. **Slow-but-successful installs near 10m.** Default `BUN_INSTALL_ATTEMPT_TIMEOUT=10m` per attempt (max two attempts, 15s backoff) can cancel a legitimately slow registry fetch and retry once. Step `timeout-minutes: 22` is an appropriate outer bound; teams should watch for flaky double-timeout failures after merge.

4. **Complexity vs GNU `timeout`.** The helper implements wall-clock polling and process-group teardown instead of relying on coreutils `timeout`. Tradeoff: no dependency on `timeout` on runners, but more bash surface area. Self-check mode and contract tests mitigate regression risk.

---

## Checklist verification

### 1. Script correctness

- **Per-attempt wall clock:** `run_timed_in_process_group` polls elapsed time against `attempt_timeout` (default `10m`, clamped to `BUN_INSTALL_ATTEMPT_TIMEOUT_MAX` default `15m`); on exceed returns **124** after TERM/KILL on the install process group (with pid-tree fallback).
- **Retry policy:** Loop `max_attempts=2`; retries only when `exit_code -eq 124`. Non-124 exits log `not retrying non-timeout failures` and propagate the exit code immediately.
- **Lockfile / resolution errors:** Mocked `bun` exiting `1` on install invokes exactly one install attempt (verified by test).
- **Working directory:** `repo_root` derived from `scripts/ci/../..`; `run_bun_install` `cd`s there before `bun install --frozen-lockfile`. CI invokes `bash scripts/ci/bun-install-frozen.sh` from repository root (standard checkout layout).
- **Invocation:** Workflows use explicit `bash scripts/...` (not dependent on shebang alone); script mode is `100755`.

### 2. Workflow wiring

- **Before (main):** Nine `bun install --frozen-lockfile` invocations — eight under `ci.yml` `📦 Install dependencies`, one under `migration-integration.yml` `Install deps`.
- **After (head):** All nine replaced with `timeout-minutes: 22` + `bash scripts/ci/bun-install-frozen.sh`.
- **Backstop math:** 2 × 10m attempts + 15s backoff ≈ 20.25m < 22m step limit < prior ~55m hang observed on bare install.
- **Deploy / healthcheck:** No edits to demo/preview healthcheck curls, App Runner deploy probes, or application runtime behavior.

### 3. Tests

Ran at reviewed head on Ubuntu (GitHub Actions–class environment):

```text
bun test ./scripts/ci/bun-install-frozen.test.ts
# 3 pass, 0 fail
```

Additional manual run:

```text
BUN_INSTALL_SELF_CHECK=1 BUN_INSTALL_ATTEMPT_TIMEOUT=2s bash scripts/ci/bun-install-frozen.sh
# SELF_CHECK: bun-install-frozen timing checks passed
```

Contract tests cover: self-check timing, stall→retry (two invocations) vs lockfile failure→no retry (one invocation), and `ci.yml` routing away from bare frozen install.

The deployment-contract CI job includes `./scripts/ci/bun-install-frozen.test.ts` so regressions fail on paths that run that job.

### 4. Risks assessed

| Risk | Assessment |
|------|------------|
| False cancel of slow healthy install | Possible near 10m/attempt; one retry; monitor CI |
| `timeout` / PATH on GHA | Uses bash + `setsid`/`ps`/`kill`; no GNU `timeout` required |
| Script not executable / wrong cwd | Explicit `bash` + repo-root resolution |
| Retry masking bad lockfile | Not observed; non-124 fails fast |

---

## What was verified

- [x] Exact diff head vs base (`git diff 42d2c692f..f318c081291b6d8d8d81dc4b1862eba9f359ab54`)
- [x] All former `--frozen-lockfile` workflow call sites in `ci.yml` and `migration-integration.yml`
- [x] Script executable bit and retry-only-on-124 logic (read + tests)
- [x] Contract tests executed locally at head SHA
- [x] No collateral changes to deploy healthcheck or product code paths

---

## Recommendation

**Ship** application PR #798 at `f318c081291b6d8d8d81dc4b1862eba9f359ab54`. CI-only hardening matches the incident (#795 shard hang); behavior is test-backed and appropriately bounded.
