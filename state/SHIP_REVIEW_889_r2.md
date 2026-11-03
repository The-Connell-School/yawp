# Independent Ship Review r2 — PR #889

**PR:** https://github.com/The-Connell-School/yawp/pull/889  
**Title:** fix: class invite onboarding and submit-time document titles  
**Branch:** `cursor/fix-invite-and-submit-title-26d7`  
**Base:** `main`  
**Reviewed head SHA:** `0cfe8a86127465b054bbb5c8b64cd2f4ce9668a3` (`0cfe8a861`)  
**GitHub `headRefOid` at review time:** `0cfe8a86127465b054bbb5c8b64cd2f4ce9668a3` — **matches; freshness OK**

**Prior review:** r1 @ `875256e636fcf8570b52a208afa48b9fc3b73f4c` — **SHIP** (product) with merge hold on TypeScript + pending exact-head CI

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-30  
**Product source:** Brian production bugfixes (2026-10-30)

**SHIP**

---

## r2 delta vs r1 (author fixes after `875256e63`)

| r1 blocker / gap | r2 evidence @ `0cfe8a861` | Result |
| --- | --- | --- |
| Four `redirectWithToast` assignments without `await` (`Promise<Response>` vs `Response`) | `verify-invitation.server.ts` lines ~144, ~213, ~249, ~325 use `response: await redirectWithToast(...)` | **Addressed** |
| Exact-head ʦ TypeScript red @ `875256e63` | CI ʦ TypeScript success; local `bun run typecheck` in `services/web-app` clean @ `0cfe8a861` | **Addressed** |
| E2E / Prisma / browser CI pending @ r1 | Exact-head run `41140340373` all required jobs success | **Addressed** |
| (CI hygiene) Client route pulling server modules | `VerifyInvitationSchema` moved to `verify-invitation.schema.ts`; `route.tsx` dynamic-imports `./verify-invitation.server` in loader/action only | **Addressed** (no product change) |
| E2E student signup after email GET link | `auth.signup.student.spec.ts`: `followStudentInviteVerifyLink` GET `/auth/inv/verify?…` → `toHaveURL(/\/auth\/inv\/onboard-student/)` | **Addressed** |

Commits on branch after r1 head: `66335f70b` (docs: ship review r1), `0cfe8a861` (fix(ci): isolate invite verify server code and await toast redirects).

---

## Product intent vs implementation @ `0cfe8a861`

Unchanged from r1; re-verified on current head.

| Intent | Evidence | Result |
| --- | --- | --- |
| **(1a)** Class invite “Join class” email is GET `/auth/inv/verify?…`; verification on GET | Enrollment builds GET verify URL; `verifyInvitationLoader` → `verifyInvitationFromQuery` → `verifyInvitationCredentials`; unit test simulates email link | **Met** |
| **(1b)** New students reach `/auth/inv/onboard-student` after valid code | `completeVerifiedInvitation` deletes invite + cookie + `redirect('/auth/inv/onboard-student')` when no existing user | **Met** |
| **(1c)** `verifyTOTP` awaited (no `!!Promise` bypass) | `const verification = await verifyTOTP(...)`; test rejects when mock resolves `null` | **Met** |
| **(1d)** Existing student: keep invitation, sign-in path | Existing user branch `await redirectWithToast` to login; no `prisma.invitation.delete` | **Met** |
| **(1e)** Shared verify logic for GET loader + POST action | `verify-invitation.server.ts`; POST rate limits preserved in action | **Met** |
| **(2a–c)** Submit-time `Document.title` backfill when empty; editor title input refresh | `backfillDocumentTitle` in submit transaction; route test; `onSubmitted` title input update (unchanged since r1) | **Met** |

---

## Exact-head CI (required gate)

**Workflow (main CI):** https://github.com/The-Connell-School/yawp/actions/runs/41140340373  
**Workflow (migration-integration):** https://github.com/The-Connell-School/yawp/actions/runs/41140340472  
**Workflow (preview):** https://github.com/The-Connell-School/yawp/actions/runs/41140338562  
**Run `head_sha`:** `0cfe8a86127465b054bbb5c8b64cd2f4ce9668a3` — **matches reviewed head**  
**Run conclusion:** `success`

| Check | Result |
| --- | --- |
| Changed paths | pass |
| Preview tooling / preview-policy / preview-deploy | pass |
| migration-integration | pass |
| ʦ TypeScript | pass |
| Prisma migrations | pass |
| E2E smoke shards 1–6, merge reports, Playwright | pass |
| Sign-on browser, demo feedback + preview access, free-tier locked preview | pass |

GitHub PR checks @ review time: 18 successful, 0 failed, 0 pending, 2 skipped (`preview-destroy`, `preview-cleanup`).

---

## Scope vs author claims (`origin/main...0cfe8a861`)

**9 files**, +805 / −333 — invite verify refactor + submit title backfill + targeted tests + ship review state docs.

No new migrations in PR delta.

---

## Reviewer-executed tests @ `0cfe8a861`

```text
/home/ubuntu/.bun/bin/bun test \
  services/web-app/app/routes/auth.inv.verify/verify-invitation.server.test.ts \
  services/web-app/app/routes/api.domain.submit-document/route.test.ts
→ 21 pass, 0 fail
```

```text
NODE_OPTIONS='--max-old-space-size=8192' bun run typecheck  # services/web-app
→ pass (react-router typegen && tsc)
```

---

## Risks / review notes (non-blocking)

Same as r1; no new product risks from r2 CI-only refactor:

1. GET verify without POST rate limit — intentional for email one-shot links.
2. Invalid GET verify returns manual form without field error — acceptable for malformed links.
3. Title backfill only when `Document.title` empty/whitespace.
4. Schema split + dynamic import reduces accidental client bundle of server deps; behavior unchanged.

---

## Blockers

**None** — r1 TypeScript and CI gates are green on exact head.

---

## Verdict

**SHIP** — Product intent for both production bugfixes remains implemented and tested; r1 merge blockers (await `redirectWithToast`, full exact-head CI) are resolved @ `0cfe8a861`. Safe to merge from an independent review perspective.

**Do not merge as part of this review task** — ship review only.
