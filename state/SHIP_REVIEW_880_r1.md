# Independent Ship Review — PR #880 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/880  
**Title:** PE3 transactional email component-sheet alignment (chrome polish)  
**Base:** `main` (`005ce8ab0e71224339ed15724327d02b09375517`)  
**Reviewed head SHA:** `1bf280b4640a4ce9b4c132ece8c336622c3abb22`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## Scope vs author claims

Diff `origin/main...1bf280b4640a4ce9b4c132ece8c336622c3abb22` is **one commit**, **8 files**, **+12 / −9**:

| File | Change |
|------|--------|
| `services/web-app/app/emails/brand.ts` | `EMAIL_CARD_BG` `#ffffff` → `#fffdf9` (PE3 warm white) |
| `services/web-app/app/emails/layout/yawp-email-layout.tsx` | Footer copy/link split (`Questions? Write to` + linked `support@yawp.school`); `1px solid ${EMAIL_CARD_BORDER}` on `IdentityCard`, `CodeBlock`, `PersonalNoteBlock` |
| `services/web-app/app/domain/free-tier/admin-approval-copy.ts` | Non–pass1 admin-forward preheader: `No Yawp! account needed` → `You don't need a Yawp! account.` |
| `services/web-app/app/domain/free-tier/__goldens__/flag-off-main-7b203f73/*/html.txt` (5 scenarios) | Regenerated HTML goldens reflecting chrome + forward preheader |

**No** changes to send sites (`email.server.ts`, `approval-v2.server.ts`, unified sign-on mail, route actions), builders beyond shared layout/copy consumption, or transactional template body copy outside the admin-forward preheader string. Matches the PR’s “final chrome alignment” claim; PE3 templates 01–13 remain wired through existing `build*DesignedEmail` → `YawpEmailLayout` paths on `main`.

## PE3 token / copy cross-check

| Claim | Evidence on head |
|-------|------------------|
| Warm card `#fffdf9` | `EMAIL_CARD_BG` in `brand.ts`; card/logo cells use `tdBg(EMAIL_CARD_BG)` in `yawp-email-layout.tsx`; goldens show `bgcolor="#fffdf9"` |
| Bordered identity / code / note blocks | Inline `border: 1px solid #e6e2d6` on the three block components; visible in golden HTML for admin scenarios |
| Admin **06** forward preheader | `adminApprovalEmailPreheader` forward branch + golden preheader div: `…You don't need a Yawp! account.` (aligns with PR sticky-table note vs older tpl wording) |
| Footer support line | Rendered footer: `Questions? Write to` + `mailto:support@yawp.school` anchor text `support@yawp.school` |
| Flag-off HTML goldens | `admin-approval-email-flag-off-main-parity.test.ts` compares live render to `flag-off-main-7b203f73` fixtures |

Documented PE3 deviations in the PR body (release subject, “Good news” body, teacher denied out of 01–13, pass1 gating) are unchanged by this diff.

## Layout / wiring spot-check

- **Brand → layout:** `YawpEmailLayout` imports `EMAIL_CARD_BG`, `EMAIL_CARD_BORDER`, and related tokens from `app/emails/brand.ts`; card shell and logo cell backgrounds flow from the token change (affects all shared-layout transactional emails, as intended).
- **Copy → admin template:** `transactional-emails.tsx` `AdminApprovalEmail` calls `adminApprovalEmailPreheader`; only the non–pass1 forward string changed.
- **Send path:** Grep/diff show no edits under `utils/email.server.ts`, `render.server.ts` builders’ call sites, or free-tier send orchestration for this commit range.

## Tests (local, at reviewed head)

Checked out `1bf280b4640a4ce9b4c132ece8c336622c3abb22` and ran:

```text
bun test app/emails/all-transactional-emails.test.ts     → 15 pass (emails 01–13 + long-name admin)
bun test app/emails/transactional-emails.test.ts           → 6 pass
bun test app/emails/ + release-email-v2 + pass1-layout   → 28 pass (subset of author’s email suite)
bun test admin-approval-email-flag-off-main-parity.test.ts → 6 pass (all flag-off goldens)
bun test admin-approval-copy.test.ts                       → 22 pass
```

**Total: 40 pass, 0 fail** across the author-cited email/admin surface (some files overlap in partial runs; full focused suite matches author report).

## CI (single observation)

- **PASS:** Changed paths, preview-policy, Preview tooling  
- **PENDING:** TypeScript, Prisma migrations, E2E shards, browser jobs, preview-deploy, migration-integration  
- **FAIL:** none at observation time  

Pending CI does not contradict a chrome-only diff with passing targeted tests.

## Risks (non-blocking)

- **Global chrome:** Card background and footer wording apply to every email using `YawpEmailLayout` (01–13), not admin-only — consistent with PE3 component sheet.
- **Preheader only:** Admin-forward preheader wording change is visible in inbox previews; in-body “You don't need a Yawp! account.” was already present in goldens/text fixtures.

## Verdict

**SHIP** — Diff is limited to PE3 chrome tokens, footer markup, one admin-forward preheader line, and matching flag-off HTML goldens. No send-path or template-body regressions identified; layout wiring and goldens align with claims. Safe to merge from an independent review perspective; this review does not merge.

**Blockers:** none
