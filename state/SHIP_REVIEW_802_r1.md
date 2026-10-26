# Independent Ship Review r1 — PR #802

| Field | Value |
| --- | --- |
| **Application PR** | [#802](https://github.com/The-Connell-School/yawp/pull/802) — `fix(version): set YAWP_ENVIRONMENT in production (#8u)` |
| **Reviewed head (exact)** | `6847511d7ee33231104ea14f11d2698d3a3a087f` |
| **Branch** | `cursor/fix-yawp-environment-production-3483` |
| **Base at review** | `main` @ `6d79cbb45` (merge-base with #800) |
| **Reviewer** | Independent ship review (Cloud Agent r1) |
| **Date (UTC)** | 2026-10-26 |

## Verdict: **SHIP**

PR #802 is a minimal, correct fix for production `/api/version` reporting `environment: "unknown"`. Scope is limited to the production Docker stage and the deployment contract that guards it. Demo and preview behavior remain governed by existing build-args and compose runtime env. No merge of #802 is performed by this review artifact.

---

## Root-cause correctness

**Symptom:** Production `GET /api/version` returned `environment: "unknown"`.

**Mechanism:** `getBuildMetadata()` reads runtime `process.env.YAWP_ENVIRONMENT` with fallback `"unknown"`:

```5:6:services/web-app/app/utils/build-metadata.server.ts
    environment: process.env.YAWP_ENVIRONMENT?.trim() || 'unknown',
```

The Dockerfile already set `ARG`/`ENV YAWP_ENVIRONMENT=production` on the **`build`** stage (for Vite / dev-panel compile-time gating). The **`production`** runtime stage forwarded `YAWP_GIT_COMMIT` and `YAWP_BUILT_AT` but omitted `YAWP_ENVIRONMENT`. App Runner does not inject that variable at runtime, so the Node process saw an unset value.

**Fix:** Mirror the commit/builtAt pattern on the production stage: `ARG YAWP_ENVIRONMENT=production` and `ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT` immediately before the existing git/builtAt args. Default remains `production` when no build-arg is passed (production ECR/App Runner path).

Root cause and fix align.

---

## Dockerfile production-stage review

Diff vs `main` (production stage only):

```diff
 EXPOSE 8080
+ARG YAWP_ENVIRONMENT=production
 ARG YAWP_GIT_COMMIT=unknown
 ARG YAWP_BUILT_AT=unknown
+ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT
 ENV YAWP_GIT_COMMIT=$YAWP_GIT_COMMIT
 ENV YAWP_BUILT_AT=$YAWP_BUILT_AT
```

**Assessment:**

- Production images built via `web-app:docker:build` (no `YAWP_ENVIRONMENT` build-arg) bake `YAWP_ENVIRONMENT=production` into the runtime container env — satisfies App Runner.
- Build stage unchanged in behavior; still defaults to `production` for Vite unless overridden.
- No new secrets, database URLs, or healthcheck wiring.
- No Terraform / infra changes in this PR.

---

## Deployment contract test flip

The contract test `dev panel Docker build args default to production; demo web image passes demo` intentionally **reversed** the old guard that forbade `ENV YAWP_ENVIRONMENT` in the production stage. It now **requires**:

1. `ARG YAWP_ENVIRONMENT=production` and `ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT` after `FROM base AS production`.
2. The `EXPOSE 8080` … `CMD` block includes `YAWP_ENVIRONMENT` in the same order as git commit env vars.
3. Build stage still has `ARG YAWP_ENVIRONMENT=production` and still must **not** contain `YAWP_GIT_COMMIT` / `YAWP_BUILT_AT`.

**Repo scan:** No remaining tests or docs assert that `YAWP_ENVIRONMENT` must **not** appear in the production stage (the prior `not.toMatch(/FROM base AS production[\s\S]*ENV YAWP_ENVIRONMENT/)` was the only such guard, and it is replaced).

**Still enforced (unchanged):**

- Demo workflow passes `YAWP_ENVIRONMENT=demo` as a **build-arg** on the web image.
- `render-compose.mjs` does **not** pass `YAWP_ENVIRONMENT` as a Docker **build** arg; it sets runtime `YAWP_ENVIRONMENT: "preview"` in compose environment (overrides image env at container start).
- Vite config still keys dev-panel stripping on `YAWP_ENVIRONMENT === 'production'`.

Contract test intent matches the new runtime-bake design.

---

## Demo / preview correctness

| Deployment | How `YAWP_ENVIRONMENT` is set | Effect after PR |
| --- | --- | --- |
| **Production (App Runner)** | Dockerfile production-stage default + `ENV` | Runtime `production` → `/api/version` reports `production` |
| **Demo (ECR workflow)** | Build-arg `YAWP_ENVIRONMENT=demo` | Baked `demo` in image; unchanged from prior build-stage-only demo builds for Vite; runtime now consistent for version metadata |
| **PR preview (compose)** | Runtime env `YAWP_ENVIRONMENT: "preview"` | Overrides any image default; preview policy and sign-on gates unchanged |

No demo/prod conflation: production default is explicit; demo and preview continue to use their existing override paths.

---

## Kevin / #608

PR [#608](https://github.com/The-Connell-School/yawp/pull/608) (“Platform enhancements behind platform-enhancements flag”) is **untouched**. This diff is two files only (`services/web-app/Dockerfile`, `scripts/deployment-contract.test.ts`); no feature-flag, platform-enhancements, or Kevin-owned application code.

---

## Scope and safety

| Check | Result |
| --- | --- |
| Files changed vs `main` | 2 files, +6 / −3 lines |
| Terraform / secrets | None |
| Healthcheck / `api.healthcheck` | Unchanged |
| Application runtime logic | Unchanged (env visibility only) |

**Behavioral note (non-blocking):** `dev-panel-api-production.test.ts` still documents “Real production: … no `YAWP_ENVIRONMENT` at runtime” for one test vector. Explicit `YAWP_ENVIRONMENT=production` is already handled elsewhere (e.g. LTI `isYawpProductionEnvironment`, dev-panel runtime). Production guard behavior remains correct; comment may be stale after ship.

---

## CI (PR #802 @ reviewed head)

At review time:

| Check | Status |
| --- | --- |
| **Changed paths** (includes `deployment-contract.test.ts`, `render-compose.test.js`, demo deploy tests) | **pass** |
| Preview tooling | **pass** |
| migration-integration | **pass** |
| preview-policy | **pass** |
| preview-deploy | **pass** |
| TypeScript / E2E shards | in progress (not required to invalidate a Dockerfile-only contract fix already covered by Changed paths) |

No CI failure attributable to this change was observed.

---

## Findings summary

1. **Correct root cause** — runtime production stage lacked `YAWP_ENVIRONMENT`; version API correctly fell back to `unknown`.
2. **Minimal fix** — production-stage `ARG`/`ENV` only; defaults preserve production builds.
3. **Contract updated coherently** — no orphaned “must not ENV in production stage” assertions elsewhere.
4. **Preview/demo paths preserved** — compose runtime `preview`; demo build-arg `demo`.
5. **Scope clean** — no infra, healthcheck, or #608 scope creep.

---

## Decision

**SHIP** — merge #802 when normal release process allows (this review does not merge it).
