SHIP

**Reviewed head:** `5b6337782650cfd4ad7d1bc1558d3a7bde144f3b`  
**PR:** [#800 — ci: extend bun install hang harden to remaining workflows (#8t)](https://github.com/The-Connell-School/yawp/pull/800)  
**Branch:** `cursor/bun-install-hang-harden-97a4`  
**Base (tip):** `9ba20ab80fdfc31c3d9443e0746e7755752a37ff` (`main`)  
**Reviewer:** Independent ship review **r1** (not PR author)  
**Date:** 2026-10-26

## Verdict summary

The diff is scoped correctly to CI workflows and contract tests. Deploy and production QA install steps are wired to the same bounded frozen helper introduced in #798 (`scripts/ci/bun-install-frozen.sh`) with `timeout-minutes: 22`. Frozen install on deploy is consistent with PR CI gates and is safe given standard `actions/checkout` of the triggering commit. No changes to healthcheck probes, demo `reset_data`, or unrelated runner install paths. Contract tests cover deploy (2), production QA (1), migration-integration (1), and ci.yml (8). **Recommend merge of #800.**

## Scope (head vs base)

Three files, 58 insertions / 16 deletions:

| File | Change |
|------|--------|
| `.github/workflows/deploy.yml` | 2 install steps: `bun install` → helper + `timeout-minutes: 22` |
| `.github/workflows/production-qa-profile.yml` | 1 install step: same |
| `scripts/ci/bun-install-frozen.test.ts` | Parameterized workflow contract tests |

No product code, UI, feature flags, Terraform, or secrets changes.

## Checklist

### 1. Diff scope

Confirmed: workflow YAML and `bun-install-frozen.test.ts` only.

### 2. Deploy path — frozen install risk

Both affected deploy jobs use pinned `actions/checkout@v7.0.1` with no shallow/special ref that would omit `bun.lock`:

- `validate-prisma-migrations` — checkout → setup Bun 1.4.4 → install → migration validation chain unchanged after install.
- `deploy-web-app-production` — same checkout/install pattern; AWS/ECR/SSH/Prisma/Docker steps unchanged.

The helper runs `bun install --frozen-lockfile` from repo root (see `scripts/ci/bun-install-frozen.sh`). That is **stricter** than the previous bare `bun install` but aligns with #798’s CI posture: anything reaching `main` has already passed frozen installs in `ci.yml` and related jobs. Deploy checks out the same commit that triggered the workflow (`push` to `main` or `workflow_dispatch`), so lockfile and workspace should match.

**Residual (non-blocking):** A future lockfile/`package.json` drift that somehow bypassed CI would fail deploy at install rather than silently mutating the lockfile — desirable for production reproducibility.

Step timeout `22` minutes fits the helper default (2 × 10m attempt budget + 15s backoff ≈ 20m25s) plus runner overhead.

### 3. Intended sites wired; no semantic drift

- Only the three “📦 Install dependencies” / “Install dependencies” runner install steps in deploy and production QA were changed.
- `demo-environment.yml` `reset_data`, healthcheck curls (`/api/healthcheck`), and preview deploy probes were not modified in this diff.
- Post-install commands (`bun test`, `bun prisma:*`, Docker build/push, production QA Playwright/Chromium via `bunx`, etc.) are unchanged.

### 4. Contract tests

`workflowsRequiringBoundedFrozenInstall` asserts per workflow:

- Helper call count: **ci.yml 8**, **deploy.yml 2**, **migration-integration.yml 1**, **production-qa-profile.yml 1**
- No bare `run: bun install` or inline `run: bun install --frozen-lockfile` on named install steps
- Each install block contains `bash scripts/ci/bun-install-frozen.sh` and `timeout-minutes: 22`

**Local verification (reviewer):** `/home/ubuntu/.bun/bin/bun test ./scripts/ci/bun-install-frozen.test.ts` — 6 pass, 0 fail.

### 5. Left-alone workflows

Repo-wide search under `.github/workflows/` for `run:.*bun install` on runners: **no matches**. Remaining “bun install” strings are cache step titles in `ci.yml` only. Demo/preview workflows use SSH/`install` for host scripts, not runner `bun install` — correctly untouched.

## Findings

| Severity | Finding |
|----------|---------|
| — | No blockers. |

## Notes

- Builds on #798 (`scripts/ci/bun-install-frozen.sh` already on `main` at `9ba20ab80`).
- CI for #800 was in progress at review time; **Preview tooling** (includes `bun-install-frozen.test.ts`) had already succeeded on the PR run.
- This review does **not** merge #800.
