# Independent Ship Review — Yawp! PR #832 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/832  
**Branch:** `cursor/document-submit-toast-redact-621c`  
**Quality lane:** #8ah  
**Reviewer:** Independent Ship Review (r1)  
**Reviewed at (UTC):** 2026-10-26

## Verdict

**SHIP**

Merge when GitHub CI is green on the reviewed head. This review does not block on in-progress checks alone.

## Reviewed head

| Field | Value |
|-------|--------|
| **SHA** | `5763ba09ef88141e4c18a982a19cd2097713198c` |
| **GitHub `headRefOid`** | Matches at review time (freshness OK) |
| **Base reviewed against** | `main` @ `bc6d1c3252191153f7be0ba9880ec254c583ed36` |

## Scope check (diff vs `origin/main`)

- **Files:** 4 — `submit-document-client-messages.ts` (+ unit tests), `use-document-submit.ts`, `use-document-submit.test.tsx`.
- **Nature:** Client toast copy safety only for document submit failures. Adds `submitDocumentErrorTextForClient()` (whitelist `Set` + generic fallback), same spirit as #825 `documentCreationErrorTextForClient()`.
- **Out of scope / unchanged:** Submit API route, migrations, Terraform, UI layout, new user-facing strings beyond the existing generic `Submission failed.`
- **Overlap:** No Kevin / TeacherKev PR touchpoints in this diff.

## Findings

### Whitelist vs `api.domain.submit-document` error JSON

The submit action returns **one** intentional user-safe error `message` in JSON:

| Message | HTTP | Whitelisted | Toast behavior |
|---------|------|-------------|----------------|
| `This document changed before it could be submitted. Please refresh and try again.` | 409 | Yes | Shown verbatim |

Other failure modes on the route use `redirectWithToast` (not parsed by `useDocumentSubmit` on `!res.ok`) or rethrow (500 / framework error). Non-whitelisted JSON `message` values (e.g. Prisma text on 500) map to `Submission failed.`

The whitelist is **complete** for current submit-document JSON error copy.

### Hook wiring (`use-document-submit.ts`)

| Path | Before | After |
|------|--------|--------|
| `!res.ok` + JSON body | Raw `(body).message` or `'Submission failed.'` | `submitDocumentErrorTextForClient(body.message)` |
| `catch` | `'Submission failed: ' + err.message` | Fixed `SUBMIT_DOCUMENT_GENERIC_ERROR` (`Submission failed.`) |

Pre-existing fixed strings (save flush failures, invalid server response, success toast) are unchanged and do not leak server exceptions.

### Tests

| Area | Coverage |
|------|----------|
| Whitelist pass-through | `submit-document-client-messages.test.ts` + hook test (409 conflict copy) |
| Unknown / internal message | Unit test (Prisma-like string) + hook test (500 + Prisma-like JSON) |
| Empty / whitespace message | Unit test → generic fallback |
| Catch / network throw | **Gap (nit):** no test that forces `fetch` to throw and asserts generic toast; behavior is a one-line constant swap aligned with unit fallback |

**Local verification (reviewed head):**  
`bun test` on `submit-document-client-messages.test.ts` and `use-document-submit.test.tsx` — **11 pass, 0 fail**.

### Maintenance

New user-safe submit error `message` strings from the API must be added to `SUBMIT_DOCUMENT_USER_SAFE_MESSAGES` or clients will see the generic fallback. Matches the conservative whitelist pattern from #825.

## CI (head `5763ba09`)

At review time:

- **Pass:** Changed paths, Preview tooling, preview-policy, migration-integration.
- **In progress:** TypeScript, Prisma migrations job, E2E shards, browser flows, preview-deploy.
- **Fail:** None observed.

Re-check green on the same head before merge.

## Recommendation

Approve **#832** for merge after green CI on `5763ba09ef88141e4c18a982a19cd2097713198c`. This review does not merge #832 and does not squash-merge.

**Final line: SHIP** on head `5763ba09ef88141e4c18a982a19cd2097713198c`.
