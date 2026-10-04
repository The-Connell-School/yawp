AI usage and admission decision log

- Purpose: append-only telemetry for AI requests — minimal attribution and outcomes only.
- Retention: keep 90 days. Do not store prompts, essays, or other bodies.
- Columns: `createdAt`, `route`, `feature`, `decision`, `membershipId?`, `organizationId?`, `classId?`, `ipHash?`, `requestId`, `units`, `inputTokens?`, `outputTokens?`, `latencyMs?`, `providerStatus?`.

Prune older than 90 days (Postgres):

```sql
DELETE FROM "AiUsageDecisionLog"
WHERE "createdAt" < NOW() - INTERVAL '90 days';
```

Do not schedule or automate this cleanup yet; run manually as needed.

