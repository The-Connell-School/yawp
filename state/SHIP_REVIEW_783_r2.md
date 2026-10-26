# Independent Ship Review r2 — PR #783

## Verdict: SHIP

**Reviewed head SHA:** `43312d3466754bcbfc1bf3259f6ed4ef350700d3` (matches PR head at review time)

**PR:** https://github.com/The-Connell-School/yawp/pull/783  
**Branch:** `cursor/fix-redact-api-error-message-8n-3126` → `main`  
**Prior review:** r1 SHIP at `525738b832a3f5b937a46c6b67edad2e174500d2` ([docs #784](https://github.com/The-Connell-School/yawp/pull/784))

## What changed since r1 / why r2

r1 reviewed the functional redaction work at `525738b8` but noted two follow-ups:

1. **CI TypeScript failure:** New canary tests treated `data()` return values like `Response` (`.json()`, `.status`) instead of `DataWithResponseInit` (`.data`, `.init?.status`), matching the failure called out when r1 landed on docs #784.
2. **413 coverage gap:** The initial #8n sweep on lesson-planner uploads replaced three **413 / max body** tests with only the redaction canary; r1 recommended restoring them.

Commit `43312d3466754bcbfc1bf3259f6ed4ef350700d3` on the same branch fixes test assertions to the repo’s `DataWithResponseInit` pattern and restores both 413 tests plus the happy-path upload test, while keeping the redaction canary. No production-route logic changes beyond what r1 already approved.

## Scope summary

Quality lane **#8n** (continues #754): stop surfacing raw exception or provider text in client-facing JSON on four handlers:

| Site | Change |
|------|--------|
| `auth.inv.forgot-password` | Email send failure → stable field error copy (no `response.error.message`) |
| `api.collab.$id.submit` | Unexpected errors → `500` JSON with fallback via `safeErrorTextForClientResponse` |
| `api.domain.lesson-planner.uploads` | Non-`SourceDocumentError` read failures → stable `422` `error` string |
| `api.assignments.create` | Non-quota deployment failures → `500` JSON with stable `message` |

Full diff `origin/main...43312d3466754bcbfc1bf3259f6ed4ef350700d3`: **8 files**, +228 / −14 lines. No schema, infra, Kevin-track, or #608 paths touched.

## Checks

| Check | Result |
|-------|--------|
| **Redaction correctness** | `safeErrorTextForClientResponse` always returns the supplied fallback; forgot-password uses equivalent fixed copy. Typed paths unchanged: `GroupSubmitError` → `400`, `SourceDocumentError` → `422`, `FreeClassroomAssignmentQuotaError` → `403`. |
| **DataWithResponseInit test assertions** | Collab submit and lesson-planner tests assert via `.data` / `.init?.status` and shared `ActionResult` typing. Assignments canary uses existing `readBody()` / `responseStatus()` helpers (`response.data` / `response.init?.status` fallback). Forgot-password asserts on `result.data` JSON serialization. |
| **Restored 413 tests** | Lesson-planner `route.test.ts` again includes Content-Length 413, body-without-Content-Length 413, and small multipart success, plus the unexpected-read redaction canary (4 tests). |
| **Kevin / #608 untouched** | No files or references in the changed set. |
| **TypeScript-safety of tests** | GitHub **ʦ TypeScript** check **pass** on PR head (run 40260295761). Locally re-ran all new/updated canary and 413 tests under Bun 1.4.4 — **7 pass** across the four touched test files (assignments canary + 6 in collab/uploads/forgot-password). |

## Findings

1. **Resolved since r1:** TypeScript-safe assertions on `data()` returns; lesson-planner 413/max-body coverage restored alongside the #8n canary.
2. **Non-blocking (pre-existing):** Prompt attachment upload in `api.assignments.create` still `throw`s on non-`AssignmentPromptAttachmentError` failures — potential future #8n site, not part of this PR’s four claimed handlers.
3. **Behavior note (unchanged from r1):** `api.assignments.create` and collab submit return structured JSON `500` for unexpected errors instead of rethrowing — consistent with other #754/#8n API actions.

No findings that regress redaction, leave secrets in JSON on the four paths, or introduce unrelated churn.

## Recommendation

**SHIP** PR #783 at `43312d3466754bcbfc1bf3259f6ed4ef350700d3`.

Redaction remains correct, canary tests prove `SECRET-TOKEN` stays out of serialized responses, test typing matches `DataWithResponseInit`, 413 coverage is back, and scope stays limited to the advertised handlers.
