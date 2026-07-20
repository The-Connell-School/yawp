# Combined features migration runbook

This gate covers the Reporter, class-summary, and Writing Fundamentals changes.
All three organization rollout flags default off, so schema deployment and
product enablement are separate operations.

## Before deployment

1. Take a restorable database snapshot.
2. Run:

   ```sh
   psql "$DATABASE_URL" \
     -f packages/prisma/scripts/combined-feature-preflight.sql
   ```

3. Stop if the preflight reports duplicate active growth plans, invalid writing
   assignments, or cross-organization feature data. Resolve those rows
   explicitly; the migration intentionally does not pick a winner.

## Deploy and verify

```sh
cd packages/prisma
bunx prisma migrate deploy
cd ../..
psql "$DATABASE_URL" \
  -f packages/prisma/scripts/combined-feature-postcheck.sql
```

Keep `reporterEnabled`, `classInsightsEnabled`, and
`writingFundamentalsEnabled` off until application smoke tests and the
postcheck pass. Enable one feature at a time for a pilot organization and
verify its direct route, API denial while disabled, and independent toggle
persistence.

## Rollback

If migration or postcheck fails, keep all three flags off, halt application
rollout, and restore the pre-deployment snapshot. Do not manually drop the
tenant triggers or AI reservation table on a live database; application code
expects those controls whenever a feature is enabled.
