# Anthropic Outage Fallback Design

## Problem

Yawp depends on Anthropic for tutor and grading assistant responses. During a
major Anthropic API outage, students and teachers currently see a visible tutor
failure such as a 529 `overloaded_error` or a generic 500 response. The app
already has OpenAI credentials and a basic OpenAI path, but it only supports the
old `gpt-4-turbo-preview` chat-completions model and does not protect live
student/teacher workflows when Anthropic is temporarily overloaded.

Anthropic documents 529 `overloaded_error` as a temporary API overload, and
also treats 500 and 504 as retryable service-side failures. The immediate need
is not a full model-platform migration. The immediate need is a server-side
outage circuit breaker that stops hammering Anthropic during an outage, routes
active tutor and grading work to a cheap OpenAI fallback model, and quietly
returns to Anthropic after the outage clears.

## Goals

- For tutor and grading assistant calls, automatically fall back to OpenAI when
  Anthropic returns 529, 500, or 504.
- Default fallback model: `gpt-4o-mini`, configurable via server env.
- Cache the Anthropic outage state on the server for 5 minutes after a retryable
  Anthropic failure.
- While the cache is active, skip Anthropic and send affected tutor/grading
  calls directly to OpenAI fallback.
- After the cache expires, let the next normal request probe Anthropic again.
  If Anthropic succeeds, close the circuit. If it fails again with a retryable
  error, reopen the cache for another 5 minutes.
- Do not expose provider names or "fallback" language to users. The visible copy
  should be only "Retrying..." while the app resubmits the request through the
  fallback path.
- Preserve existing `AI_MODEL` behavior and the existing successful tutor and
  grading flows.
- Log primary Anthropic failures and fallback OpenAI attempts in `LlmLog` with
  enough metadata to benchmark later.

## Non-goals

- No self-hosted model in this change. Self-hosting remains a long-term option
  once usage volume justifies the operational cost.
- No benchmark harness in this change. Benchmarking is the immediate follow-up.
- No full model-provider registry or admin UI.
- No user-facing "OpenAI", "Anthropic", "fallback", or outage wording.
- No cross-process distributed outage cache in v1. The first implementation is
  a per-server-process cache. If production runs multiple app instances, each
  instance may independently trip and recover. A shared Redis/database-backed
  circuit can be added later if volume or topology requires it.
- No PDF extraction fallback in this first pass. `api.domain.assignment-pdf-extract`
  sends PDF document input directly to Anthropic and needs a separate file-input
  implementation for OpenAI. The first pass covers the shared
  `getLLMCompletion` path used by tutor and grading.

## Architecture

Add a focused LLM outage/circuit module under `services/web-app/app/utils`.
The module holds Anthropic health state in process memory using an expiry
timestamp. The state is intentionally small:

- `isOpen(now)`: whether Anthropic should be skipped right now.
- `markOpen(reason, now)`: open the circuit until `now + ttlMs`.
- `markClosed()`: close the circuit after a successful Anthropic probe.
- `resetForTest()`: test-only reset hook.

The default TTL is 5 minutes. The TTL and fallback model are configurable:

- `ANTHROPIC_OUTAGE_FALLBACK_TTL_MS`, default `300000`.
- `OPENAI_FALLBACK_MODEL`, default `gpt-4o-mini`.
- `ANTHROPIC_OUTAGE_FALLBACK_ENABLED`, default enabled when OpenAI is configured.

`getLLMCompletion` remains the central provider abstraction. It should:

1. Detect Claude models as it does now.
2. If the Anthropic circuit is open, route the request to the OpenAI fallback
   model instead of Anthropic.
3. If the circuit is closed, try Anthropic first.
4. If Anthropic throws a retryable outage error, log that failure, open the
   circuit for 5 minutes, then use the OpenAI fallback path.
5. If Anthropic succeeds after a probe, close the circuit.
6. If OpenAI fallback is unavailable or fails, surface the existing route-level
   error so the app still fails visibly rather than silently losing work.

OpenAI support should be expanded from the current `gpt-4-turbo-preview` allow
list to include `gpt-4o-mini` and any configured OpenAI fallback model. The
OpenAI branch must support the tutor's `read_student_document` tool. Anthropic
tools should be translated to OpenAI Chat Completions function tools:

- Anthropic `input_schema` becomes OpenAI function `parameters`.
- OpenAI `tool_calls` are resolved through the existing `handleToolCall`
  callback.
- Tool results are appended as `tool` messages with the matching
  `tool_call_id`.
- The loop uses the existing `maxToolRounds` guard.

## User-Visible Retry State

A normal `fetch` request cannot receive a mid-request progress update when the
server catches an Anthropic failure and starts an OpenAI retry. To keep the UI
copy accurate without adding streaming, tutor and grading routes should use a
small 202 retry handshake:

1. The first request starts normally with the existing loading UI.
2. If the server sees that the Anthropic circuit is already open, or it catches
   a retryable Anthropic error before persisting anything, it returns:

   ```json
   { "retrying": true }
   ```

   with HTTP 202.

3. The client keeps the optimistic/loading state active, switches the visible
   copy to "Retrying...", and immediately resubmits the same form with
   `llmRetry=fallback`.
4. The server handles `llmRetry=fallback` by using the OpenAI fallback model
   directly.
