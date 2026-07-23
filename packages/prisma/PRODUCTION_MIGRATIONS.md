# Production migration safety

Production deploys must use `bun prisma:migrate-remote production`. The wrapper:

- refuses to start when a transaction at least five seconds old holds a lock on
  a user table;
- applies a five-second PostgreSQL `lock_timeout`;
- applies a ten-minute PostgreSQL `statement_timeout`;
- runs the existing fail-closed preflight and postcheck around
  `prisma migrate deploy`.

The production workflow queues newer pushes instead of canceling a running
deploy. This protects non-transactional concurrent-index migrations from normal
workflow cancellation.

The deploy workflow sets these budgets explicitly with
`PROD_MIGRATION_LOCK_TIMEOUT_MS`,
`PROD_MIGRATION_STATEMENT_TIMEOUT_MS`, and
`PROD_MIGRATION_BLOCKING_TRANSACTION_AGE_MS`. Treat a preflight or timeout
failure as a stopped deploy. Inspect and clear the blocking transaction; do not
raise the limits without an approved maintenance-window plan.

## Interrupted concurrent-index recovery

If `20260723220000_add_paste_alert_reviewer_index` is interrupted:

1. Confirm `_prisma_migrations` contains an unfinished, non-rolled-back row for
   the migration.
2. Inspect `pg_index.indisvalid` and `pg_index.indisready` for
   `PasteAlert_reviewedByMembershipId_idx`.
3. If the index exists and is invalid, run:

   ```sql
   DROP INDEX CONCURRENTLY "PasteAlert_reviewedByMembershipId_idx";
   ```

4. Reconcile Prisma's failure ledger:

   ```sh
   bun prisma migrate resolve \
     --rolled-back 20260723220000_add_paste_alert_reviewer_index
   ```

5. Rerun the production migration wrapper. Confirm the index is both valid and
   ready, the newest migration row is finished, and `prisma migrate deploy`
   reports no pending migrations.

Never mark this migration applied while its index is absent or invalid.
