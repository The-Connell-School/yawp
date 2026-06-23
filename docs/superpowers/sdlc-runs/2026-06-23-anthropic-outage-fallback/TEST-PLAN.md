# Test Plan

Scope: automatic Anthropic outage fallback to OpenAI, route-level retry handshakes, tutor/grading retry UI states, and OpenAI fallback client availability.

## Focused Unit And Route Tests

- `bun test app/utils/getLLMCompletion/getLLMCompletion.test.ts app/utils/getLLMCompletion/anthropic-outage-cache.server.test.ts app/utils/getLLMCompletion/llm-provider-errors.server.test.ts app/utils/llm-retry-ui.test.ts app/routes/api.domain.grade-essay-ai/route.test.ts app/routes/api.domain.tutor-response/route.test.ts 'app/routes/app_.documents_.$id/tutor/tutor-response-retry.test.ts'`
- Evidence: `GREEN-focused-final.log`

## OpenAI Client Env Tests

- `bun test app/services/openai.test.ts`
- Evidence: `RED-openai-client-env.log`, `GREEN-openai-client-env-final-2.log`

## App Verification

- `bun run prisma:generate`
- `bun run web-app:typecheck`
- `bun run web-app:build`
- Evidence: `PRISMA-generate.log`, `TYPECHECK-final.log`, `TYPECHECK-openai-env-final-2.log`, `BUILD-final.log`, `BUILD-openai-env-final.log`

## Manual QA

- Record narrated video showing the fallback retry state and evidence from the passing backend/UI tests.
- Evidence will be recorded in `QA-VIDEO.md`.
