# Independent Ship Review — Yawp! PR #837 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/837  
**Branch:** `cursor/quality-sweep-8ak-llmlog-console-f0f5`  
**Quality lane:** #8ak  
**Reviewer:** Independent Ship Review (r1)  
**Reviewed at (UTC):** 2026-10-26

## Verdict

**SHIP**

Merge when GitHub CI is green on the reviewed head. This review does not block on in-progress checks alone.

## Reviewed head

| Field | Value |
|-------|--------|
| **SHA** | `4c5ca5031d1a6e1b7fc3e4c1ead32a0ccc37226c` |
| **GitHub `headRefOid`** | Matches at review time (freshness OK) |
| **Base reviewed against** | `main` @ `4cbcfa31b374d22db6db3dc7e96c17f1c92d7052` |

PR branch is based on current `main` tip (no `main`-only commits ahead of head).

## Scope check (diff vs `origin/main`)

| File | Change |
|------|--------|
| `services/web-app/app/routes/api.ap-history.extract-document/route.ts` | LlmLog failure `error` field |
| `services/web-app/app/routes/api.domain.assignment-pdf-extract/route.ts` | Same |
| `services/web-app/app/routes/api.domain.rubric-extract/route.ts` | Same |
| `services/web-app/app/routes/api.domain.rubric-extract/route.test.ts` | Provider-safe failure assertion |
| `services/web-app/app/dev-panel/dev-panel-shell-boundary.test.tsx` | Dev-panel `console.error` redaction lock |

- **Nature:** Parallel PDF/rubric/AP-history extract handlers wrote `safeErrorTextForLog(error)` into `LlmLog.error`. That helper redacts tokens but still persists `Error.message`, which Anthropic often echoes back (including prompt fragments). Align extract routes with `getLLMCompletion` by using `describeProviderError(error)` instead.
- **Tests:** Rubric-extract route test for failed extraction; dev-panel boundary test for scalar-safe dev logging (same quality lane, no production UI change).
- **Out of scope / unchanged:** Terraform, migrations, secrets, Kevin/TeacherKev branches, unrelated refactors, extract prompt bodies, or user-facing UI layout.

## Findings

### `describeProviderError` is the correct helper

`describeProviderError` (in `llm-provider-errors.server.ts`) builds a string from error class name, provider error `type`, and HTTP status only. It **never** includes `Error.message`, by design (providers quote prompts in messages). `getLLMCompletion` already persists `error: describeProviderError(err)` on failure.

`safeErrorTextForLog` still returns a redacted **message** string for generic server logging; using it for `LlmLog.error` on LLM provider failures was the leak vector this PR fixes.

### Route wiring

All three extract routes swap import and `llmLog.create` failure path:

- `safeErrorTextForLog(error)` → `describeProviderError(error)`

No other behavioral changes in those files.

### Tests assert safe shape

| Test | Asserts |
|------|---------|
| `api.domain.rubric-extract` — persists provider-safe error text when extraction fails | `log.error === 'BadRequestError · invalid_request_error · HTTP 400'`; serialized log excludes `super-secret` and `teacher@school.edu` |
| `DevPanelShellBoundary` — logs scalar-safe dev-panel errors in development | `console.error('[dev-panel]', { error: { errorName: 'Error' } })`; call JSON excludes secret token and email |

**Local verification (reviewed head):**  
`bun test` on `route.test.ts` (rubric-extract) and `dev-panel-shell-boundary.test.tsx` — **5 pass, 0 fail**.

### Risk notes

- **Residual exposure:** `LlmLog.systemPrompt`, `messages`, and successful `response` on extract routes are unchanged; this PR only hardens the **failure** `error` column. That matches stated #8ak scope.
- **Operator signal:** Failure logs lose free-text provider messages; operators rely on name/type/status (same tradeoff as mainline `getLLMCompletion`).
- **Coverage gap (nit):** AP-history and assignment-pdf-extract routes have no new dedicated failure tests; rubric-extract test is representative of the same one-line swap.

## CI (head `4c5ca503`)

At review time:

- **Pass:** Changed paths, Preview tooling, preview-policy.
- **In progress / pending:** TypeScript, Prisma migrations, migration-integration, E2E shards, browser flows.
- **Fail:** None observed.

Re-check green on the same head before merge.

## Recommendation

Approve **#837** for merge after green CI on `4c5ca5031d1a6e1b7fc3e4c1ead32a0ccc37226c`. This review does not merge #837 and does not push to its branch.

**Final line: SHIP** on head `4c5ca5031d1a6e1b7fc3e4c1ead32a0ccc37226c`.
