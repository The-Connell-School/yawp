# Independent Ship Review r1 — PR #806

| Field | Value |
| --- | --- |
| **Application PR** | [#806](https://github.com/The-Connell-School/yawp/pull/806) — fix: redact remaining API error.message (#8y) |
| **Reviewed head (exact)** | `087ad964772a687a46e9dd9ae7b5475e1d4ccd28` |
| **Branch** | `cursor/api-error-redaction-8y-becd` |
| **Base at review time** | `6e9ea6d32` (main, #804) |
| **Reviewer** | Independent Ship Review (Cloud Agent r1) |
| **Verdict** | **SHIP** |

## Summary

PR #806 closes the gap left after #8n: typed domain `catch` blocks on several API routes still returned raw `error.message`, while unexpected failures already used `safeErrorTextForClientResponse` (fallback-only). The new `safeDomainErrorTextForClientResponse` runs intentional teacher-facing domain copy through the existing `redactFreeformMessage` stack, with sensible per-route fallbacks when the message trims empty. Wiring matches the claimed route list; `rg 'error\.message' services/web-app/app/routes/api.*` is empty on this head. Unit/route canary tests assert `SECRET-TOKEN` and email substrings do not appear in serialized JSON bodies.

## Helper correctness

### `safeDomainErrorTextForClientResponse`

```93:99:services/web-app/app/utils/server-error-request-context.server.ts
export function safeDomainErrorTextForClientResponse(
  error: Error,
  fallback: string,
): string {
  const redacted = redactFreeformMessage(error.message).trim();
  return redacted || fallback;
}
```

**vs existing stack:** Composes correctly with `safeErrorTextForClientResponse` (never forwards raw exception text; returns fallback only) and `redactFreeformMessage` (token-like patterns, emails, URLs, query strings, 300-char cap). Domain errors that are hand-authored validation/quota strings pass through unchanged when they contain no sensitive substrings (covered by unit and route tests).

**Over-redaction / teacher UX:** Low risk. Examples preserved in tests: quota copy (“used all 12 free Class Starters”), prompt length (“That prompt is too long…”), PDF validation (“Only PDF files are supported”). Redaction only strips embedded `token=…`, emails, and URLs when a bug or wrapper accidentally concatenates diagnostics into a domain message.

**Under-redaction / secrets:** Residual risk is the same as anywhere `redactFreeformMessage` is used: secrets that do not match `TOKEN_LIKE` or email/URL heuristics (e.g. bare connection strings without `token=` or `secret=`) could remain. That is acceptable here because the typed errors wired in this PR use fixed product copy, not Prisma/runtime throws. Unexpected paths on the touched routes still use generic fallbacks, not raw messages.

## Route wiring (claimed APIs)

| Route | Domain error type(s) | Client path | Fallback when empty |
| --- | --- | --- | --- |
| `api.assignments.create` | `AssignmentPromptAttachmentError`, `FreeClassroomAssignmentQuotaError` | `safeDomainErrorTextForClientResponse` | Upload / plan copy |
| `api.collab.$id.submit` | `GroupSubmitError` | same | Submit retry copy |
| `api.domain.thesis-prompt-save` | `SavedPromptError` | same | Prompt save copy |
| `api.domain.daily-pages-prompt-save` | `SavedPromptError` | same | Prompt save copy |
| `api.domain.lesson-planner.uploads` | `SourceDocumentError` | same (via `bad()`) | Document read copy |

Unexpected failures on assignment create, collab submit, and lesson-planner uploads continue to use `safeErrorTextForClientResponse` with stable strings. Thesis/daily-pages unexpected paths already returned fixed `GENERIC_ERROR` (no raw leak).

**Scope note:** `app.*` loaders/actions still expose `error.message` in several places (documented, out of scope for #8y). No `error.message` remains under `app/routes/api.*` on this head.

## Test quality

- **Unit:** `server-error-request-context.server.test.ts` — validation copy passthrough, canary redaction, empty-message fallback.
- **Route canaries:** Each touched API route has at least one test injecting `token=SECRET-TOKEN` and/or `teacher@school.edu`, plus unexpected-error tests on routes that had them before.
- **Gap (non-blocking):** `api.assignments.create` has no dedicated route test for `AssignmentPromptAttachmentError` redaction (quota and unexpected paths are covered; helper behavior is unit-tested).

**Verification run (reviewer):** 90 tests across changed helper, five API route test files, and dev-panel guard tests — all pass (`/home/ubuntu/.bun/bin/bun test` on listed paths).

## Kevin / #608

**Untouched.** PR #806 diff vs `main` does not modify any file from [#608](https://github.com/The-Connell-School/yawp/pull/608) (platform-enhancements / Kevin assignment-type v2 work). No overlap with `assignment-creation-sheet`, `app.assignment-types.$id/v2/*`, guided tours, or related e2e.

## Additional diff (scope)

Five dev-panel test files adjust production fixtures to set `YAWP_ENVIRONMENT=production` explicitly (#802 / #804 alignment) and add a dual-case runtime gate test. Production runtime source already treats `yawp === 'production'` as disabled; behavior for unset `YAWP_ENVIRONMENT` on App Runner is unchanged. This is orthogonal to API redaction but low risk and tests pass.

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | Info | Dev-panel test alignment bundled in #806; consider splitting in future if reviewers want single-concern PRs. |
| F2 | Low | No route-level canary for `AssignmentPromptAttachmentError`; rely on helper unit tests. |
| F3 | Info | `app.*` routes still return raw `error.message` — tracked as follow-up, not a blocker for this API-focused PR. |

## Decision

**SHIP** — Helper is sound relative to the existing redaction stack, teacher-facing domain errors remain usable, claimed API routes are wired, canary tests demonstrate non-leakage for standard secret patterns, and Kevin/#608 work is not affected. Merge #806 on its own timeline; this review does not authorize squash-merge.
