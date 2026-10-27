# Independent Ship Review — PR #868 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/868  
**Title:** preview HTTPS CSRF allowlist (`*.preview.yawp.school`)  
**Base:** `main` @ `045ba64bba26d1936da833ed4c595973b6471e30`  
**Reviewed head SHA:** `412ed00a7bb6f9c9bc8c1b0a3c20e63de9e6a670`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## Context

- React Router 7.18+ single-fetch actions reject cross-origin POSTs via `throwIfPotentialCSRFAttack` when the browser `Origin` (HTTPS on preview ingress) does not match `request.url` (often `http://` on the preview dev adapter).
- #866 gates the Vite SSR wrapper that rewrites `request.url` to preview-only builds; preview **fast dev** paths may never load that wrapper, so allowlist coverage is still required.
- This PR adds `*.preview.yawp.school` to `allowedActionOrigins` only when `YAWP_ENVIRONMENT=preview` at config load (build time).

## Scope (3 files, +124 / −4 vs `main`)

| Area | Files |
|------|--------|
| Preview-gated allowlist | `services/web-app/react-router.config.ts` |
| Unit tests + CSRF matcher mirror | `services/web-app/react-router.config.test.ts` (new) |
| Deployment contract assertion | `scripts/deployment-contract.test.ts` |

No UI, secrets, deploy workflow, or unrelated product changes.

## Confirmations

### (1) Production and demo do not gain the preview wildcard

- `yawpBrowserActionOrigins` appends `*.preview.yawp.school` only when `env.YAWP_ENVIRONMENT?.trim().toLowerCase() === "preview"`.
- Default export uses `allowedActionOrigins: yawpBrowserActionOrigins()` at module load, so the list is fixed for the build’s `YAWP_ENVIRONMENT`.
- **Production image:** `services/web-app/Dockerfile` defaults `ARG YAWP_ENVIRONMENT=production` for build and runtime → four base entries only.
- **Demo:** `YAWP_ENVIRONMENT=demo` (CI/deploy convention) → same four entries; no explicit demo test, but gate is strict equality on `"preview"`.
- **Runtime check (reviewed head):** importing config with `YAWP_ENVIRONMENT=production` or `preview` yields 4 vs 5 entries respectively.

Base allowlist unchanged: `yawp.school`, `demo.yawp.school`, `ua.yawp.school`, `*.yawp.school`.

### (2) Tests prove allow / reject behavior

| Test | What it proves |
|------|----------------|
| `production allowlist omits preview-only wildcard` | Production env omits `*.preview.yawp.school`; retains original four hosts |
| `preview allowlist accepts HTTPS browser Origins on PR preview hosts` | `pr-123` and `ua-pr-456` under `*.preview.yawp.school` with HTTPS `Origin` vs `http://` request URL pass mirrored CSRF matcher |
| `preview allowlist still rejects unrelated Origins` | `https://evil.example` rejected |
| `legacy single-label wildcard does not cover nested preview hostnames` | Production-only list still rejects `pr-867.preview.yawp.school` (motivates dedicated preview pattern) |

CSRF helper duplicates the matcher used in `origin.server.test.ts` (same `matchWildcardDomain` semantics as React Router).

### (3) Security

- Allowlist expansion is limited to `*.preview.yawp.school`, scoped to preview builds only; production/demo graphs unchanged.
- No new secrets, auth bypass, or broad `**` patterns.
- Preview ingress hostnames remain organization-controlled; wildcard does not apply to production apex or arbitrary domains.

### (4) Executed locally (reviewed head)

```text
bun test services/web-app/react-router.config.test.ts     → 4 pass
bun test scripts/deployment-contract.test.ts -t "SSR React Router" → 1 pass
```

Import smoke: `YAWP_ENVIRONMENT=production` → 4 origins; `YAWP_ENVIRONMENT=preview` → includes `*.preview.yawp.school`.

## Residual risk (non-blocking)

- Preview builds must set `YAWP_ENVIRONMENT=preview` at **build** time (`scripts/preview/render-compose.mjs`, preview CI). A mismatched build env would omit the wildcard (preview CSRF regression only, not prod).
- Matcher duplication in tests could drift from React Router internals; low risk given parity with existing `origin.server.test.ts` helper.

## Verdict

**SHIP** — Focused, preview-gated CSRF allowlist fix with tests and contract coverage; production and demo allowlists unchanged. Safe to merge from a code-review perspective; do not merge as part of this review task.

## Blockers

None.
