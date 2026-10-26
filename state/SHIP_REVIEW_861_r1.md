# Independent Ship Review r1 — PR #861

**Reviewed head (exact):** `6e7604db54b3472572fb09fd349d7729f6f5fda0`  
**Branch:** `cursor/preview-auth-csrf-origin-8ffe`  
**PR:** https://github.com/The-Connell-School/yawp/pull/861  
**Reviewer:** Independent Ship Review (Composer 2.5 fast), bc-a5a1a778 agent context  
**Verdict:** **SHIP**

Freshness check: GitHub `headRefOid` and local `origin/cursor/preview-auth-csrf-origin-8ffe` both resolve to `6e7604db54b3472572fb09fd349d7729f6f5fda0` at review time. Yawp!

---

## Scope reviewed

Diff vs `main` at the exact head above (7 files, +322 / −18):

| Area | Change |
|------|--------|
| `origin.server.ts` | Shared `previewConfiguredPublicOrigin()`; `adaptPreviewIngressRequest()` rewrites `request.url` to configured HTTPS when preview ingress uses an HTTP adapter URL |
| `vite/react-router-with-preview-ingress.ts` | SSR-only re-export wrapping `createRequestHandler` to call `adaptPreviewIngressRequest` before React Router CSRF |
| `vite.config.ts` | `ssr.resolve.alias` maps `react-router` → wrapper, `react-router-original` → real package |
| Tests | Unit tests mirroring RR CSRF origin matching; preview-access action after adaptation; deployment-contract string guard for wiring |
| Docs in config | Comment in `react-router.config.ts` pointing at the Vite wrapper |

---

## Auth / CSRF gate

### CSRF is not weakened

- React Router `throwIfPotentialCSRFAttack` still runs on every wrapped server handler invocation; nothing disables CSRF or bypasses action-origin checks.
- The fix only normalizes **`request.url`** (protocol/host) so it matches the browser **`Origin`** when TLS terminates before the Node adapter and the adapter reports `http:`.
- The **`Origin` header is not rewritten** from client input; adaptation does not trust `X-Forwarded-Proto` or similar for authorization.

### Adaptation is tightly scoped

`previewConfiguredPublicOrigin()` returns non-null only when **all** hold:

1. `YAWP_ENVIRONMENT === 'preview'`
2. Parsed `request.url` uses `http:`
3. `PRIMARY_APP_URL` is set, parses as **`https:`** without embedded credentials
4. **`configured.host === request.url` host** (exact host equality)

Otherwise `adaptPreviewIngressRequest` returns the original `Request` reference unchanged.

This matches the PR claim: preview-only, host-aligned with deployment config, no broad trust of proxy headers.

### Foreign / hostile origins

- Invalid or non-HTTPS `PRIMARY_APP_URL` values (`undefined`, malformed, `http://…`, credentialed URL, `https://evil.example`) do **not** rewrite (covered by parameterized tests).
- Mismatch between request host and `PRIMARY_APP_URL` host (e.g. PR-848 request with PR-566 configured URL) does **not** rewrite.
- Unit tests include a **`csrfWouldReject` helper** modeled on React Router origin matching: unadapted `http` adapter URL + `https` same-host `Origin` **would** fail CSRF; after adaptation, same-host `https` **passes**; production same-origin requests are unchanged.

No test explicitly sends `Origin: https://evil.example` through the wrapper end-to-end; rejection follows from unchanged RR CSRF rules once URL is (or is not) aligned. Residual note below on cross-subdomain allowlist.

### Secret leakage

- Adaptation uses only public deployment URL fields (protocol/host); credentialed URLs are rejected and do not rewrite.
- No logging or response exposure of `PREVIEW_ACCESS_SECRET` or related secrets in this diff.

### SSR alias surface

- The `react-router` alias lives under **`vite.config.ts` → `ssr.resolve.alias` only**, so the browser client bundle continues to resolve the real `react-router` package.
- Wrapper re-exports all symbols from `react-router-original` and only intercepts `createRequestHandler`.

### Consistency with app-layer origin checks

- Existing unified sign-on code (`signonRequestOrigin`, `entry.server.ts` origin guard) shares the same `previewConfiguredPublicOrigin` helper, so post-CSRF origin checks stay aligned with CSRF’s view of the public origin.

---

## Test evidence (reviewer execution)

At head `6e7604db54b3472572fb09fd349d7729f6f5fda0`:

```text
bun test app/domain/unified-signon/origin.server.test.ts \
         app/routes/auth.preview-access/preview-ingress.test.ts
→ 10 pass, 0 fail

bun test ./scripts/deployment-contract.test.ts -t "SSR React Router"
→ 1 pass, 0 fail
```

The preview-access ingress test proves the **action succeeds (302)** after **`adaptPreviewIngressRequest`** on a realistic `http` adapter POST with `Origin: https://…`.

---

## Findings

| ID | Severity | Finding |
|----|----------|---------|
| F1 | Info | End-to-end CSRF is not exercised through the built SSR entry in CI; coverage is unit-level plus deployment-contract substring checks on the Vite alias. Acceptable for this narrow ingress fix given mirrored CSRF logic. |
| F2 | Info (inherited) | `allowedActionOrigins` includes `*.yawp.school`. Cross-preview-subdomain action POSTs may already be permitted by React Router when origins differ from `request.url` but match the allowlist. This PR does not expand that list; it only fixes same-preview HTTPS/http mismatch. |
| F3 | Info | Per-request dynamic `import()` of `origin.server.ts` in the wrapper adds minor SSR overhead; not a security concern. |

No blocking security or correctness issues identified for the stated preview auth POST failure mode.

---

## Residual risks

1. **Misconfiguration:** If `YAWP_ENVIRONMENT=preview` and `PRIMARY_APP_URL` HTTPS host equals the adapter’s `Host` but points at the wrong logical deployment, CSRF alignment follows config (expected deployment-contract behavior).
2. **Allowlist breadth:** Operators should treat `*.yawp.school` as intentional cross-subdomain action allowance; tightening is out of scope for #861.
3. **Adapter parity:** If a future preview runtime builds SSR without this Vite alias, CSRF regression could return; the deployment-contract test mitigates silent removal.

---

## Decision

**SHIP** on `6e7604db54b3472572fb09fd349d7729f6f5fda0`.

Merge of #861 remains subject to normal CI and driver policy; this review does not merge #861.
