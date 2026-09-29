# Migration lock_timeout recovery (assignment rubric baseline capture)

If `prisma migrate deploy` fails due to `lock_timeout` while applying `20260929034000_assignment_rubric_baseline_capture`:

1. Resolve the failed migration as rolled back:
   ```
   bun run prisma migrate resolve --rolled-back 20260929034000_assignment_rubric_baseline_capture
   ```
2. Re-deploy:
   ```
   bun run prisma migrate deploy
   ```

Notes:
- Application queries that touch `Assignment` can queue for up to ~5 seconds during this migration.
- `canonical_json(jsonb)` normalizes numbers differently than JS for values > 2^53, 1e21, and `-0`.

