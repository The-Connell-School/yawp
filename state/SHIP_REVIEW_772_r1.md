# Independent Ship Review — PR #772 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/772 |
| Title | Quality sweep #8i: safe LLM persist + free-tier PostHog failure logs |
| Branch | `cursor/quality-sweep-8i-safe-logs-8aeb` |
| Base | `main` @ `bc632b379bd52c27936962880961dd18d2cef133` |
| Reviewed head | `67bd1e1f195db8c75a8b5ad71d1db0253e6b8f92` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-26 |

## Verdict

**SHIP** on head `67bd1e1f195db8c75a8b5ad71d1db0253e6b8f92`.

## Freshness

GitHub `headRefOid` for PR #772 and local `origin/cursor/quality-sweep-8i-safe-logs-8aeb` both resolve to `67bd1e1f195db8c75a8b5ad71d1db0253e6b8f92` (matches the review request). `origin/main` remains at `bc632b379bd52c27936962880961dd18d2cef133` (same base as when the PR opened). Merge-base with `main` is that tip. No freshness block.

## Scope (4 files, +130 / −11)

1. **`getLLMCompletion.ts`**: LLM audit-row persistence `catch` logs stable event `llm_call_persist_failed` with `error: buildSafeErrorForLog(err)` instead of `console.error('Failed to log LLM call:', err)`.
2. **`getLLMCompletion.test.ts`**: New test rejects `llmLogCreate`, asserts completion still succeeds, log payload uses redacted message metadata, and raw token/email substrings do not appear in serialized log args.
3. **`posthog-analytics.server.ts`**: Free-tier PostHog alias/capture async and sync failure handlers plus `runFreeTierAnalytics` enrichment catch attach `error: buildSafeErrorForLog(error)` (replacing event-only or bare event logs).
4. **`posthog-analytics.server.test.ts`**: Two tests cover alias async rejection and enrichment failure paths with token/email-bearing error messages; assert redaction and absence of secrets in serialized `console.error` args.

No Terraform, secrets, Kevin PR scope, feature flags, UI, or prod-data changes. Diff is limited to the quality sweep #8i safe-log hardening described in the PR body.

## Correctness & safety

### Call-site hardening

- Both modules import `buildSafeErrorForLog` from the shared server utility (quality sweep #8f / #766), consistent with prior #8g–#8h API-domain hardening.
- **LLM persist**: Failure to write `LlmLog` remains non-fatal—the outer completion path is unchanged; only log shape and event key change.
- **Free-tier PostHog**: Alias/capture/enrichment failures remain contained (no throw through analytics); behavior unchanged aside from richer, redacted error metadata on failure logs.
- Replacing raw `Error` serialization avoids log aggregators emitting full messages/stacks that may contain tokens or PII from provider payloads.

### Test coverage

- Tests inject `token=…` and email-like substrings into synthetic errors and assert `[redacted-token]` in safe message fields plus `JSON.stringify` of log args excludes raw secrets.
- PostHog async test exercises alias rejection path; capture rejection uses the same `buildSafeErrorForLog` wiring (existing tests already cover capture failure containment).

### Regressions considered

- **Log aggregation**: LLM persist event string changed from human-readable `Failed to log LLM call:` to `llm_call_persist_failed`; free-tier enrichment log gains a structured payload where previously only the event name was logged—aligned with sweep naming; operators may update ad-hoc filters (non-blocking nit).
- **Under-logging**: Raw exception text in these failure logs is intentionally omitted—aligned with #766 policy.

## Verification

Independent checks at reviewed head (`67bd1e1f`):

```text
/home/ubuntu/.bun/bin/bun test app/utils/getLLMCompletion/getLLMCompletion.test.ts app/domain/free-tier/posthog-analytics.server.test.ts
# 32 pass, 0 fail
```

Manual diff audit `main...67bd1e1f195db8c75a8b5ad71d1db0253e6b8f92`: only the four files above; no additional hunks.

GitHub Actions for PR #772 at review time: **Changed paths** and **Preview tooling** green; TypeScript, Prisma migrations, migration-integration, preview-deploy, and E2E/browser shards **pending** (0 failed). Merge after required CI is green on the same head.

## Nits (non-blocking)

- PostHog async redaction test asserts alias failure metadata only; a symmetric assertion on `free_tier_posthog_capture_failed` would mirror production wiring but is optional given shared helper usage.
- Remaining non–safe-log routes in the LLM/telemetry surface can continue in follow-up sweeps per PR deferred notes.

## Recommendation

Approve and merge PR #772 when CI is green on head `67bd1e1f195db8c75a8b5ad71d1db0253e6b8f92`. This review did not modify application code on the feature branch.
