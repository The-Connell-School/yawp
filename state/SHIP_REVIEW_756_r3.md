# Independent Ship Review — PR #756 (r3)

**Verdict: SHIP**

**Head SHA reviewed:** `6c0fca581b05e304a5ce8516c3199c1a6c432da3`  
**Prior review:** r2 @ `153799ed07c7554e934ec2e71ddc082a8f250d2a` (docs PR #758)  
**Base reviewed against:** `main` @ merge-base with PR #756  
**PR:** https://github.com/The-Connell-School/yawp/pull/756 — *fix: approve page Forward link must use NRP-purpose token*

## r3 delta (since r2)

r2 **SHIP**’d the client-safe helper split and loader mocks, but CI then failed on **`admin.approve-from-email` jump**: the approve loader reached the happy path, yet the page lacked the designed heading because `resolveAdminForwardTokenForApproveLink` → `mintSignedLink` threw **`FreeTierConfigError`** when `PRIMARY_APP_URL` was unset in that environment. The error bubbled out of the loader and prevented `ok: true` teacher/school data from rendering.

**This head hardens forward resolution so approve/deny never depends on forward mint succeeding:**

| Change | Effect |
|--------|--------|
| `resolveAdminForwardTokenForApproveLink` outer `try/catch` | Any resolver failure returns `null` instead of throwing. |
| `mintForwardTokenForApproveLink` | On `FreeTierConfigError` from `mintSignedLink`, retries with `mintSignedLinkForDevPanel` (HMAC still required); other errors → `null`. |
| `free.admin.approve` loader | Wraps forward resolution in `try/catch`; omits `forwardToken` when resolution throws or returns `null`. |
| `route.loader.test.ts` | Asserts thrown resolver still yields `ok: true` with heading fields and **no** `forwardToken`. |

No change to approve **action**, deny route, or NRP/`t` vs approve/`approveT` URL shape when a forward token is present.

## Review focus

### Approve page when forward resolution fails

| Check | Result |
|-------|--------|
| Happy path when `peek.ok` | Loader still returns `ok: true` with `schoolName`, `teacherName`, approve `token`, and `adminApprovePageTitle` heading via `AdminApprovePageIntro` / card title. |
| Resolver throw | Loader catch → `forwardToken` omitted; page renders approve form (verified in loader test). |
| Resolver `null` | `forwardToken` omitted (`?? undefined`). |
| Forward affordance | `AdminForwardLink` only when `showDenyAndQa && data.forwardToken` (below card) or legacy form branch when `forwardToken` set — **no link** when missing. |
| Fail-open vs fail-closed | **Correct:** approve path stays available; forward is **opt-in** when a validated NRP token exists. No fallback that puts the approve token in NRP `t`. |

Does **not** fail closed on the whole approve page due to forward/config errors. Does **not** fail open by showing a broken forward URL with wrong purpose.

### Authz and token separation

| Check | Result |
|-------|--------|
| Forward resolution inputs | Only after successful `peekSignedLink` for `ADMIN_APPROVE`; `applicationId` and `approveLinkId` from peek, not client params. |
| Email log reuse | Unchanged: requires logged approve + NRP URLs, JWT `linkId` match, NRP peek ok. |
| Mint fallback | NRP purpose only; skips if approve row used/expired; TTL from approve row remaining life. |
| `null` forwardToken | UI omits forward link; form hidden input remains approve `token` only — **no** substitute or leak of unrelated tokens. |
| NRP vs approve in URLs | When present, `buildAdminForwardPageSearch` sets `t` = NRP, `approveT` = approve (covered by unit + forward-link loader test). |

No authz hole identified from omitting `forwardToken` when resolution fails.

### Dev-panel mint fallback scope

| Check | Result |
|-------|--------|
| Trigger | Only `FreeTierConfigError` from `mintSignedLink` (missing `PRIMARY_APP_URL` or signing config path inside `assertFreeTierRuntimeConfigured`), not arbitrary errors. |
| `mintSignedLinkForDevPanel` | Same as existing dev-panel / suppress-email approval flow: requires `FREE_TIER_LINK_HMAC_SECRET` (or preview secret path); **does not** skip HMAC or mint without DB row + signed payload. |
| Production | With normal runtime config, `mintSignedLink` succeeds and dev fallback is not used. Misconfig without `PRIMARY_APP_URL` may mint via dev path — same class of behavior as dev-panel jumps; forward link hidden if both mint paths fail. |

No production **secret bypass** (HMAC still mandatory). Deliberate parity with existing `mintSignedLinkForDevPanel` usage in `approval-flow.server.ts` for non-email / dev contexts.

### Client vs `.server` imports

| Module | Imports `.server` forward-link? |
|--------|----------------------------------|
| `AdminApprovalStates.tsx` | **No** — `~/domain/free-tier/admin-approve-forward-link` only. |
| `AdminApprovalForms.tsx` | **No**. |
| `free.admin.approve/route.tsx` | **Yes** — `resolveAdminForwardTokenForApproveLink` in loader only. |

Repo grep: no `.tsx` under approve UI imports `admin-approve-forward-link.server`.

## Tests / build (reviewer execution)

| Verification | Result |
|--------------|--------|
| `bun test` — `admin-approve-forward-link.server.test.ts`, `route.forward-link.test.ts`, `route.loader.test.ts`, `route.v2.test.tsx`, `route.ui.test.tsx` | **15 pass, 0 fail** |
| `bun run build` on head `6c0fca581…` | **Pass** |

**Gaps (non-blocking):**

- No unit test exercising real `mintForwardTokenForApproveLink` `FreeTierConfigError` → `mintSignedLinkForDevPanel` branch (behavior matches established dev-panel mint helper).
- Email-log resolver still mocked at route layer.

### CI note

At review time, GitHub Actions on head `6c0fca581…` had checks **pending** (TypeScript, E2E shards, migrations). r3 directly addresses the r2 CI failure mode (loader throw on forward mint config).

**Do not merge PR #756 from this review alone.** Platform merges after **SHIP + green CI on the exact head**.

Reviewer did not merge #756.
