# Independent Ship Review — PR #756 (r1)

**Verdict: SHIP**

**Head SHA reviewed:** `983a2147dab92d4fe77dbf71c8b6a5a7bcf39460`  
**Base reviewed against:** `main` @ `2b633fd7a5d8b0f641fddbb6150e87092b64fd69`  
**PR:** https://github.com/The-Connell-School/yawp/pull/756 — *fix: approve page Forward link must use NRP-purpose token*

## Scope summary

The approve page built `/free/admin/not-right-person` with the **ADMIN_APPROVE** token in `t`, while the NRP loader requires **ADMIN_NOT_RIGHT_PERSON** (`expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON'` in `free.admin.not-right-person/route.tsx`). Admin emails already mint and log separate approve and NRP URLs.

This PR:

- Adds `resolveAdminForwardTokenForApproveLink` to reuse a valid NRP token from recent successful `admin_approval` / `admin_approval_reminder` email logs when the logged approve URL’s JWT `linkId` matches the current approve link, else mints a fresh NRP link with the approve row’s remaining TTL (does not consume the approve token).
- Adds `buildAdminForwardPageSearch(forwardToken, approveToken)` so `t` = NRP and `approveT` = approve (aligned with e2e evidence and optional back-navigation on NRP).
- Wires `forwardToken` through the approve loader and `AdminForwardLink` / `AdminApproveForm` (v2: link below card when `showDenyAndQa`; legacy: link in form when `!showDenyAndQa`).
- Hides the forward affordance when resolution returns null (no broken purpose-mismatch link).

Eight files, ~254 lines. **`action` on `free.admin.approve/route.tsx` is unchanged** (still `completeSchoolAdminApproval` on form `token` only).

## Review focus

### Loader / link params

| Check | Result |
|-------|--------|
| NRP purpose in `t` | Yes — `buildAdminForwardPageSearch` sets `t` to `forwardToken`; loader resolves via `resolveAdminForwardTokenForApproveLink`. |
| Approve token preserved | Yes — `approveT` from `approveToken`; form hidden input still uses approve `token`. |
| NRP loader contract | Matches `free.admin.not-right-person` loader: `t` → `ADMIN_NOT_RIGHT_PERSON`, optional `approveT` for back link. |

### Token minting / pairing / authz

- **Application binding:** Forward resolution runs only after `peekSignedLink` succeeds for `ADMIN_APPROVE`; `applicationId` and `approveLinkId` come from that peek, not from client input.
- **Email log pairing:** Log scan requires both URLs in payload, decodes approve JWT `linkId` via `readSignedLinkPayloadFromAdminToken`, matches current `approveLinkId`, and `peekSignedLink` on the forward token with `ADMIN_NOT_RIGHT_PERSON`. Prevents picking an unrelated log row from another approval cycle on the same application when link IDs differ.
- **Mint fallback:** Loads approve row by `approveLinkId`; skips if used or expired; mints NRP with remaining TTL — same pattern as initial email mint in `approval-v2.server.ts` (separate rows per purpose).
- **No approve invalidation:** Mint path only creates an NRP row; approve action path untouched.
- **Unused arg:** `approveToken` on `resolveAdminForwardTokenForApproveLink` is unused today (pairing uses log + DB row id). Harmless; optional hardening could cross-check JWT on the live token.

No authz hole identified for cross-app or wrong-purpose access beyond the original signed-link model.

### Approve / deny

- Approve **action** and deny route imports unchanged in this diff.
- `showDenyAndQa` / `FREE_TIER_FLAG` gating unchanged; forward placement still split on `showDenyAndQa` as before.

### Free-tier gating

- Loader still calls `requireFreeTierEnabled()` first.
- Forward resolution only on successful approve peek (valid open approval link).

### Tests / regression on purpose mismatch

| Test | What it proves |
|------|----------------|
| `admin-approve-forward-link.server.test.ts` | `t` ≠ `approveT` param assignment. |
| `route.forward-link.test.ts` | Loader returns distinct `forwardToken`, calls resolver with `applicationId` + `approveLinkId`. |
| `route.v2.test.tsx` | Rendered href includes NRP `t=forward-token` and `approveT=approve-token`. |

**Gaps (non-blocking for r1 logic):**

- No unit/integration test exercising `forwardTokenFromEmailLogs` or `mintForwardTokenForApproveLink` against real Prisma (resolver behavior is mocked in route tests).
- Existing onboarding e2e uses email `notRightPersonUrl` directly; does not assert approve-page forward href (still valuable post-merge smoke).

**Local verification (this review):** `bun test` on the three new/updated test files above — 5 pass, 0 fail. Full `typecheck` on PR head passes locally with adequate heap.

### Architecture nit

`AdminApprovalStates.tsx` imports `buildAdminForwardPageSearch` from `admin-approve-forward-link.server.ts`, which also exports DB-backed resolver code. The helper is pure; consider a small shared non-`.server` module later to avoid pulling server graph into shared UI. Not a functional blocker for this fix.

## CI note

**Do not merge PR #756 from this review alone.** Platform merges after **SHIP + green CI on the exact head**.

At review time, head `983a2147…` had **ʦ TypeScript: fail** (GitHub Actions run 40184478897): existing `route.loader.test.ts` does not mock `resolveAdminForwardTokenForApproveLink` / `prisma.freeTierEmailLog`, so loader tests invoke real resolver and throw `prisma.freeTierEmailLog.findMany` undefined. **Product fix is sound; author should mock the forward resolver (as in `route.forward-link.test.ts`) or extend the prisma mock, then re-run CI.**

Reviewer did not merge #756.
