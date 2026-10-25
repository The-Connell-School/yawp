# Independent Ship Review — PR #768 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/768 |
| Title | Quality sweep #8g: harden UI route error logging |
| Branch | `cursor/ui-route-safe-error-logging-1fb4` |
| Base | `main` @ `277746e1cb41f90982a8c2bcf8c60b3dfdb682af` |
| Reviewed head | `1eccf677426303ee4065b01ff57e4667ca37ba2c` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-25 |

## Verdict

**SHIP** on head `1eccf677426303ee4065b01ff57e4667ca37ba2c`.

## Freshness

GitHub `headRefOid` for PR #768 and local `origin/cursor/ui-route-safe-error-logging-1fb4` both resolve to `1eccf677426303ee4065b01ff57e4667ca37ba2c`. Merge-base with `main` is `277746e1…` (includes quality sweep #8f / #766). No freshness block.

## Scope (8 files, +84 / −9)

1. **Client scalar helper** (`error-log-scalars.ts`): new `buildSafeErrorScalarsForLog` returns `{ errorName, code? }` only — no `message`, `stack`, or raw `Error` serialization.
2. **Unit tests** (`error-log-scalars.test.ts`): generic errors, allow-listed `code`, rejection of message-like codes, non-`Error` values.
3. **Admin teacher-training routes** (training + module): video duration catch blocks log `teacher_training_video_duration_failed` with scalars instead of raw `error`.
4. **Submission view loader** (`app_.submissions_.$submissionId/route.tsx`): grading-config `.catch` uses `buildSafeErrorForLog(error)` inside a structured object instead of passing the raw `error` reference.
5. **Document editor UI** (`editor-bar.tsx`, `comments/comment.tsx`): comment create and DOM cleanup catches use scalar helper with stable event keys.
6. **`video.server.ts`**: JSDoc client example updated to match the safe logging pattern (no runtime change in this file on the PR diff).

No Terraform, secrets, unrelated UI redesign, or Kevin PR scope detected.

## Correctness & safety

### `buildSafeErrorScalarsForLog`

- Implements the intended browser-side contract: `instanceof Error` → `error.name` plus optional `code` when `code` matches `^[A-Za-z0-9_]+$`.
- Does not read or emit `error.message`, `error.stack`, or spread the error object into logs.
- Non-`Error` values collapse to `{ errorName: 'UnknownError' }`, avoiding stringified user/provider payloads in the console.
- Tests explicitly assert sensitive message content (`secret token=…`, email-like text) does not appear in `JSON.stringify` output.

### Call-site hardening

- **Teacher training video duration** (two admin routes): prior `console.error('…', error)` could print full exception text in DevTools; replacement matches the naming convention used elsewhere in the sweep.
- **Submission loader**: server-side `.catch` now uses the same `buildSafeErrorForLog` pipeline as other quality-sweep server logs (#766), replacing `{ assignmentTypeId, error }` where `error` was a live `Error` instance.
- **Document comment paths**: removes bare `console.error(error)` / `console.error('…', err)` patterns in UI code paths.

### Regressions considered

- **Under-logging**: Operators lose raw client exception messages in console — intentional tradeoff for this sweep; `errorName` / `code` remain for classification.
- **Over-redaction**: Not applicable; the change reduces leakage rather than adding new fields.
- **Server/client boundary**: Scalar helper lives in a non-`.server` module and is only imported from client components; submission loader correctly imports `buildSafeErrorForLog` from the server utility on the loader path only.

## Verification

Independent checks at reviewed head (`1eccf6774`):

```text
/home/ubuntu/.bun/bin/bun test app/utils/error-log-scalars.test.ts
# 4 pass, 0 fail
```

Manual diff audit of `main...1eccf677426303ee4065b01ff57e4667ca37ba2c`: all listed catch sites use `buildSafeErrorScalarsForLog` or `buildSafeErrorForLog`; no remaining raw `error`/`err` arguments in those hunks.

GitHub Actions for PR #768 were still running at review time (TypeScript / E2E pending); `Changed paths` had passed. Merge gate should remain CI green on the same head.

## Nits (non-blocking)

- `error.name` is logged as-is; a hostile or unusual custom `name` could theoretically carry text, but that is outside normal browser-thrown errors and mirrors limitations of name-only client logging.
- PR body’s deferred API-route items (`release-grades`, `lesson-planner`, `use-pm-tripwire`) are reasonable follow-ups; not required for this UI-focused batch.

## Recommendation

Approve and merge PR #768 when CI is green on head `1eccf677426303ee4065b01ff57e4667ca37ba2c`. This review does not modify application code on the feature branch.
