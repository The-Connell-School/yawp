# Independent Ship Review r1 — PR #889

**PR:** https://github.com/The-Connell-School/yawp/pull/889  
**Title:** fix: class invite onboarding and submit-time document titles  
**Branch:** `cursor/fix-invite-and-submit-title-26d7`  
**Base:** `main`  
**Reviewed head SHA:** `875256e636fcf8570b52a208afa48b9fc3b73f4c` (`875256e63`)  
**GitHub `headRefOid` at review time:** `875256e636fcf8570b52a208afa48b9fc3b73f4c` — **matches; freshness OK**

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-30  
**Product source:** Brian production bugfixes (2026-10-30)

**SHIP** (merge hold — see blockers)

---

## Product intent vs implementation @ `875256e63`

| Intent | Evidence | Result |
| --- | --- | --- |
| **(1a)** Teacher Add Student email “Join class” is GET `/auth/inv/verify?…`; verification must run on GET, not POST-only | `class-student-enrollment.server.tsx` builds GET verify URL with `code` in query; `loader` calls `verifyInvitationFromQuery` → `verifyInvitationCredentials`; `verifyInvitationFromQuery` test simulates email link | **Met** |
| **(1b)** New students reach `/auth/inv/onboard-student` after valid code | `completeVerifiedInvitation` deletes invite + sets cookie + `redirect('/auth/inv/onboard-student')` when no existing user; unit tests for credentials + query path | **Met** |
| **(1c)** `verifyTOTP` must be awaited (no `!!Promise` truthy bypass) | `const verification = await verifyTOTP(...)`; test rejects when mock resolves `null` and does not delete invitation | **Met** |
| **(1d)** Existing student: keep invitation, sign-in path | Existing user branch uses `redirectWithToast` to login; `prisma.invitation.delete` not called; dedicated test | **Met** |
| **(1e)** Shared verify logic for GET loader + POST action | `verify-invitation.server.ts` extracted; `route.tsx` thin loader/action with POST rate limits preserved | **Met** |
| **(2a)** Submit stored title on `Submission.title` only; editor reads `Document.title` | Submit route already used prompt title for submission; gap was document row | **Met** |
| **(2b)** On submit, if prompt title non-empty and `Document.title` empty, update `Document.title` in submit transaction | `backfillDocumentTitle` + `document.updateMany` in same `$transaction` as `submission.create`; route test asserts `updateMany.data.title` | **Met** |
| **(2c)** Refresh title input in editor after submit | `onSubmitted` sets `titleInputRef.current.value = newSubmission.title` when trimmed title present | **Met** |

---

## Exact-head CI

**Workflow (main CI):** https://github.com/The-Connell-School/yawp/actions/runs/41129177725  
**Workflow (preview):** https://github.com/The-Connell-School/yawp/actions/runs/41129177517  
**Workflow (migration-integration):** https://github.com/The-Connell-School/yawp/actions/runs/41129177866  
**Run `headSha`:** `875256e636fcf8570b52a208afa48b9fc3b73f4c` — **matches reviewed head**

**Status at review time:**

| Check | Result |
| --- | --- |
| Changed paths | pass |
| Preview tooling / preview-policy / preview-deploy | pass |
| migration-integration | pass |
| **ʦ TypeScript** | **fail** |
| Prisma migrations, E2E shards, browser suites | pending |

**TypeScript failure (product-adjacent, merge-blocking):**  
`verify-invitation.server.ts` assigns `redirectWithToast(...)` to `response: Response` without `await` (lines ~141, ~210, ~246, ~322). `redirectWithToast` is `async`. Annotations: `Type 'Promise<Response>' is missing the following properties from type 'Response'…`  
Local repro: `NODE_OPTIONS='--max-old-space-size=8192' bun run typecheck` in `services/web-app` reports the same four errors @ `875256e63`.

Runtime may still work when loaders/actions return the nested `Promise` (React Router often flattens), but **exact-head TypeScript is red** — fix with `await redirectWithToast(...)` (or widen result type) before merge.

---

## Reviewer-executed tests @ `875256e63`

```text
/home/ubuntu/.bun/bin/bun test \
  services/web-app/app/routes/auth.inv.verify/verify-invitation.server.test.ts \
  services/web-app/app/routes/api.domain.submit-document/route.test.ts
→ 21 pass, 0 fail
```

Covers: invalid TOTP, new-student redirect, existing-student login without invite delete, GET query auto-verify, submit-time document title backfill.

 `./bin/project test --profile changed` hit `ENOBUFS` in this VM (unrelated suite noise); not used as gate.

---

## Risks / review notes

1. **GET verify without POST rate limit:** Email links intentionally auto-verify on GET. Brute-force remains constrained on POST path; GET exposes code-in-URL one-shot semantics (pre-existing product shape).
2. **Invalid GET verify:** `verifyInvitationFromQuery` returns `null` on bad/expired code — user lands on manual code form without field error. Acceptable for malformed links; valid email links should succeed.
3. **Title backfill scope:** Only when `Document.title` is empty/whitespace; non-empty document titles unchanged (correct).
4. **Refactor surface:** Teacher/owner/password-reset flows moved into shared module; behavior preserved from prior inline `route.tsx` logic; no schema/migration changes in diff.

---

## Blockers (merge, not product)

1. **Fix four `await redirectWithToast` (or typing) in `verify-invitation.server.ts` and re-run ʦ TypeScript @ head.**
2. **Confirm remaining exact-head CI green** (E2E / browser / Prisma migrations were still running at review time).

---

## Verdict

**SHIP** — product intent for both production bugfixes is implemented and covered by targeted unit tests on head `875256e63`.

**Do not merge from this review** — ship review only. Driver should land TS fix + green exact-head CI before merge.
