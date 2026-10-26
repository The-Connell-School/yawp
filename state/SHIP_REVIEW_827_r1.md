# Ship Review r1 — PR #827

**Reviewed PR:** https://github.com/The-Connell-School/yawp/pull/827  
**Branch:** `cursor/fix-org-switch-oops-b2e8`  
**Head SHA (exact):** `7229383c494fa9b0e82efb2d67b6cb99a95dc1dc`  
**Base:** `origin/main` @ review time (`a89fcd2b1`)  
**Reviewer:** Independent r1 (Cloud Agent)  
**Date:** 2026-10-26

## Verdict

**SHIP**

## Summary

Production `Bad Request` on logout / org-switch came from React Router 7.18+ `throwIfPotentialCSRFAttack`: browser `Origin` (public CloudFront host) did not match `request.url` (App Runner internal host) before route actions ran. The PR whitelists Yawp browser hosts via `allowedActionOrigins` and tightens membership switching / logout scope cookies so users are not left on stale org context.

## CSRF / `allowedActionOrigins`

| Check | Result |
|-------|--------|
| `yawp.school` listed | Pass |
| `demo.yawp.school` listed | Pass |
| `ua.yawp.school` listed | Pass |
| Config wired into server build (`react-router.config.ts`, `satisfies Config`) | Pass |
| Matches RR wildcard semantics (`*` = one label, `**` = multiple) | Pass (see risk) |

Implementation aligns with React Router’s documented `allowedActionOrigins` field and the runtime check in `throwIfPotentialCSRFAttack` (compare `origin` host to `request.url` host; allow listed patterns when they differ).

## Membership / logout hygiene

| Area | Assessment |
|------|------------|
| `api.membership-id` redirect | Always `302` → `/app` (no `Referer`); avoids landing on prior-org deep links after switch |
| Inactive membership on switch | `isActive: true` on lookup; no cookie set when rejected |
| `no-membership` loader | Auto-pick first membership requires `isActive: true` |
| Root membership list (prod) | `getRootMembershipWhere` adds `isActive: true` for App Runner prod (`isYawpProductionEnvironment`) and for isolated preview seat restriction |
| Logout | Clears auth session, `membership-id`, and `school-year` scope via `combineHeaders` (multiple `Set-Cookie`) |

**Preview / isolated seat / free-tier regressions (code review):**

- Isolated seat mode for **allowed** preview users still returns `undefined` filter (unchanged).
- Isolated seat mode for **restricted** users still scopes to seat org, now also `isActive: true`.
- Demo/preview containers (`YAWP_ENVIRONMENT=preview|demo`) do **not** get the new prod-only `{ isActive: true }` fallback filter — intentional per `isYawpProductionEnvironment`.
- Free-tier / `requireMembership` paths already enforced `isActive: true`; logout cookie clearing closes stale scope after sign-out.

## Tests

| Path | Coverage |
|------|----------|
| `app/routes/api.membership-id/route.test.ts` | Redirect to `/app`, inactive rejection, `isActive` query |
| `app/utils/auth.server.test.ts` | Logout clears membership + school-year cookies |
| `app/utils/root-membership-filter.server.test.ts` | Prod inactive filter + seat filter `isActive` |

**Local verification (review head):** 29/29 passing in the three files above (`bun test`).

**Gap:** No automated assertion on `allowedActionOrigins` contents (static build config). Acceptable for this hotfix; consider a small deployment-contract test in a follow-up.

## Risks / follow-ups

1. **`*.yawp.school` vs multi-level hosts:** Per RR `matchWildcardDomain`, `*.yawp.school` matches one subdomain label only (e.g. `demo.yawp.school`), not `pr-123.preview.yawp.school`. Prod hosts named in the incident are explicitly listed; PR preview hosts behind the same origin/request.host skew may still need `**.yawp.school` if actions fail there (out of stated prod scope but worth monitoring on #827 preview).
2. **Rejected org switch:** Failed/inactive switch redirects to `/app` without clearing an existing membership cookie; `requireMembership` still clears invalid cookies on protected routes — pre-existing pattern, not introduced by this PR.
3. **CI at review time:** GitHub Actions reported `ʦ TypeScript` failing on the PR run while other checks were still pending; targeted unit tests for this diff pass locally. Confirm green TypeScript + smoke before merge (standard gate, not a code defect found in r1 diff).

## Checklist

- [x] Head SHA matches requested commit (`7229383c494fa9b0e82efb2d67b6cb99a95dc1dc`)
- [x] CSRF allowlist includes `yawp.school`, `demo.yawp.school`, `ua.yawp.school`
- [x] Org-switch action no longer trusts `Referer`
- [x] Active membership enforced on switch and no-membership recovery
- [x] Logout clears membership + school-year scope cookies
- [x] Unit tests cover switch, logout, and root membership filter
- [ ] Full PR CI green (pending at r1 write time)

## Files touched (PR diff vs main)

- `services/web-app/react-router.config.ts`
- `services/web-app/app/routes/api.membership-id/route.ts` (+ new test)
- `services/web-app/app/routes/no-membership/route.tsx`
- `services/web-app/app/utils/auth.server.ts` (+ test)
- `services/web-app/app/utils/root-membership-filter.server.ts` (+ test)
