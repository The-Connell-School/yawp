# Anthropic Outage Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship automatic OpenAI fallback for retryable Anthropic outages in tutor and grading assistant flows, with a 5-minute server-side outage cache and user-facing `Retrying...` state.

**Architecture:** Add a small Anthropic outage circuit breaker in server memory, expand `getLLMCompletion` to route Claude calls to `gpt-4o-mini` during retryable Anthropic failures, and use a 202 retry handshake in tutor/grading routes so the UI can accurately show `Retrying...`. Preserve existing successful persistence behavior and existing `AI_MODEL` defaults.

**Tech Stack:** React Router actions/loaders, Bun tests, Playwright e2e, Anthropic SDK, OpenAI SDK Chat Completions, Prisma `LlmLog`, process-level memory via `@epic-web/remember`.

---

## File Structure

- Create `services/web-app/app/utils/getLLMCompletion/anthropic-outage-cache.server.ts`
  - Owns process-local Anthropic outage state and 5-minute TTL.
- Create `services/web-app/app/utils/getLLMCompletion/anthropic-outage-cache.server.test.ts`
  - Unit tests for open/closed/expired state.
- Create `services/web-app/app/utils/getLLMCompletion/llm-provider-errors.server.ts`
  - Classifies retryable Anthropic errors and defines `LlmFallbackRetrySignal`.
- Create `services/web-app/app/utils/getLLMCompletion/llm-provider-errors.server.test.ts`
  - Unit tests for 529/500/504/`overloaded_error`.
- Modify `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts`
  - Add OpenAI fallback, OpenAI tool loop, outage cache integration, and retry signaling option.
- Create `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.test.ts`
  - Unit tests for fallback routing, skipped Anthropic calls, logging, and OpenAI tool calls.
- Modify `services/web-app/app/routes/api.domain.tutor-response/route.ts`
  - Add POST `llmRetry=fallback` handling and 202 retry signal behavior.
- Modify `services/web-app/app/routes/api.domain.tutor-response/route.test.ts`
  - Add route tests for retry signal and retry persistence.
