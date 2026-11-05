# Independent Ship Review — PR #866 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/866  
**Title:** fix(preview): gate SSR react-router ingress alias to preview builds  
**Base:** `main` @ `cb6236f5de18d39ede408947495b138d56b293b8` (post-#865 revert; prod login healthy)  
**Reviewed head SHA:** `f8837b8231b8de56b8dcb6654291f10d1089f5b7`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-26  

SHIP

## Context

- #861 introduced an unconditional SSR Vite alias from `react-router` → `vite/react-router-with-preview-ingress.ts`, which pulled in `react-router-original` and duplicated the react-router bundle in production SSR builds, breaking `/auth/login` loaders.
- #865 reverted #861; production tip `cb6236f5` restored healthy login.
- This PR re-lands preview ingress CSRF URL adaptation (#861 behavior) with the SSR alias gated to `YAWP_ENVIRONMENT=preview` only.

## Scope (10 files, single commit)

| Area | Files |
|------|--------|
| Preview-only SSR alias | `services/web-app/vite/preview-ingress-ssr-alias.ts`, `vite.config.ts`, wrapper + `react-router-original.d.ts` |
| Ingress request rewrite | `app/domain/unified-signon/origin.server.ts` (+ tests) |
| Route integration | `app/routes/auth.preview-access/preview-ingress.test.ts` |
| RR config comment | `react-router.config.ts` |
| Contract | `scripts/deployment-contract.test.ts` |

No unrelated product, CI, or deploy workflow changes in this diff.

## Confirmations

### (1) Alias is preview-gated

- `shouldApplyPreviewIngressReactRouterSsrAlias` returns true only when `YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview'`.
- `createPreviewIngressReactRouterSsrAliasPlugin` evaluates that flag at plugin construction time; `resolveId` returns `null` immediately when not a preview build, so no `react-router` / `react-router-original` remapping runs.
- Runtime adaptation in `adaptPreviewIngressRequest` is additionally gated on `process.env.YAWP_ENVIRONMENT === 'preview'` (and HTTP adapter + `PRIMARY_APP_URL` alignment).

### (2) No prod/demo SSR alias path

- **Production:** `services/web-app/Dockerfile` defaults `ARG YAWP_ENVIRONMENT=production` for build and runtime; alias gate is false → standard `react-router` SSR resolution, single bundle (same as post-#865 main).
- **Demo:** CI and demo deploy set `YAWP_ENVIRONMENT=demo`; gate is false → no SSR alias.
- **Development / unset:** Gate is false unless explicitly `preview`; local and App Runner–style builds without `preview` do not alias.
- Alias applies only when both preview env **and** `resolveOptions.ssr` are true; client builds never hit the wrapper via this plugin.

### (3) No drive-bys

- Diff is a focused re-application of #861 preview CSRF helpers plus the preview-only gate and tests.
- No changes to deploy pipelines, feature flags, unrelated routes, or prod auth paths beyond restoring the pre-#861 prod SSR graph.

### (4) Tests cover the gate

| Test | What it proves |
|------|----------------|
| `vite/preview-ingress-ssr-alias.test.ts` | Gate true/false for `preview` / `production` / `demo`; production SSR `resolveId` null; preview SSR aliases to wrapper |
| `scripts/deployment-contract.test.ts` | Vite wires alias module; alias source contains `=== 'preview'`; wrapper calls `adaptPreviewIngressRequest` |
| `origin.server.test.ts` | Adaptation only under preview + valid `PRIMARY_APP_URL`; production leaves requests unchanged |
| `preview-ingress.test.ts` | End-to-end preview-access path after adaptation |

**Executed locally (reviewed head):**

```text
bun test ./vite/preview-ingress-ssr-alias.test.ts          → 3 pass
bun test ./scripts/deployment-contract.test.ts -t "SSR React Router" → 1 pass
bun test ./app/domain/unified-signon/origin.server.test.ts
     ./app/routes/auth.preview-access/preview-ingress.test.ts → 10 pass
```

## Residual risk (non-blocking)

- Preview PR builds must continue to set `YAWP_ENVIRONMENT=preview` at **build** time (already true in `scripts/preview/render-compose.mjs` and preview CI). A preview runtime with a mismatched build-time env would skip the wrapper and could regress preview CSRF behavior without affecting prod.
- Full `./bin/project test --profile changed` was not used as the ship gate; targeted tests above cover this change. CI on the PR remains the authoritative broad check.

## Verdict

**SHIP** — Preview-only SSR alias correctly addresses the #861 production dual-bundle regression while preserving preview ingress CSRF alignment. Safe to merge from a code-review perspective; do not merge as part of this review task.
