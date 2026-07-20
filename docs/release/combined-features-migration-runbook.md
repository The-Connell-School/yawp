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
   assignments, invalid constraint values, ambiguous ownerless assignments, or
   cross-organization feature data. Resolve those rows explicitly; the
   migration intentionally does not pick a winner. The script is
   base-schema-aware, so this command must also succeed before any of the new
   feature tables exist.

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

## Rollback and recovery

These migrations are additive. Keep the previous application image available
and verify it ignores the added columns, tables, and triggers before cutover.

- Before enabling any pilot flag: if `migrate deploy` or the postcheck fails,
  keep all three flags off, stop the deployment, preserve the failed database
  for diagnosis, and roll the application back. Prefer a forward repair of the
  additive schema. Do not manually drop tenant triggers or the AI reservation
  table on a live database.
- After a pilot flag is enabled: disable that flag first. Application rollback
  is safe while the additive schema remains. Reconcile any feature rows written
  after cutover before considering database restoration.
- Partial migration: Prisma records each completed migration. Do not edit
  `_prisma_migrations` or rerun migration statements manually. Fix the
  offending data or migration, use the documented Prisma resolve procedure
  only with an audited decision, and rerun `migrate deploy`.
- Snapshot/PITR: a pre-deployment snapshot is disaster recovery, not the first
  rollback tool. Restoring it over a live database can discard unrelated
  writes. Quiesce writes or restore to a separate database, recover to a
  point-in-time immediately before cutover, compare post-cutover writes, and
  explicitly replay/reconcile them before switching traffic.

Record the application image, snapshot/PITR identifier, preflight output,
migration output, postcheck output, flag state, and any reconciliation decision
in the release evidence.
