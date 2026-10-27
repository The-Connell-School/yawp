# Independent Ship Review — PR #868 (r2)

**PR:** https://github.com/The-Connell-School/yawp/pull/868  
**Title:** fix(preview): allow HTTPS CSRF action Origins on *.preview.yawp.school  
**Base:** `main` @ `a97423e5e` (fetched at review time)  
**Reviewed head SHA:** `b7e89c957978cbb8782a1b0610c8843c95112d8f`  
**Prior review:** r1 @ `412ed00a7` (code SHIP; CI TypeScript failed on default `process.env` parameter typing)  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## Delta since r1

Single commit on reviewed head:

- `b7e89c957` — `fix(types): allow process.env default for yawpBrowserActionOrigins`

Introduces `YawpBrowserActionOriginsEnv` as `{ YAWP_ENVIRONMENT?: string }` and uses `process.env as YawpBrowserActionOriginsEnv` only for the default parameter. Gate string unchanged: `env.YAWP_ENVIRONMENT?.trim().toLowerCase() === "preview"`. No runtime behavior change.

## Scope (3 files vs `main`)

| Area | Files |
|------|--------|
| RR `allowedActionOrigins` | `services/web-app/react-router.config.ts` |
| Unit + CSRF mirror tests | `services/web-app/react-router.config.test.ts` (new) |
| Deployment contract | `scripts/deployment-contract.test.ts` |

No UI, deploy pipeline, auth routes, secrets, or unrelated drive-bys.

## Confirmations

### (1) Production / demo omit preview wildcard; preview includes it

- Base allowlist unchanged: `yawp.school`, `demo.yawp.school`, `ua.yawp.school`, `*.yawp.school`.
- `*.preview.yawp.school` appended only when `YAWP_ENVIRONMENT` normalizes to `preview`.
- Tests assert production omits `*.preview.yawp.school`.
- Manual check on reviewed head: `demo` and unset env also omit the preview wildcard (`false`).

### (2) CSRF behavior matches intent

- New tests mirror React Router `throwIfPotentialCSRFAttack` host / wildcard matching.
- Preview env accepts HTTPS `Origin` on `pr-*` and `ua-pr-*` preview hosts when adapter URL stays `http://`.
- Unrelated origins rejected; production allowlist does not cover nested `*.preview.yawp.school` via `*.yawp.school` alone.

### (3) TypeScript fix is sound

- Same narrow-env + cast pattern as `vite/preview-ingress-ssr-alias.ts` (`PreviewIngressEnv`).
- Tests pass explicit `env` objects without casts; cast applies only to live `process.env` default.
- Resolves r1 CI failure mode without broadening the gate.

### (4) Security

- Preview wildcard is build/runtime-gated to `YAWP_ENVIRONMENT=preview` only; production and demo images do not gain the entry from this config path.
- Allowlist remains host-pattern scoped (no `*` at TLD); no credentials or logging of secrets.
- Complements (does not replace) optional preview ingress URL rewrite in `vite/react-router-with-preview-ingress.ts`.

## Tests executed (reviewed head `b7e89c957`)

```text
bun test services/web-app/react-router.config.test.ts                          → 4 pass
bun test ./scripts/deployment-contract.test.ts -t "SSR React Router"           → 1 pass
NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck (services/web-app)    → pass
```

**CI (GitHub, head `b7e89c957`):** `ʦ TypeScript` **pass** (3m32s). Other CI jobs were still running at review time; r2 delta is typing-only and directly addresses the known r1 TS failure.

## Residual risk (non-blocking)

- Preview deploys must set `YAWP_ENVIRONMENT=preview` when the React Router config is evaluated (same assumption as other preview-only CSRF tooling). Mismatch would omit the wildcard and could regress preview POST/actions only.
- Demo is not named in unit tests but uses the same non-`preview` gate as production (verified locally).

## Verdict

**SHIP** — Scope is config + tests + type-only fix; production/demo allowlists unchanged; preview gains a correctly gated `*.preview.yawp.school` entry; TypeScript concern from r1 is resolved locally and on CI. Safe to merge from an independent code-review perspective. Do not merge as part of this review task.
