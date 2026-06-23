# Plan

1. Add retryable Anthropic outage classification and server-local circuit cache.
2. Route Anthropic outages through OpenAI fallback with `gpt-4o-mini` default.
3. Add route-level retry signals for tutor and grading requests.
4. Show `Retrying...` UI state while retrying with fallback.
5. Verify with focused tests, typecheck, build, SDLC review, and narrated QA evidence.
