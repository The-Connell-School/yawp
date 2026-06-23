# Risk

Risk tier: critical hotfix.

Primary risks:

- Provider fallback could generate subtly different tutor/grading output.
- Process-local cache does not coordinate across multiple server instances.
- OpenAI credentials must be present wherever fallback is expected.

Mitigations:

- Fallback is limited to retryable Anthropic outage statuses.
- The circuit expires after five minutes and retries Anthropic automatically.
- `ANTHROPIC_OUTAGE_FALLBACK_ENABLED=false` disables fallback if needed.
- Focused tests cover outage classification, circuit behavior, provider routing, tutor route/UI retry, grading route/UI retry, and OpenAI env configuration.
