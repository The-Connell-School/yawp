# Combined features migration runbook

This gate covers the Reporter, class-summary, and Writing Fundamentals changes.
All three organization rollout flags default off, so schema deployment and
product enablement are separate operations.

## Before deployment

1. Take a restorable database snapshot.
2. Run this operator preflight:

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

The production deployment path enforces the same ordering in
`packages/prisma/scripts/migrate-remote.ts`: it awaits the preflight, then
`prisma migrate deploy`, then the postcheck. Any SQL error rejects the awaited
gate and aborts the process before the next step. The explicit commands here
remain useful for operator inspection and for recording the cutover transcript;
they are not the only enforcement mechanism.

The production runner and rehearsal share
`packages/prisma/scripts/combined-feature-gate.ts`. That executor removes the
psql-only `\set ON_ERROR_STOP on` directive before submitting the script through
node-postgres. The migration rehearsal runs the same executor on the origin,
feature, hardened, and recovered schemas and proves five invalid feature states
raise through node-postgres before any production migration is attempted.
The hosted Prisma job repeats those five fail-closed cases in an isolated,
disposable PostgreSQL database by setting
`COMBINED_REHEARSAL_NEGATIVES_ONLY=1`; the database is dropped before the job
continues to the normal backfill and assignment-type release gate.

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
