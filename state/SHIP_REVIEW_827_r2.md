# Ship Review r2 — PR #827

**Reviewed PR:** https://github.com/The-Connell-School/yawp/pull/827  
**Branch:** `cursor/fix-org-switch-oops-b2e8`  
**Head SHA (exact):** `6a16ee8b539d83a34793aa279fee64a307e16258`  
**Prior r1 head:** `7229383c494fa9b0e82efb2d67b6cb99a95dc1dc` (docs PR #829)  
**Base:** `origin/main` @ review time (`a89fcd2b1fbfd819a37f5525249d457bae39d6e4`)  
**Reviewer:** Independent r2 (Cloud Agent)  
**Date:** 2026-10-26

## Verdict

**SHIP**

## Summary

Yawp! production **Bad Request** on logout and org-switch came from React Router 7.18+ single-fetch action CSRF checks: browser `Origin` (public CloudFront hosts) did not match `request.url` (App Runner internal host) before route actions ran. PR #827 whitelists Yawp browser hosts via `allowedActionOrigins`, routes membership switches to `/app` with `isActive` gates, and clears membership plus school-year scope cookies on logout.

**r1 → r2 delta:** `logout()` now **`await`s `clearSchoolYearScope()`** so `Set-Cookie` receives a resolved cookie string. React Router’s `createCookie().serialize()` returns a **Promise**; r1 passed a thenable into `combineHeaders`, which could stringify as `[object Promise]` and break logout cookie clearing. The auth unit test mock was updated to `async` so missing `await` fails the suite.

## Head SHA verification

| Source | SHA |
|--------|-----|
| Requested review head | `6a16ee8b539d83a34793aa279fee64a307e16258` |
| `origin/cursor/fix-org-switch-oops-b2e8` | `6a16ee8b539d83a34793aa279fee64a307e16258` |
| GitHub PR #827 `headRefOid` | `6a16ee8b539d83a34793aa279fee64a307e16258` |

## CSRF / `allowedActionOrigins`

| Check | Result |
|-------|--------|
| `yawp.school` listed | Pass |
| `demo.yawp.school` listed | Pass |
| `ua.yawp.school` listed | Pass |
| `allowedActionOrigins` exported in `react-router.config.ts` | Pass |
| Wildcard `*.yawp.school` (one label) | Pass (see risk) |

## Membership / logout hygiene

| Area | Assessment |
|------|------------|
| `api.membership-id` redirect | Always `302` → `/app` (ignores `Referer`) |
| Inactive membership on switch | `isActive: true` on lookup; no cookie when rejected |
| `no-membership` loader | First auto-pick requires `isActive: true` |
| Root org switcher (prod) | `getRootMembershipWhere` adds `{ isActive: true }` via `isYawpProductionEnvironment()` |
| Logout cookies | `await destroySession`, `await setMembershipId('')`, **`await clearSchoolYearScope()`** |

## r2 delta (commit `6a16ee8`)

```diff
-      { 'set-cookie': clearSchoolYearScope() },
+      { 'set-cookie': await clearSchoolYearScope() },
```

Runtime check: `schoolYearCookie.serialize()` from React Router resolves asynchronously; `await` aligns with other logout `Set-Cookie` headers.

## Tests

| Path | Result (local @ `6a16ee8`) |
|------|----------------------------|
| `app/utils/auth.server.test.ts` | Pass (includes logout cookie test + async `clearSchoolYearScope` mock) |
| `app/routes/api.membership-id/route.test.ts` | Pass |
| `app/utils/root-membership-filter.server.test.ts` | Pass |

**Local verification:** 29/29 passing (`bun test` on the three files above).

**CI @ r2 write time:** GitHub Actions run `40330794580` on head `6a16ee8` was in progress (including `ʦ TypeScript`); Migration Integration on the same head succeeded. Full-repo `typecheck` was not run locally (OOM in this environment).

## Risks / follow-ups

1. **`*.yawp.school` vs multi-level hosts:** RR wildcard rules match one subdomain label; deeply nested preview hosts may still need explicit entries or `**.yawp.school` if action CSRF errors appear outside listed prod hosts.
2. **Rejected org switch:** Inactive/invalid switch redirects to `/app` without clearing an existing membership cookie; `requireMembership` still clears invalid cookies on protected routes (pre-existing).
3. **No automated test for `allowedActionOrigins` contents:** Acceptable for this hotfix; optional deployment-contract test later.

## Checklist

- [x] Head SHA matches GitHub and requested commit (`6a16ee8b539d83a34793aa279fee64a307e16258`)
- [x] Full PR diff vs `origin/main` re-reviewed (8 files, 149 insertions / 7 deletions)
- [x] CSRF allowlist includes `yawp.school`, `demo.yawp.school`, `ua.yawp.school`
- [x] Org-switch action redirects to `/app`, not `Referer`
- [x] Active membership enforced on switch and no-membership recovery
- [x] Logout clears membership + school-year scope with **awaited** serialize
- [x] Unit tests for switch, logout, and root membership filter pass locally
- [ ] Full PR CI green (in progress at r2 write time)

## Files touched (PR diff vs main)

- `services/web-app/react-router.config.ts`
- `services/web-app/app/routes/api.membership-id/route.ts` (+ new test)
- `services/web-app/app/routes/no-membership/route.tsx`
- `services/web-app/app/utils/auth.server.ts` (+ test)
- `services/web-app/app/utils/root-membership-filter.server.ts` (+ test)
