# Independent Ship Review r2 — PR #861

**Reviewed head (exact):** `3aa59558ef1debb232a4dcfba85fba40c5db81e8`  
**Branch:** `cursor/preview-auth-csrf-origin-8ffe`  
**Base:** `main` @ `9fae7d906a2105d082247aa35440998e8aae5ca1` (verified via GitHub API)  
**PR:** https://github.com/The-Connell-School/yawp/pull/861  
**Prior review:** r1 SHIP @ `6e7604db54b3472572fb09fd349d7729f6f5fda0` (`state/SHIP_REVIEW_861_r1.md`, docs PR #862)  
**Reviewer:** Independent Ship Review (Composer 2.5 fast), cloud agent bc-a5a1a778 context  
**Verdict:** **SHIP**

Freshness check: GitHub `headRefOid` and local `origin/cursor/preview-auth-csrf-origin-8ffe` both resolve to `3aa59558ef1debb232a4dcfba85fba40c5db81e8` at review time. Yawp!

---

## Scope of r2 vs r1

r2 is a **typecheck-only follow-up** on top of r1’s auth/CSRF behavior. Diff `6e7604db..3aa59558` (4 files, +25 / −10):

| File | Change |
|------|--------|
| `services/web-app/vite.config.ts` | Replaced invalid Vite 5.4 `ssr.resolve.alias` with SSR-only `previewIngressReactRouterSsrAlias()` `resolveId` plugin (`if (!options?.ssr) return null`) |
| `services/web-app/vite/react-router-original.d.ts` | Declares `react-router-original` module for TypeScript |
| `services/web-app/vite/react-router-with-preview-ingress.ts` | Types `createRequestHandler` rest args via `Parameters<CreateRequestHandler>` |
| `services/web-app/app/domain/unified-signon/origin.server.ts` | `RequestInit` + conditional `duplex: 'half'` pattern (typed, no behavior change) |

Full PR vs `main` remains the r1 surface (+337 / −18 across 8 files): `origin.server.ts`, SSR wrapper, tests, `react-router.config.ts` comments, deployment-contract guard.

**CSRF / `allowedActionOrigins`:** unchanged in r2. `react-router.config.ts` still sets the same `yawpBrowserActionOrigins` list; nothing disables or bypasses React Router CSRF.

---

## Auth / CSRF gate (re-validated)

### CSRF stays on

- SSR wrapper still only calls `adaptPreviewIngressRequest` before delegating to the real `createRequestHandler`; no CSRF bypass.
- Adaptation still rewrites **`request.url` protocol/host only** (not the `Origin` header from the client).

### Adaptation preconditions (unchanged logic)

`previewConfiguredPublicOrigin()` returns non-null only when **all** hold:

1. `YAWP_ENVIRONMENT === 'preview'`
2. Parsed `request.url` uses `http:`
3. `PRIMARY_APP_URL` parses as `https:` without embedded credentials
4. `configured.host === url.host` (exact host equality)

Otherwise `adaptPreviewIngressRequest` returns the original `Request` reference.

### SSR alias surface (r2 improvement)

r1 used `ssr.resolve.alias`, which **failed CI TypeScript** (invalid Vite 5.4 config shape). r2 maps `react-router` → wrapper and `react-router-original` → real package **only when `resolveId` is invoked with `options.ssr`**, so client/browser bundles continue to resolve stock `react-router`.

---

## Test evidence (reviewer execution)

At head `3aa59558`:

```text
bun test app/domain/unified-signon/origin.server.test.ts \
         app/routes/auth.preview-access/preview-ingress.test.ts
→ 10 pass, 0 fail

bun test app/routes/auth.login/unified-dispatch.test.ts
→ 43 pass, 0 fail

bun test ./scripts/deployment-contract.test.ts -t "SSR React Router"
→ 1 pass, 0 fail
```

**TypeScript**

- Local: `NODE_OPTIONS='--max-old-space-size=8192' bun run typecheck` in `services/web-app` → **pass** (default heap OOM’d in this VM; CI uses adequate memory).
- CI (run `40399351999`, job **ʦ TypeScript** on this branch): **success** at review time.

---

## Findings (r2)

| ID | Severity | Finding |
|----|----------|---------|
| R2-F1 | Info | r2 directly addresses r1 CI failure; no new auth semantics. |
| R2-F2 | Info (inherited) | `allowedActionOrigins` includes `*.yawp.school`; cross-preview-subdomain POSTs may already be permitted by RR when origins differ from `request.url` but match the allowlist — unchanged by this PR (same as r1 F2). |
| R2-F3 | Info (inherited) | Dynamic `import()` of `origin.server.ts` in the SSR wrapper — minor overhead only. |

No new blocking security or correctness issues identified for the stated preview HTTPS Origin / HTTP adapter CSRF alignment.

---

## Residual risks (unchanged from r1)

1. Misconfigured preview (`YAWP_ENVIRONMENT=preview` + wrong `PRIMARY_APP_URL` host) leaves CSRF misaligned — by design (no rewrite).
2. Preview runtime must keep using this Vite SSR `resolveId` wiring; deployment-contract substring test mitigates silent removal.
3. Operators should treat `*.yawp.school` allowlist breadth as intentional cross-subdomain action allowance.

---

## Decision

**SHIP** on `3aa59558ef1debb232a4dcfba85fba40c5db81e8`.

Merge of #861 remains subject to normal CI and driver policy; **this review does not merge #861**.
