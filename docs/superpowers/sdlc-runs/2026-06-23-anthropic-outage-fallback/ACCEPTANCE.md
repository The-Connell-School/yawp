# Acceptance

- Retryable Anthropic outages (`500`, `504`, `529`, `overloaded_error`) open a five-minute server-local outage circuit.
- While the circuit is open, tutor and grading LLM calls use OpenAI fallback by default.
- First user-facing request that hits an Anthropic outage returns a retry signal to the UI, then the UI resubmits with fallback.
- Users see only `Retrying...` during the fallback retry, not provider details.
- Existing non-retryable provider errors continue to surface normally.
