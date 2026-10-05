AI usage and admission decision log

- Purpose: append-only telemetry for AI requests — minimal attribution and outcomes only.
- Retention: keep 90 days. Do not store prompts, essays, or other bodies.
- Columns: `createdAt`, `route`, `feature`, `decision`, `membershipId?`, `organizationId?`, `classId?`, `ipHash?`, `requestId`, `units`, `inputTokens?`, `outputTokens?`, `latencyMs?`, `providerStatus?`.

- `ipHash`: HMAC-SHA256 (hex) of the client address from the shared `getClientIp` helper, keyed by `AI_USAGE_IP_HMAC_SECRET`. It is null when the secret is unset (the default) or no trustworthy client address exists. Raw IPs are never stored.
- Writes are fire-and-forget and swallow errors: a logging failure never changes a user-visible response.
- Rollback: revert the PR and redeploy. The table is additive and nothing else reads it; it can be left in place or dropped.
- Not yet logged: denials from the shared rate limiter (`enforceTutorLimits` etc.); only the reporter and per-route ALLOWED rows are written.

Prune older than 90 days (Postgres):

```sql
DELETE FROM "AiUsageDecisionLog"
WHERE "createdAt" < NOW() - INTERVAL '90 days';
```

Do not schedule or automate this cleanup yet; run manually as needed.

