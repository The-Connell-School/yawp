# Independent Ship Review — PR #756 (r2)

**Verdict: SHIP**

**Head SHA reviewed:** `153799ed07c7554e934ec2e71ddc082a8f250d2a`  
**Prior review:** r1 @ `983a2147dab92d4fe77dbf71c8b6a5a7bcf39460` (docs PR #757)  
**Base reviewed against:** `main` @ `2b633fd7a5d8b0f641fddbb6150e87092b64fd69`  
**PR:** https://github.com/The-Connell-School/yawp/pull/756 — *fix: approve page Forward link must use NRP-purpose token*

## r2 delta (since r1)

r1 **SHIP**’d the product logic but flagged two follow-ups that blocked merge confidence:

1. **Client bundle / CI:** `AdminApprovalStates.tsx` imported `buildAdminForwardPageSearch` from `admin-approve-forward-link.server.ts`, pulling server-only resolver code into shared UI and breaking the production client build (and loader tests that invoked the real resolver without Prisma mocks).

2. **Loader test gap:** `route.loader.test.ts` did not mock `resolveAdminForwardTokenForApproveLink`, causing CI TypeScript/runtime failures when the approve loader called the real email-log resolver.

**This head addresses both:**

| Change | Effect |
|--------|--------|
| New `admin-approve-forward-link.ts` | Pure `buildAdminForwardPageSearch(forwardToken, approveToken)` — NRP in `t`, approve in `approveT`. |
| `admin-approve-forward-link.server.ts` | Server-only: `resolveAdminForwardTokenForApproveLink` (log reuse + mint fallback). No re-export of the URL helper. |
| `AdminApprovalStates.tsx` | Imports helper from `~/domain/free-tier/admin-approve-forward-link` (no `.server`). |
| `route.loader.test.ts` | Mocks `resolveAdminForwardTokenForApproveLink` (same pattern as `route.forward-link.test.ts`). |
| `admin-approve-forward-link.server.test.ts` | Imports `buildAdminForwardPageSearch` from client-safe module. |

No behavioral change to token purposes, minting, or approve/deny actions in this delta — packaging and test mocks only.

## Scope summary (full PR)

The approve page previously linked to `/free/admin/not-right-person` with the **ADMIN_APPROVE** token in `t`. The NRP loader requires **ADMIN_NOT_RIGHT_PERSON**. Admin emails already mint and log separate approve and NRP URLs.

This PR:

- Adds `resolveAdminForwardTokenForApproveLink` to reuse a valid NRP token from recent successful `admin_approval` / `admin_approval_reminder` email logs when the logged approve URL’s JWT `linkId` matches the current approve link, else mints a fresh NRP link with the approve row’s remaining TTL (does not consume the approve token).
- Adds `buildAdminForwardPageSearch(forwardToken, approveToken)` so `t` = NRP and `approveT` = approve (aligned with e2e evidence and optional back-navigation on NRP).
- Wires `forwardToken` through the approve loader and `AdminForwardLink` / `AdminApproveForm` (v2: link below card when `showDenyAndQa`; legacy: link in form when `!showDenyAndQa`).
- Hides the forward affordance when resolution returns null (no broken purpose-mismatch link).
- Adds `readSignedLinkPayloadFromAdminToken` in `signed-link.server.ts` for log pairing by `linkId`.

**`action` on `free.admin.approve/route.tsx` is unchanged** (still `completeSchoolAdminApproval` on form `token` only). Deny route unchanged in this PR.

## Review focus

### Client vs `.server` imports

| Module | Imports `.server` forward-link? |
|--------|----------------------------------|
| `AdminApprovalStates.tsx` | **No** — `admin-approve-forward-link.ts` only. |
| `AdminApprovalForms.tsx` | **No** — uses `AdminForwardLink` from states only. |
| `free.admin.approve/route.tsx` | **Yes** — `resolveAdminForwardTokenForApproveLink` (loader; correct). |

Repo grep: no `.tsx` file imports `admin-approve-forward-link.server`.

### Loader / link params

| Check | Result |
|-------|--------|
| NRP purpose in `t` | Yes — `buildAdminForwardPageSearch` sets `t` to `forwardToken`; NRP loader uses `expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON'`. |
| Approve token preserved | Yes — `approveT` from approve token; form hidden input still uses approve `token`. |
| Back link on NRP | `AdminForwardBackLink` uses `/free/admin/approve?t=<approveToken>` only. |

### Token minting / pairing / authz

Unchanged from r1; re-verified on this head:

- **Application binding:** Forward resolution runs only after successful `peekSignedLink` for `ADMIN_APPROVE`; `applicationId` and `approveLinkId` from peek, not client input.
- **Email log pairing:** Requires both URLs in payload, matches approve JWT `linkId` to current link, validates forward token with `ADMIN_NOT_RIGHT_PERSON` peek.
- **Mint fallback:** Skips if approve row used or expired; mints NRP with remaining TTL only.
- **No approve invalidation:** Mint path creates NRP row only.

No authz / TTL / wrong-application regression identified beyond the existing signed-link model.

### Approve / deny / free-tier gating

- Approve **action** and deny route logic unchanged.
- `showDenyAndQa` / `FREE_TIER_FLAG` gating unchanged; forward placement still split on `showDenyAndQa`.
- Loader still calls `requireFreeTierEnabled()` first.

### Tests / build

| Verification | Result |
|--------------|--------|
| `bun test` — `admin-approve-forward-link.server.test.ts`, `route.forward-link.test.ts`, `route.loader.test.ts`, `route.v2.test.tsx`, `route.ui.test.tsx` | **14 pass, 0 fail** |
| `bun run build` on head `153799ed…` | **Pass** (client + server bundles) |

**Gaps (unchanged from r1, non-blocking):**

- No unit test against real Prisma for `forwardTokenFromEmailLogs` / `mintForwardTokenForApproveLink` (route tests mock resolver).
- Approve-page forward href not asserted in full e2e (email URLs still covered in copy-pass1 evidence).

### CI note

At review time, GitHub Actions on head `153799ed…` was **in progress** (TypeScript, E2E shards, migrations pending). r2 fixes the r1-identified client-import and loader-mock issues that caused the prior **ʦ TypeScript** failure on `983a2147…`.

**Do not merge PR #756 from this review alone.** Platform merges after **SHIP + green CI on the exact head**.

Reviewer did not merge #756.
