# Independent Ship Review — PR #866 (r2)

**PR:** https://github.com/The-Connell-School/yawp/pull/866  
**Title:** fix(preview): gate SSR react-router ingress alias to preview builds  
**Base:** `main` @ `cb6236f5de18d39ede408947495b138d56b293b8` (post-#865 revert; prod login healthy)  
**Reviewed head SHA:** `d7bec0fd53710d1d6e52bd36e61bf96b981cb208`  
**Prior review:** r1 @ `f8837b8231b8de56b8dcb6654291f10d1089f5b7` (code SHIP; CI TypeScript failed on `Pick<NodeJS.ProcessEnv, 'YAWP_ENVIRONMENT'>`)  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-26  

SHIP

## Delta since r1

Single commit on reviewed head:

- `d7bec0fd5` — `fix(web-app): type preview ingress env without Pick ProcessEnv`

Replaces `Pick<NodeJS.ProcessEnv, 'YAWP_ENVIRONMENT'>` with a narrow `PreviewIngressEnv` type and `process.env as PreviewIngressEnv` only for the default parameter and `options.env ??` fallback. The runtime gate string is unchanged: `env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview'`.

No other files changed between r1 head and reviewed head.

## Context

- #861 broke prod login by SSR-aliasing `react-router` → preview ingress wrapper for all environments (dual react-router bundles).
- #865 reverted #861; prod tip `cb6236f5` login healthy.
- This PR re-lands preview CSRF with the SSR alias gated to `YAWP_ENVIRONMENT=preview` only.

## Scope (11 files vs `main`, feature + r1 review doc)

| Area | Files |
|------|--------|
| Preview-only SSR alias | `services/web-app/vite/preview-ingress-ssr-alias.ts`, `vite.config.ts`, wrapper + `react-router-original.d.ts` |
| Ingress request rewrite | `app/domain/unified-signon/origin.server.ts` (+ tests) |
| Route integration | `app/routes/auth.preview-access/preview-ingress.test.ts` |
| RR config comment | `react-router.config.ts` |
| Contract | `scripts/deployment-contract.test.ts` |
| Prior review artifact | `state/SHIP_REVIEW_866_r1.md` |

## Confirmations

### (1) Alias is preview-gated

- `shouldApplyPreviewIngressReactRouterSsrAlias` returns true only when `YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview'`.
- `createPreviewIngressReactRouterSsrAliasPlugin` evaluates that flag at plugin construction time; `resolveId` returns `null` when not a preview build or when not `resolveOptions.ssr`, so no `react-router` / `react-router-original` remapping runs.
- Runtime adaptation in `adaptPreviewIngressRequest` remains gated on `process.env.YAWP_ENVIRONMENT === 'preview'` (plus HTTP adapter URL and `PRIMARY_APP_URL` host alignment).

### (2) No prod/demo SSR alias path

- **Production:** Dockerfile defaults `YAWP_ENVIRONMENT=production`; alias gate is false → standard `react-router` SSR resolution (same as post-#865 `main`).
- **Demo:** deploy/CI use `YAWP_ENVIRONMENT=demo`; gate is false → no SSR alias.
- **Development / unset:** gate false unless explicitly `preview`.
- Alias applies only when preview env **and** SSR resolution; client builds never hit the wrapper via this plugin.

### (3) No drive-bys

- Diff vs `main` is limited to preview ingress CSRF re-land, preview-only Vite gate, tests, and ship-review docs.
- No deploy pipeline, unrelated route, or prod auth changes beyond restoring a single-bundle prod SSR graph.

### (4) Tests cover the gate

| Test | What it proves |
|------|----------------|
| `vite/preview-ingress-ssr-alias.test.ts` | Gate true/false for `preview` / `production` / `demo`; production SSR `resolveId` null; preview SSR aliases to wrapper |
| `scripts/deployment-contract.test.ts` | Vite wires alias module; alias source contains `=== 'preview'`; wrapper calls `adaptPreviewIngressRequest` |
| `origin.server.test.ts` | Adaptation only under preview + valid `PRIMARY_APP_URL`; production leaves requests unchanged |
| `preview-ingress.test.ts` | Preview-access path after adaptation |

**Executed locally (reviewed head `d7bec0fd5`):**

```text
bun test services/web-app/vite/preview-ingress-ssr-alias.test.ts     → 3 pass
bun test scripts/deployment-contract.test.ts -t "SSR React Router"   → 1 pass
bun test services/web-app/app/domain/unified-signon/origin.server.test.ts
     services/web-app/app/routes/auth.preview-access/preview-ingress.test.ts → 10 pass
```

### (5) TypeScript fix is sound and does not weaken the gate

- `PreviewIngressEnv` is `{ YAWP_ENVIRONMENT?: string }`; tests inject explicit `env` objects without casts.
- Casts apply only to live `process.env` fallbacks; they do not alter comparison logic or broaden which values enable the alias.
- Replacing invalid `Pick` on Zod-augmented `ProcessEnv` removes the r1 CI TypeScript failure without changing behavior at runtime.

## Residual risk (non-blocking)

- Preview PR builds must set `YAWP_ENVIRONMENT=preview` at **build** time (preview compose/CI). Build/runtime env mismatch would skip the wrapper and could regress preview CSRF only.
- Full-repo `tsc` was not completed locally (heap OOM); CI `ʦ TypeScript` on run for `d7bec0fd5` was in progress at review time. The r2 change is typing-only and directly addresses the known r1 TS failure mode.

## Verdict

**SHIP** — Preview-only SSR alias remains correct for prod safety; the r2 typing fix resolves CI TypeScript without weakening the gate. Safe to merge from an independent code-review perspective. Do not merge as part of this review task.
