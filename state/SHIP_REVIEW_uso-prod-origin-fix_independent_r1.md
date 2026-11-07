# Independent Ship Review r1 — PR #917 (USO production origin fix)

**PR:** https://github.com/The-Connell-School/yawp/pull/917  
**Title:** fix(unified-signon): accept public HTTPS Origin behind prod HTTP ingress  
**Branch:** `cursor/uso-prod-origin-fix-7231`  
**Base:** `main`  
**Reviewed product/code SHA:** `4f03543ff7b5008b33ba5b7ff3811802a1475c9a` (`4f03543`)  
**Merge-base with `main` at review time:** `309f32fc` (`309f32fc fix(web): improve Grading Assistant rubric and grade text contrast (#924)`)

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-07  
**Product gate:** Bryant approved re-releasing unified sign-on to production (this review gates merge).

**SHIP**

---

## 1. Fix correctness and safety

| Check | Finding |
| --- | --- |
| Root cause | On production App Runner, `request.url` is `http://…` while browsers send `Origin: https://yawp.school`. `dispatchUnifiedLogin` compared `Origin` to `signonRequestOrigin()` (adapter origin), yielding **403** `Invalid request origin.` when USO flag was **everyone**. |
| Mechanism | PR renames/recasts `previewConfiguredPublicOrigin` → `configuredPublicOrigin`: **preview** still requires HTTP adapter + `PRIMARY_APP_URL` host match; **non-preview** returns configured HTTPS when adapter URL is **HTTP** or when HTTPS adapter origin already equals `PRIMARY_APP_URL`. |
| `X-Forwarded-*` | **Not read** anywhere in `origin.server.ts`. Tests assert forwarded headers do not change `signonRequestOrigin` (`origin.server.test.ts`) and do not bypass origin guard in `unified-dispatch.test.ts` / `google.test.ts`. |
| Foreign Origin | Production HTTP + `PRIMARY_APP_URL=https://yawp.school`: `https://yawp.school` accepted; `https://evil.example` → **403** (`unified-dispatch.test.ts`, `entry.server.test.ts`). Preview host mismatch and invalid `PRIMARY_APP_URL` values do not widen origins. |
| Preview envs | `adaptPreviewIngressRequest` still gated on `YAWP_ENVIRONMENT=preview` only; preview host-alignment rules unchanged. Non-preview environments do **not** get request URL rewrite for CSRF. |
| Google OAuth | `beginGoogle` / callback base URL use existing `signonRequestOrigin()` — prod `redirect_uri` becomes `https://yawp.school/...` over internal HTTP host (`google.test.ts` new case). |
| Multi-host edge | If adapter URL is already HTTPS on a **different** public host (e.g. `https://demo.yawp.school`), configured origin is **not** substituted (`origin.server.test.ts`) — demo remains independent of prod `PRIMARY_APP_URL`. |

**Assessment:** Fix is minimal, configuration-bound (trusted deploy env `PRIMARY_APP_URL`), and does not introduce header-spoofing trust. Appropriate for CloudFront/App Runner TLS termination pattern.

---

## 2. Backward compatibility

| Area | PR touches? | Evidence |
| --- | --- | --- |
| Session cookie name / domain / storage | **No** | Diff limited to `origin.server.ts` + tests + author ship doc. `authSessionStorage` / `sessionKey` unchanged (`auth.server.ts`). |
| Already signed-in users | **No session churn** | No cookie or storage changes; existing sessions remain valid across deploy. |
| Legacy `/auth/login` (USO off) | **Unchanged path** | `dispatchUnifiedLogin` still delegates to `loginAction` when flag off (`unified-dispatch.test.ts`: off/targeted/garbage flags → legacy). |
| Class-code student login | **Unchanged + covered** | Unified dispatch tests still reach backend for `DEV-CLASS-101`; origin fix only affects Origin equality when USO on. |
| `redirectTo` / return-after-login | **Unchanged logic** | `entry.server.ts` / flow still use `safeRedirect`; evil `//evil.test` rejection covered in existing `backend.real-db.integration.test.ts` (not modified by PR). |
| LTI launch | **Not intercepted** | No route or gate changes; USO only affects unified login dispatch when flag enabled. |
| `adaptPreviewIngressRequest` / preview CSRF | **Unchanged behavior** | Still preview-only; prod CSRF continues to rely on React Router `allowedActionOrigins` (incident: CSRF already passed; USO guard was the failure). |

**Assessment:** No breaking changes identified in scope. USO-on prod behavior moves from broken (403) to intended.

---

## 3. Tests (merge `main` + PR #917)

`git merge-tree` on `309f32fc` × `4f03543`: **clean merge** (no conflicts).

```bash
cd services/web-app
bun test app/domain/unified-signon/origin.server.test.ts \
         app/domain/unified-signon/entry.server.test.ts \
         app/domain/unified-signon/google.test.ts \
         app/routes/auth.login/login.server.test.ts \
         app/routes/auth.login/unified-dispatch.test.ts
```

**Result (2026-11-07, local merge tree):** **85 pass, 0 fail.**

---

## 4. CI on PR head (`4f03543`)

Recorded via `gh pr checks 917` at review time:

| Check | Result |
| --- | --- |
| Changed paths | pass |
| ʦ TypeScript | pass |
| Prisma migrations | pass |
| migration-integration | pass |
| 🔐 Sign-on browser flows | pass |
| 🧪 E2E smoke (shards 1–6) | pass |
| 🧪 E2E Tests (Playwright) | pass |
| Preview deploy / policy / tooling | pass |

**Note:** CI last ran on **2026-11-05** against PR head before `main` advanced with #924. Merge-tree is conflict-free; focused auth/USO suite re-run locally on merged tree is green. No re-run of full CI on `main..917` merge commit was triggered in this review.

---

## 5. Scope

**6 files** — `origin.server.ts` (+tests), `entry.server.test.ts`, `google.test.ts`, `unified-dispatch.test.ts`, author `SHIP_REVIEW_uso-prod-origin-fix_r1.md`. No migrations, flags, or session/auth storage edits.

---

## 6. Risk notes (non-blocking)

- **Intended widening:** Any non-preview deploy with valid HTTPS `PRIMARY_APP_URL` and HTTP adapter URL treats configured public origin as sign-on authority (required for prod). Mis-set `PRIMARY_APP_URL` could mis-align Origin checks — operational/config risk, not new code path for arbitrary attacker-chosen origins.
- **CSRF vs USO:** Production does not adopt preview’s `adaptPreviewIngressRequest` rewrite; if `allowedActionOrigins` and USO origin ever diverge again, symptoms would differ by layer (400 CSRF vs 403 USO). Current prod incident was USO-only after CSRF passed.
- **Rollout:** Re-enabling USO **everyone** on prod still a product/ops action; this PR only fixes the origin mismatch after flag is on.

---

## 7. Merge recommendation

**SHIP — approve merge of #917 to `main`.** Merge when ready for production deploy; Bryant has approved USO re-release. This independent review does **not** perform merge (per instructions).

---

## Rollback

Revert `origin.server.ts` to preview-only `PRIMARY_APP_URL` recovery; USO POSTs on prod HTTP ingress return to **403** until redeploy.
