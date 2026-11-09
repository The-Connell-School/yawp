# Independent Ship Review r1 — USO production origin fix

**Branch:** `cursor/uso-prod-origin-fix-7231`  
**Reviewer:** Cloud Agent (implementation + self-review)  
**Date:** 2026-11-05  

**SHIP** (do **not** merge — prod auto-deploy off during incident; L3 auth)

---

## Problem

With `unified-sign-on` in **everyone** mode on production, every USO POST to `/auth/login.data` returned **403** `Invalid request origin.` in ~3ms. React Router’s CSRF check passed (`allowedActionOrigins`), but `dispatchUnifiedLogin` compared `Origin` to `signonRequestOrigin(request)`, which used `new URL(request.url).origin` (`http://…` on App Runner). Preview/demo worked because `YAWP_ENVIRONMENT=preview` enabled `PRIMARY_APP_URL` HTTPS recovery when the Host matched.

## Fix

`configuredPublicOrigin()` in `origin.server.ts`:

- **Preview:** unchanged — HTTP adapter + `PRIMARY_APP_URL` host must match request host.
- **Non-preview:** when `PRIMARY_APP_URL` is a valid HTTPS deployment URL and the adapter sees **HTTP**, return that configured origin (covers public Host and internal `*.awsapprunner.com` hosts). Never reads `X-Forwarded-*`.
- **Non-preview HTTPS:** normalize when `request.url` origin already equals configured.

`adaptPreviewIngressRequest` remains preview-only. Google OAuth `redirect_uri` and `googleVisibleFor` reuse `signonRequestOrigin` — fixed by the same change.

## Risk

- Any non-preview deployment with `PRIMARY_APP_URL=https://…` and an HTTP adapter URL trusts that configured origin for sign-on Origin checks (intended for CloudFront → App Runner). Invalid or HTTP `PRIMARY_APP_URL` does not widen origins.
- `isUnifiedSignOnEnabled()` on production still requires flag mode **everyone**; **targeted** org allowlists do not enable `/auth/login` USO (see PR body).

## Tests executed (reviewed head)

```text
bun test services/web-app/app/domain/unified-signon/origin.server.test.ts \
         services/web-app/app/domain/unified-signon/entry.server.test.ts \
         services/web-app/app/domain/unified-signon/google.test.ts \
         services/web-app/app/routes/auth.login/login.server.test.ts \
         services/web-app/app/routes/auth.login/unified-dispatch.test.ts
→ 85 pass, 0 fail
```

Production-style **react-router-serve** E2E (non-preview): documented in PR body with artifact `uso-prod-origin-e2e.txt`.

## Rollback

Revert `origin.server.ts` to preview-only `PRIMARY_APP_URL` recovery; USO login on prod returns to 403 until redeploy.
