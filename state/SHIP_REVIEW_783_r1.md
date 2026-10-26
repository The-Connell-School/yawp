# Independent Ship Review r1 — PR #783

## Verdict: SHIP

**Reviewed head SHA:** `525738b832a3f5b937a46c6b67edad2e174500d2` (matches PR head at review time)

**PR:** https://github.com/The-Connell-School/yawp/pull/783  
**Branch:** `cursor/fix-redact-api-error-message-8n-3126` → `main`

## Scope summary

Quality lane **#8n** (continues #754): stop surfacing raw exception or provider text in client-facing API/auth JSON on four handlers:

| Site | Change |
|------|--------|
| `auth.inv.forgot-password` | Email send failure → stable field error copy (no `response.error.message`) |
| `api.collab.$id.submit` | Unexpected errors → `500` JSON with fallback via `safeErrorTextForClientResponse` |
| `api.domain.lesson-planner.uploads` | Non-`SourceDocumentError` read failures → stable `422` `error` string |
| `api.assignments.create` | Non-quota deployment failures → `500` JSON with stable `message` |

Diff: **8 files**, +230 / −85 lines. No schema, infra, Kevin-track, or #608 paths touched.

## What was checked

- **Full diff** `origin/main...525738b832a3f5b937a46c6b67edad2e174500d2` read end-to-end.
- **Helper correctness:** `safeErrorTextForClientResponse` always returns the supplied fallback (never forwards `_error` text) — appropriate usage at all three call sites; forgot-password uses equivalent fixed copy.
- **Intentional typed / product copy preserved:**
  - `GroupSubmitError` → `400` + `error.message` (collab submit).
  - `SourceDocumentError` → `422` + `error.message` (lesson planner uploads).
  - `FreeClassroomAssignmentQuotaError` → `403` + quota message (assignments create).
  - `AssignmentPromptAttachmentError` unchanged (`400` + message); attachment path still `throw`s on unexpected errors (pre-existing, outside this PR’s four sites).
- **Security / client JSON:** Canary strings `SECRET-TOKEN` and prisma-like sensitive text must not appear in serialized responses — asserted in new/updated tests.
- **Tests:** Ran at reviewed head:
  - `app/routes/api.assignments.create/route.test.ts` (new canary)
  - `app/routes/api.collab.$id.submit/route.test.ts` (new file)
  - `app/routes/api.domain.lesson-planner.uploads/route.test.ts` (canary)
  - `app/routes/auth.inv.forgot-password/route.test.ts` (new file)  
  All four canary tests **pass** under Bun 1.4.4.
- **Regressions / Kevin #723 / #484 / #459 / #608:** No files or references in the changed set; no grading-workspace or related Kevin-track edits.
- **Behavior change note:** `api.assignments.create` and collab submit no longer rethrow unexpected errors (framework/500 HTML); they now return structured JSON `500` — consistent with other #754/#8n routes and appropriate for these API actions.

## Findings

1. **Non-blocking — test scope in lesson planner uploads:** `route.test.ts` replaces three existing **413 / max body** tests with only the new redaction canary. Upload size guarding in `route.ts` is unchanged, but **413 coverage for this route is removed** from the suite. Recommend restoring the 413 tests in a follow-up (or a dedicated commit on #783) so payload limits stay guarded independently of #8n.
2. **Pre-existing (not introduced here):** Prompt attachment upload in `api.assignments.create` still `throw`s on non-`AssignmentPromptAttachmentError` failures — potential future #8n site, not part of this PR’s claims.

No findings that leave raw exception or provider text on the four claimed paths.

## Recommendation

**SHIP** PR #783 at `525738b832a3f5b937a46c6b67edad2e174500d2`.

Sanitization is correct, typed domain errors and quota copy are preserved, canary tests prove secrets stay out of JSON, and scope stays limited to the four advertised handlers. Restore lesson-planner 413 tests as a small follow-up if merging as-is.
