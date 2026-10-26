# Independent Ship Review — PR #774 (r1)

| Field | Value |
| --- | --- |
| **Verdict** | **SHIP** |
| **Reviewed head SHA** | `2d3ac6cca48117a044a8215e2b99c7c116dff0ad` |
| **Application PR** | https://github.com/The-Connell-School/yawp/pull/774 |
| **Branch** | `cursor/safe-error-logging-8j-1ae9` |
| **Reviewer** | Independent Ship Review r1 (quality #8j) |
| **Review date** | 2026-10-26 |

## Freshness

- GitHub `headRefOid` matches the expected SHA exactly.
- Merge-base with `origin/main` is `bbd7ebf0408e124239e596e781b12fbf683fcf1a` (current `main` tip). The PR is **two commits ahead** of `main`, not behind; no freshness rebase is required for this review.

## CI (snapshot)

At review time, required checks had **0 failures**; most suites were still **pending** (TypeScript, E2E shards, migration integration). Changed-paths and preview-policy had succeeded. This review does not gate on full green CI.

## Blockers

None.

## Scope check

| Area | Result |
| --- | --- |
| User-facing UI / copy | No changes to rendered strings or Yawp! product copy |
| Feature flags / Terraform / Kevin | Not touched |
| Secrets in diff | None |
| Behavioral change beyond logging | Failed LLM calls persist `describeProviderError(err)` in `LlmLog.error` instead of raw `err.message`; thrown errors and success paths unchanged per PR notes |

**Files changed (6):** `error-boundary.tsx`, `dev-panel-shell-boundary.tsx`, `misc.tsx`, `misc.test.ts`, `getLLMCompletion.ts`, `getLLMCompletion.test.ts`.

## Correctness — redaction approach

1. **Client / boundary `console.error`:** Route error boundary, dev-panel `componentDidCatch`, and `getErrorMessage` unknown-shape fallback now log structured payloads via `buildSafeErrorScalarsForLog` (`errorName` + allow-listed `code` only). Raw `Error` objects and message bodies are no longer passed to the console on these paths.
2. **`buildSafeErrorScalarsForLog`:** Non-`Error` values → `{ errorName: 'UnknownError' }`; codes must match `^[A-Za-z0-9_]+$` (message-like codes dropped). Aligns with existing `error-log-scalars.test.ts` coverage (not modified in this PR).
3. **`LlmLog` failures:** Anthropic and OpenAI catch blocks use existing server helper `describeProviderError(err)` (name · provider type · HTTP status; never message body). Appropriate for persisted operator logs.
4. **Residual exposure (accepted / deferred):** `getErrorMessage` still returns `error.message` to UI callers when the value is an `Error` (logging-only scope). Dev panel still logs `info.componentStack` (React component stack only; unchanged intent). Scripts/e2e one-offs deferred to #8k per application PR.

No raw `Error` instances remain on the three client logging paths or in the two `logLlmCall` failure `error` fields introduced by this diff.

## Tests (spot-check)

Local run on reviewed tree (same three files as application PR):

```text
bun test app/utils/error-log-scalars.test.ts app/utils/misc.test.ts app/utils/getLLMCompletion/getLLMCompletion.test.ts
26 pass, 0 fail
```

New coverage: `misc.test.ts` (unknown error shape logging); extended `getLLMCompletion.test.ts` (provider failure with token/email-like message must not appear in `llmLogCreate` payload).

## Summary

Small, focused logging hardening for Yawp! quality sweep #8j: client boundaries stop emitting full errors to the browser console, and failed provider calls stop persisting prompt-echo-prone messages into `LlmLog.error`. Reuses established helpers, stays out of UI/flags/infra, and is backed by targeted tests. **Recommend merge of application PR #774** once CI completes satisfactorily.
