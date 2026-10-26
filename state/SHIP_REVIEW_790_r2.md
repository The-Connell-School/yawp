# Independent Ship Review r2 — PR #790

## Verdict: SHIP

**Reviewed head SHA:** `74bcc129b0eeee352fb10d8016fabd378b96fd34` (matches GitHub PR #790 head at review time)

**PR:** https://github.com/The-Connell-School/yawp/pull/790  
**Branch:** `cursor/harden-flaky-ci-8p-4774` → `main`  
**Title:** test: harden flaky CI (#8p)

**Prior review:** r1 **SHIP** at `76bdfa99faf08bfed2064a73a4a5e69c48f85755` ([docs PR #791](https://github.com/The-Connell-School/yawp/pull/791)). CI on that head passed Playwright but the **Demo feedback** job failed in the **EXIT trap** with `bash scripts/ci/demo-feedback-worktree-cleanup.sh` → **exit 127** (script not found) after `cd services/web-app` in the signed-out sub-step.

## What changed since r1

| Commit | Summary |
|--------|---------|
| `74bcc129b` | **fix(ci): use REPO_ROOT for demo-feedback cleanup traps** — cwd-safe traps, pre-bootstrap cleanup, `bin/project`, and signed-out Playwright `cd`. |
| *(r1 head)* `76bdfa99f` | Port-release stub in project-agent test (unchanged intent from r1). |

**Diff r1 → r2:** `.github/workflows/ci.yml` (demo-feedback run blocks only), `scripts/deployment-contract.test.ts` (+ regression test for REPO_ROOT + absolute cleanup path).

**Full diff vs `main` (unchanged file set from r1):** 9 files, +218 / −31 lines — same scope as r1 (CI, scripts, contracts, one E2E spec). No new product surface.

## EXIT-trap / cwd bug — fixed?

**Yes, fully for demo-feedback CI.**

Both demo-feedback browser run blocks now:

1. Set `REPO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"` and `cd "$REPO_ROOT"` before any trap registration.
2. Use `bash "$REPO_ROOT/scripts/ci/demo-feedback-worktree-cleanup.sh" …` in **EXIT trap** and **pre-bootstrap** cleanup (four call sites total in `ci.yml`; no relative `scripts/ci/…` paths remain in the workflow).
3. Invoke `"$REPO_ROOT/bin/project"` for bootstrap / fixture / dev / test.
4. Use `cd "$REPO_ROOT/services/web-app"` before signed-out Playwright (trap cwd no longer matters for cleanup path resolution, but absolute `cd` is correct).

`scripts/ci/demo-feedback-worktree-cleanup.sh` resolves its own `ROOT` from `${BASH_SOURCE[0]}` and `cd`s to repo root before teardown — safe when invoked via absolute path.

**Root cause at r1:** relative `bash scripts/ci/demo-feedback-worktree-cleanup.sh` in the trap; signed-out step ended in `services/web-app`, so the trap looked for `services/web-app/scripts/ci/…` → 127.

Repo search at reviewed head: **only** `"$REPO_ROOT/scripts/ci/demo-feedback-worktree-cleanup.sh"` references in `ci.yml`; no other demo-feedback traps.

## Contract coverage

- **New (since r1):** `deployment-contract.test.ts` — `demo feedback browser CI cleanup stays cwd-safe after cd into web-app` asserts workflow contains `REPO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"` and `"$REPO_ROOT/scripts/ci/demo-feedback-worktree-cleanup.sh"`.
- **From r1 (unchanged):** worktree setup contract asserts `release_postgres_host_port` + `scripts/ci/release-docker-host-port.sh`; CI validate job includes `release-docker-host-port.test.ts`.

**Non-blocking gap:** contract does not assert `"$REPO_ROOT/bin/project"` or `cd "$REPO_ROOT/services/web-app"` explicitly; the cleanup-path guard would fail if relative trap paths regress.

## Flake hardening (r1 baseline — still sound)

Unchanged at r2 head except cwd fix above:

- `release-docker-host-port.sh` — scoped port list only; used from worktree setup and demo-feedback cleanup.
- `worktree-local-setup.sh` — pre-bind port release + one retry on `docker run` failure.
- `dev-panel-free-tier-jumps.spec.ts` — `domcontentloaded` wait + 60s `pageTestId` visibility (assertions not weakened).

## Kevin / #608

No Kevin-track paths or `#608` references in `git diff origin/main...74bcc129b0eeee352fb10d8016fabd378b96fd34`.

## CI at reviewed head

- **🧪 Demo feedback + preview access browser checks:** **SUCCESS** on `74bcc129b` (no exit 127 in cleanup trap; Playwright path exercised).
- Other PR checks on the same push were green or in progress at review time; no failure attributed to demo-feedback cleanup cwd.

## Findings

1. **Resolved (was blocking post-r1):** relative cleanup script path in EXIT trap after `cd services/web-app`.
2. **Non-blocking:** `demo-feedback-worktree-cleanup.sh` still has no dedicated unit test; port-release and CI wiring covered elsewhere (same as r1).
3. **Non-blocking:** r1 SHIP preceded the cwd fix; r2 validates the follow-up commit before merge recommendation.

No findings warrant **BLOCK**.

## Recommendation

**SHIP** PR #790 at `74bcc129b0eeee352fb10d8016fabd378b96fd34`. Merge #790 through its own green CI gate; this review does **not** merge #790.