5. The successful retry persists exactly one user/assistant tutor message pair,
   or exactly one grading assistant result.

For non-UI callers, `getLLMCompletion` can still perform the fallback
internally without the 202 handshake.

## Tutor Flow

Affected files:

- `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- `services/web-app/app/routes/app_.documents_.$id/tutor/tutor.tsx`
- `services/web-app/app/routes/app_.documents_.$id/tutor/loading.tsx`

Behavior:

- The route calls the LLM with client-retry signaling enabled.
- If it returns HTTP 202, the client keeps the optimistic student message and
  loading bubble visible.
- `Loading` gains an optional label prop and renders `Retrying...` next to the
  existing animated dots only for retry state.
- The client resubmits with `llmRetry=fallback`.
- The final response updates `cms` the same way the current flow does.
- The existing red tutor error remains only for failures after fallback also
  fails, validation errors, or non-retryable errors.

## Grading Assistant Flow

Affected files:

- `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- `services/web-app/app/routes/app_.documents_.$id/_components/teacher-grading-panel.tsx`
- `services/web-app/app/routes/app.my-classes.$classId/grading-sheet.tsx`
- `services/web-app/app/routes/app.my-classes.$classId_.assignments.$assignmentId/route.tsx`

Behavior:

- The route uses the same LLM fallback/circuit behavior.
- If a retryable Anthropic failure is detected before final persistence, the
  route may return HTTP 202 with `{ "retrying": true }`.
- Single-document grading controls switch button copy from `Grading...` to
  `Retrying...` while the automatic retry is happening.
- Bulk grading adds a `retrying` row state, shown as `Retrying...` with the same
  spinner treatment used by `Grading...`.
- If fallback succeeds, the teacher sees the same final suggestions as today.
- If fallback fails, the existing error handling remains visible.

## Logging And Observability

`LlmLog` already records model, provider, prompt, messages, response, error,
tokens, duration, and metadata. No schema migration is needed for v1.

Add metadata fields to relevant calls:

- `primaryModel`
- `fallbackModel`
- `fallbackReason`
- `fallbackTriggered`
- `anthropicCircuitOpen`
- `retryableStatus`
- existing feature metadata such as `feature: "grading"` should be preserved.

This gives the follow-up benchmark work enough production evidence to compare
fallback quality and latency.

## Error Classification

Retryable Anthropic outage errors:

- `status === 529`
- `status === 500`
- `status === 504`
- error payload or message containing `overloaded_error`

Do not fallback for:

- 400 validation errors
- 401/403 auth/configuration problems
- 404 model errors
- 429 account rate-limit errors unless a separate decision is made later
- malformed model output after a successful provider response

Malformed grading JSON remains handled by existing repair logic and existing
502 responses. The provider fallback is for provider availability, not for
model-quality repair.

## Testing Strategy

Follow TDD.

Backend unit tests:

- Retryable Anthropic error detection identifies 529, 500, 504, and
  `overloaded_error`.
- Non-retryable Anthropic errors do not open the circuit.
- The outage cache opens for 5 minutes and expires after the TTL.
- When the circuit is open, Claude requests use OpenAI fallback without calling
  Anthropic.
- When the circuit is closed and Anthropic succeeds, the circuit remains closed.
- When Anthropic fails with 529 and OpenAI succeeds, both attempts are logged.
- OpenAI tool-call loop resolves `read_student_document` and returns final text.

Route tests:

- Tutor route returns 202 retry signal without writing messages when the LLM
  layer signals fallback retry.
- Tutor route with `llmRetry=fallback` persists one user and one assistant
  message.
- Grading route returns 202 retry signal without updating submission data when
  the LLM layer signals fallback retry.
- Grading route with `llmRetry=fallback` persists the same fields as the
  existing successful path.

E2E/UI tests:

- Tutor chat: mock the tutor endpoint to return 202, then success. Verify the
  optimistic student message stays visible, the loading bubble shows
  `Retrying...`, and the final tutor message appears without a red error.
- Grading assistant: mock the grading endpoint to return 202, then success.
  Verify button copy changes to `Retrying...` and final suggestions populate.
- Bulk grading: mock one selected submission to return 202, then success.
  Verify the row shows `Retrying...` before completing.

## Rollout

- Default enabled if OpenAI credentials exist, because this is an outage
  resilience change.
- Keep fallback model configurable so production can switch from `gpt-4o-mini`
  to a better cheap model after benchmarks.
- Deploy with logging only; no user-facing announcement.
- Monitor `LlmLog` for fallback frequency, OpenAI latency, OpenAI errors, and
  grading malformed-output rates.

## Follow-Up

1. Build a benchmark harness from real tutor and grading `LlmLog` samples.
2. Compare Claude baseline against `gpt-4o-mini`, `gpt-4.1-mini`, and current
   best cheap OpenAI mini models.
3. Decide whether to keep `gpt-4o-mini` as the default fallback or upgrade the
   fallback default.
4. Revisit self-hosted models only when API volume and reliability economics
   justify the infrastructure.

## Sources

- Anthropic API errors: https://platform.claude.com/docs/en/api/errors
- Anthropic streaming error events: https://platform.claude.com/docs/en/build-with-claude/streaming
- OpenAI GPT-4o mini model: https://developers.openai.com/api/docs/models/gpt-4o-mini
- OpenAI model guidance: https://developers.openai.com/api/docs/models
