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
2. Inspect the index definition plus `pg_index.indisvalid` and
   `pg_index.indisready` for `PasteAlert_reviewedByMembershipId_idx`.
3. If an index with that exact name exists in either a valid or invalid state,
   remove it before retrying:

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

## Interrupted paste review-metadata recovery

If `20260723210000_add_paste_alert_review_metadata` is unfinished, inspect the
catalog before reconciling Prisma:

1. Confirm whether `reviewedAt` and `reviewedByMembershipId` exist on
   `PasteAlert`; both must be nullable, with the expected timestamp/text types.
2. Inspect `PasteAlert_reviewedByMembershipId_fkey` in `pg_constraint`,
   including `pg_get_constraintdef(oid)` and `convalidated`.
3. If neither column exists, resolve the failed attempt as rolled back and
   rerun the wrapper.
4. If both columns exist but the foreign key is absent, add the exact foreign
   key `NOT VALID`. If it exists but is unvalidated, validate it:

   ```sql
   ALTER TABLE "PasteAlert"
   VALIDATE CONSTRAINT "PasteAlert_reviewedByMembershipId_fkey";
   ```

5. Only after both nullable columns and the validated `ON DELETE SET NULL ON
   UPDATE CASCADE` foreign key match the migration, reconcile it:

   ```sh
   bun prisma migrate resolve \
     --applied 20260723210000_add_paste_alert_review_metadata
   ```

6. Rerun the production wrapper. Its postcheck must confirm the columns,
   validated foreign key, valid/ready reviewer index, default-off organization
   flag, and all three completed migration ledger rows.

## Paste activity staged rollout and rollback

`Organization.pasteActivityEnabled` is default-off. The migration does not
enable any production organization.

If `20260723230000_add_paste_activity_rollout_gate` is unfinished, recover from
the catalog state instead of blindly rerunning:

1. Inspect `_prisma_migrations` for an unfinished, non-rolled-back row and
   inspect the exact `Organization.pasteActivityEnabled` definition.
2. If the column is absent, resolve the failed attempt as rolled back and rerun
   the wrapper:

   ```sh
   bun prisma migrate resolve \
     --rolled-back 20260723230000_add_paste_activity_rollout_gate
   ```

3. If the column already exists, confirm it is exactly `BOOLEAN NOT NULL
   DEFAULT false` and verify all existing organizations remain disabled. Only
   then reconcile the failed migration as applied:

   ```sh
   bun prisma migrate resolve \
     --applied 20260723230000_add_paste_activity_rollout_gate
   ```

4. Rerun the production wrapper. Its postcheck must confirm the exact column
   definition, all three completed migration rows, the exact validated reviewer
   foreign key, and the exact valid/ready reviewer index.

Never mark the rollout migration applied when the column is absent, nullable,
enabled by default, or any existing organization was enabled by the interrupted
attempt.

After the migration ledger is healthy, stage the product rollout:

1. Enable one pilot organization from Admin → Organizations → Edit
   Organization → Paste activity review.
2. Verify teacher Documents and class Documents queues, review persistence,
   request/error rates, and support feedback before expanding the pilot.
3. Expand organization by organization after the pilot observation window.
4. For an instant UI rollback, clear the same organization checkbox. The next
   request stops aggregation and hides filters, badges, sheets, and the
   detail/review endpoint with no deploy or data change.

Paste capture continues through the existing ingestion path while the review UI
is disabled, preserving backward compatibility and avoiding a data-model
cutover.