- Modify `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
  - Add POST `llmRetry=fallback` handling and 202 retry signal behavior.
- Modify `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`
  - Add route tests for retry signal and retry persistence.
- Modify `services/web-app/app/routes/app_.documents_.$id/tutor/loading.tsx`
  - Add optional retry label.
- Modify `services/web-app/app/routes/app_.documents_.$id/tutor/tutor.tsx`
  - Handle 202, set retrying state, resubmit with `llmRetry=fallback`.
- Modify `services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx`
  - Handle 202 retry and button copy.
- Modify `services/web-app/app/routes/app.my-classes.$classId/grading-sheet.tsx`
  - Handle 202 retry and button copy.
- Modify `services/web-app/app/routes/app.my-classes.$classId_.assignments.$assignmentId/route.tsx`
  - Handle 202 retry for bulk grading row status.
- Create or extend Playwright e2e tests under `services/web-app/e2e/tests/`
  - Cover visible tutor and grading retry states.

## Task 1: Add e2e coverage for visible retry states

**Files:**
- Create: `services/web-app/e2e/tests/anthropic-outage-retry-ui.spec.ts`

- [ ] **Step 1: Write the failing tutor retry e2e**

Add a Playwright test that logs in as a student, navigates to a seeded document with tutor chat, intercepts `/api/domain/tutor-response`, returns HTTP 202 with `{ retrying: true }` for the first call, then returns a valid `cms` payload for the retry call. Assert:

- the optimistic student message remains visible
- `Retrying...` appears in the tutor loading bubble
- no red tutor error is shown
- the final tutor message appears

- [ ] **Step 2: Write the failing grading retry e2e**

In the same file or an existing grading e2e, log in as a teacher, navigate to a grading assistant surface, intercept `/api/domain/grade-essay-ai`, return HTTP 202 with `{ retrying: true }` for the first call, then return the existing successful grading payload shape. Assert:

- the button copy changes to `Retrying...`
- the final grading suggestions populate
- no red error is shown

- [ ] **Step 3: Run e2e tests and verify they fail**

Run:

```bash
cd services/web-app
bun run test:e2e:prepare
playwright test --project=chromium e2e/tests/anthropic-outage-retry-ui.spec.ts
```

Expected: tests fail because the UI does not yet handle HTTP 202 retry payloads.

- [ ] **Step 4: Commit the failing e2e tests**

```bash
git add services/web-app/e2e/tests/anthropic-outage-retry-ui.spec.ts
git commit -m "test: cover Anthropic outage retry UI"
```

## Task 2: Add Anthropic outage cache and error classification

**Files:**
- Create: `services/web-app/app/utils/getLLMCompletion/anthropic-outage-cache.server.ts`
- Create: `services/web-app/app/utils/getLLMCompletion/anthropic-outage-cache.server.test.ts`
- Create: `services/web-app/app/utils/getLLMCompletion/llm-provider-errors.server.ts`
- Create: `services/web-app/app/utils/getLLMCompletion/llm-provider-errors.server.test.ts`

- [ ] **Step 1: Write failing cache tests**

Test these behaviors:

```ts
expect(isAnthropicOutageCircuitOpen(now)).toBe(false);
markAnthropicOutageOpen({ reason: '529', now, ttlMs: 300_000 });
expect(isAnthropicOutageCircuitOpen(now + 299_999)).toBe(true);
expect(isAnthropicOutageCircuitOpen(now + 300_001)).toBe(false);
```

- [ ] **Step 2: Write failing error-classification tests**

Test:

```ts
expect(isRetryableAnthropicOutageError({ status: 529 })).toBe(true);
expect(isRetryableAnthropicOutageError({ status: 500 })).toBe(true);
expect(isRetryableAnthropicOutageError({ status: 504 })).toBe(true);
expect(
  isRetryableAnthropicOutageError({
    error: { type: 'overloaded_error', message: 'Overloaded' },
  })
).toBe(true);
expect(isRetryableAnthropicOutageError({ status: 429 })).toBe(false);
expect(isRetryableAnthropicOutageError({ status: 401 })).toBe(false);
```

- [ ] **Step 3: Run unit tests and verify they fail**

Run:

```bash
cd services/web-app
bun run test -- app/utils/getLLMCompletion/anthropic-outage-cache.server.test.ts app/utils/getLLMCompletion/llm-provider-errors.server.test.ts
```

- [ ] **Step 4: Implement the cache and classifier**

Use `remember` for the process-local cache and default TTL:

```ts
import { remember } from '@epic-web/remember';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

type AnthropicOutageState = {
  openUntilMs: number;
  reason: string | null;
  openedAtMs: number | null;
};

const state = remember('anthropic-outage-circuit', (): AnthropicOutageState => ({
  openUntilMs: 0,
  reason: null,
  openedAtMs: null,
}));

