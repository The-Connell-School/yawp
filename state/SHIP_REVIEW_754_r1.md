# Independent Ship Review — PR #754 (r1)

**Verdict: SHIP**

**Head SHA reviewed:** `c04458cf7c6224ab04db6034e8fef781d0f23c14`  
**Base reviewed against:** `main` @ `2b633fd7a5d8b0f641fddbb6150e87092b64fd69`  
**PR:** https://github.com/The-Connell-School/yawp/pull/754 — *fix: redact raw error.message from API JSON bodies (#8d)*

## Scope summary

Quality sweep **#8d** removes raw exception text from client-facing JSON on catch-all failure paths in domain/API handlers (complement to #752 log redaction). Fifteen files, ~120 lines:

- New `safeErrorTextForClientResponse(_error, fallback)` in `server-error-request-context.server.ts` — always returns stable fallback copy, never forwards `error.message`.
- Catch-all route/domain handlers wired to the helper: grading-assistant benchmark + scratch test routes, grading workspace `runSuite`, tutor LLM failures.
- Nested benchmark/evaluation execution payloads use fixed strings (`Benchmark execution failed.`, `This evaluation case could not run.`) instead of thrown message text.
- Journal `failureReason` on collab submit, solo submit, and model document snapshot rejections use stable codes (`collab_submit_failed`, `submit_transaction_failed`, `snapshot_transaction_failed`) instead of exception text (DB field hygiene aligned with client JSON goal).

Intentional leave-asides documented in the PR (typed domain errors with product copy, unified signon/Kevin routes, loader-only surfaces) were not expanded in this diff.

## Security / hygiene

Reviewed every hunk in the diff for catch-all paths that previously did `error instanceof Error ? error.message : …` or appended raw messages to JSON.

| Area | Client JSON leak after change? |
|------|--------------------------------|
| Tutor route 500 | No — `{ error: LLM_FAILED }` only; removed `Error: ${message}` suffix. |
| Grading-assistant benchmark / scratch catch | No — `message` from `safeErrorTextForClientResponse`. |
| `runSuite` catch in grading workspace | No — same helper with fixed fallback. |
| Per-case suite execution catch | No — fixed `evidence` / evaluator `message` strings. |
| Submit / snapshot / collab journal reject | No raw message in JSON from these edits; submit still `throw error` on non-conflict (framework/error boundary — pre-existing). |

No Prisma query text, stack traces, or API key fragments remain in the **touched** catch-all JSON shapes. Typed errors (e.g. `SubmitDocumentConflictError` 409 copy) unchanged.

## Tests

Adequate for the sensitive paths this PR targets:

- **Unit:** `safeErrorTextForClientResponse` rejects Prisma-style / `SECRET-TOKEN` text.
- **Tutor route:** LLM rejection with `SECRET-KEY` / Anthropic 401 string — asserts stable product copy and serialized body excludes secrets.
- **`runSuite` action:** mocked suite throw with Prisma-style + `SECRET-TOKEN` — asserts 500, stable message, no verbatim leak in JSON.
- **Suite server:** execution throw — asserts stable evidence and `JSON.stringify(result)` excludes thrown message.

**Gap (non-blocking):** `api.domain.grading-assistant-benchmark` and `api.domain.grading-assistant-test` routes have no new SECRET-TOKEN integration cases; behavior is a thin wrapper around the tested helper. Acceptable for r1.

**Local verification (this review):** `bun test` on the four primary touched test files — 46 tests, all pass when run file-by-file; new redaction cases pass.

## Risks / intentional leave-asides

- **Admin/debug UX:** Benchmark and evaluation admins lose verbatim provider/Prisma errors in JSON; must use server logs (#752) — intentional.
- **Tutor 500 body shape:** Drops trailing `Error: …` fragment; clients should rely on stable `LLM_FAILED` string only — matches existing product copy constant.
- **Journal `failureReason`:** Operators lose exception text in DB for failed submits; improves hygiene if reasons are ever surfaced — aligns with PR intent.
- **Out of scope (still may leak elsewhere):** Unified signon, Kevin-track routes, and other API surfaces called out in PR body — not regressions from this diff but remain future sweep work.

## CI note

**Do not merge PR #754 from this review alone.** Platform merges after **SHIP + green CI on the exact head**.

At review time, head `c04458cf7…` had **ʦ TypeScript: fail** (GitHub Actions run 40183922708): unsafe cast at `route.test.ts` line 1038 (`DataWithResponseInit<{ success: boolean }>` → `{ data: { message: string } }`). Other checks were still pending. Author should fix the cast (e.g. via `unknown`) and re-run CI; redaction logic itself does not require product code changes for that fix.

Reviewer did not merge #754.
