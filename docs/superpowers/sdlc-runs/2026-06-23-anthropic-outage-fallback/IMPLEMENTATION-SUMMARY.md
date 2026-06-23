# Implementation Summary

Hotfix scope: keep tutor and grading interactions working during retryable Anthropic outages without exposing provider details to users.

Implemented:

- Added server-local Anthropic outage circuit with a five-minute TTL.
- Classified Anthropic `500`, `504`, `529`, and `overloaded_error` failures as retryable outage signals.
- Routed Claude requests to OpenAI fallback, defaulting to `gpt-4o-mini`, while preserving tool-call handling.
- Added route-level retry handshakes for tutor responses and grading suggestions so the UI can show `Retrying...` before retrying with fallback.
- Added retry UI handling for tutor chat, document grading panel, grading sheet, and batch assignment grading.
- Hardened OpenAI client initialization so fallback only requires `OPENAI_API_KEY`; `OPENAI_ORG_ID` is optional.

Rollback:

- Revert commits from `2dd1369` through `75bdb46` on branch `codex/plan-model-failover-benchmarks`.
- Runtime kill switch: set `ANTHROPIC_OUTAGE_FALLBACK_ENABLED=false` to disable Anthropic outage fallback while leaving existing Anthropic behavior intact.

Operational notes:

- Cache is process-local. It reduces repeated failing Anthropic calls per running server process for five minutes. Multi-process deployments will independently learn outage state.
- The user-facing language is intentionally limited to `Retrying...`; provider/fallback details stay server-side.