export function getAnthropicOutageTtlMs() {
  const raw = Number(process.env.ANTHROPIC_OUTAGE_FALLBACK_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

export function isAnthropicOutageCircuitOpen(now = Date.now()) {
  return state.openUntilMs > now;
}

export function markAnthropicOutageOpen({
  reason,
  now = Date.now(),
  ttlMs = getAnthropicOutageTtlMs(),
}: {
  reason: string;
  now?: number;
  ttlMs?: number;
}) {
  state.openedAtMs = now;
  state.openUntilMs = now + ttlMs;
  state.reason = reason;
}

export function markAnthropicOutageClosed() {
  state.openedAtMs = null;
  state.openUntilMs = 0;
  state.reason = null;
}

export function resetAnthropicOutageForTest() {
  markAnthropicOutageClosed();
}
```

Implement `LlmFallbackRetrySignal` and `isRetryableAnthropicOutageError` in the error module.

- [ ] **Step 5: Run tests and verify they pass**

Run the same Bun test command.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/utils/getLLMCompletion/anthropic-outage-cache.server.ts services/web-app/app/utils/getLLMCompletion/anthropic-outage-cache.server.test.ts services/web-app/app/utils/getLLMCompletion/llm-provider-errors.server.ts services/web-app/app/utils/getLLMCompletion/llm-provider-errors.server.test.ts
git commit -m "feat: add Anthropic outage circuit"
```

## Task 3: Expand OpenAI support and fallback routing

**Files:**
- Modify: `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts`
- Create: `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.test.ts`

- [ ] **Step 1: Write failing fallback tests**

Mock Anthropic, OpenAI, and Prisma. Cover:

- Anthropic 529 opens the circuit and retries `gpt-4o-mini`.
- Circuit-open Claude request skips Anthropic.
- Non-retryable Anthropic error does not call OpenAI.
- OpenAI fallback supports the tutor's `read_student_document` tool loop.
- Logs include primary error and fallback success metadata.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd services/web-app
bun run test -- app/utils/getLLMCompletion/getLLMCompletion.test.ts
```

- [ ] **Step 3: Implement OpenAI model selection**

Add helpers:

```ts
function getOpenAiFallbackModel() {
  return process.env.OPENAI_FALLBACK_MODEL?.trim() || 'gpt-4o-mini';
}

function isOpenAiTextModel(model: string) {
  return model.startsWith('gpt-') || model.startsWith('o');
}

function isFallbackEnabled() {
  return process.env.ANTHROPIC_OUTAGE_FALLBACK_ENABLED !== 'false';
}
```

- [ ] **Step 4: Implement fallback routing**

When `params.model.includes('claude')`:

- If circuit is open, use OpenAI fallback.
- Else try Anthropic.
- On retryable Anthropic outage error, log the Anthropic error, open the circuit,
  and either signal HTTP retry mode or internally run OpenAI fallback.
- On successful Anthropic probe, close the circuit.

- [ ] **Step 5: Implement OpenAI tool loop**

Translate Anthropic-style tools into OpenAI function tools and resolve
`message.tool_calls` with `params.handleToolCall`.

- [ ] **Step 6: Run focused tests**

```bash
cd services/web-app
bun run test -- app/utils/getLLMCompletion/
```

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/utils/getLLMCompletion
git commit -m "feat: fall back to OpenAI during Anthropic outages"
```

## Task 4: Add tutor route retry handshake

**Files:**
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests:

- When mocked `getLLMCompletion` throws `LlmFallbackRetrySignal`, action returns
  HTTP 202 and does not call `assignmentModuleSession.update`.
- When request includes `llmRetry=fallback`, action passes fallback-forcing
  options to `getLLMCompletion` and persists exactly one user message and one
  assistant message.

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd services/web-app
bun run test -- app/routes/api.domain.tutor-response/route.test.ts
```

- [ ] **Step 3: Implement route changes**

Extend the form schema with:

```ts
llmRetry: z.enum(['fallback']).optional()
```

Catch `LlmFallbackRetrySignal`:

```ts
return dataResponse({ retrying: true }, { status: 202 });
```

Pass retry options into `getLLMCompletion` so `llmRetry=fallback` bypasses
Anthropic.

- [ ] **Step 4: Run tests and verify they pass**

Run the same route test command.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.tutor-response/route.ts services/web-app/app/routes/api.domain.tutor-response/route.test.ts
git commit -m "feat: add tutor fallback retry handshake"
```

## Task 5: Add tutor UI retry state

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/tutor/loading.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/tutor/tutor.tsx`

- [ ] **Step 1: Update loading bubble**

Change `Loading` to accept:

```ts
type Props = {
  label?: string;
};
```

Render the label as small muted text after the animated dots when provided.

- [ ] **Step 2: Implement 202 handling**

In `respond`, when the first response has status 202 and JSON `{ retrying:
true }`:

- set `isTutorRetrying` to true
- keep `optimisticMessage`
- resubmit the same form with `llmRetry=fallback`
- only show `tutorError` if the retry fails

Render:

```tsx
{isTutorResponding && optimisticMessage ? (
  <Loading label={isTutorRetrying ? 'Retrying...' : undefined} />
) : null}
```

- [ ] **Step 3: Run tutor e2e**

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/anthropic-outage-retry-ui.spec.ts -g tutor
```

- [ ] **Step 4: Commit**

```bash
git add 'services/web-app/app/routes/app_.documents_.$id/tutor/loading.tsx' 'services/web-app/app/routes/app_.documents_.$id/tutor/tutor.tsx'
git commit -m "feat: show retrying state in tutor chat"
```

## Task 6: Add grading route retry handshake

**Files:**
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests:

- LLM fallback signal returns HTTP 202 with `{ retrying: true }`.
- HTTP 202 path does not update `submission` and does not create
  `submissionGradingAssistantRun`.
- `llmRetry=fallback` still persists the existing successful grading payload.

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd services/web-app
bun run test -- app/routes/api.domain.grade-essay-ai/route.test.ts
```

- [ ] **Step 3: Implement route changes**

Accept `llmRetry=fallback` from form data. Pass retry signaling options into all
`getLLMCompletion` calls in this route. Catch `LlmFallbackRetrySignal` near the
outer action boundary and return HTTP 202.

- [ ] **Step 4: Run tests and verify they pass**

Run the same route test command.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.domain.grade-essay-ai/route.ts services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
git commit -m "feat: add grading fallback retry handshake"
```

## Task 7: Add grading UI retry states

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/grading-sheet.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId_.assignments.$assignmentId/route.tsx`

- [ ] **Step 1: Update single-document grading panels**

For each `aiFetcher` grading submitter:

- track `isAiRetrying`
- when fetcher data has `{ retrying: true }`, resubmit the same form with
  `llmRetry=fallback`
- render button text `Retrying...` while retrying
- clear retrying state on success or final failure

- [ ] **Step 2: Update bulk grading state**

Change:

```ts
type GradingState = 'grading' | 'retrying' | 'done' | 'error';
```

When direct `fetch('/api/domain/grade-essay-ai')` returns HTTP 202, set that
submission to `retrying`, add `llmRetry=fallback`, and retry once.

Render row status:

```tsx
{state === 'retrying' ? (
  <span className="flex items-center gap-1 text-sm text-blue-600">
    <Loader2 className="h-3 w-3 animate-spin" />
    Retrying...
  </span>
) : null}
```

- [ ] **Step 3: Run grading e2e**

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/anthropic-outage-retry-ui.spec.ts -g grading
```

- [ ] **Step 4: Commit**

```bash
git add 'services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx' 'services/web-app/app/routes/app.my-classes.$classId/grading-sheet.tsx' 'services/web-app/app/routes/app.my-classes.$classId_.assignments.$assignmentId/route.tsx'
git commit -m "feat: show retrying state for grading fallback"
```

## Task 8: Final verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused unit tests**

```bash
cd services/web-app
bun run test -- app/utils/getLLMCompletion/ app/routes/api.domain.tutor-response/route.test.ts app/routes/api.domain.grade-essay-ai/route.test.ts
```

- [ ] **Step 2: Run focused e2e**

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/anthropic-outage-retry-ui.spec.ts
```

- [ ] **Step 3: Run typecheck**

```bash
bun run web-app:typecheck
```

- [ ] **Step 4: Build**

```bash
bun run web-app:build
```

- [ ] **Step 5: Manual smoke**

Temporarily mock Anthropic 529 locally, send a tutor message, and verify:

- first request sets outage circuit
- tutor shows `Retrying...`
- assistant response appears from OpenAI fallback
- next tutor request skips Anthropic while TTL is active
- after TTL expiry, next request probes Anthropic

- [ ] **Step 6: Commit any verification-only fixes**

Commit fixes in small atomic commits as needed. Do not squash the task commits.

## Follow-up Plan

After fallback ships:

- Build benchmark fixtures from representative `LlmLog` tutor and grading calls.
- Compare Claude, `gpt-4o-mini`, `gpt-4.1-mini`, and a current cheap mini model.
- Add quality gates for grading JSON validity, rubric key coverage, score bounds,
  tutor no-essay-writing behavior, tone, latency, and malformed-output rate.
- Revisit self-hosting only when production volume makes the cost and operations
  worthwhile.
