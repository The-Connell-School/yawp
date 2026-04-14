# Consolidate submissions migration: coverage, gaps, rollback

## What moved

- `DocumentSnapshot` + `Grade` + `GradeComment` (+ `GradeCommentResponse`) → `Submission` + `SubmissionComment` (+ `LegacyGradeRedirect` for old `gradeId` URLs).
- SQL: `packages/prisma/migrations/20260410192601_consolidate_submissions/migration.sql`.

## Grade comments (“great comments” / inline teacher comments)

- **Linked grades** (`Grade.snapshotId` set): comments copy from `GradeComment` with `submissionId = Grade.snapshotId` (same id as the `Submission` row from that snapshot).
- **Decoupled grades** (`Grade.snapshotId` null): comments now insert in a second pass: pick `Submission` per `Grade.documentId` by preferring `Document.submittedSnapshotId` when it matches a `Submission` id, else latest `Submission.submittedAt` for that document.

## Remaining gaps (know these)

| Area | Risk |
|------|------|
| Grade comments on decoupled grades when the document has **no** non-archived `DocumentSnapshot` | No `Submission` row to attach to; comment still dropped. Dry-run warns. |
| Grade comments where the grade’s snapshot is **archived** | No `Submission` for that snapshot; first insert skips; not fixed by decoupled pass. Dry-run warns. |
| `GradeCommentResponse` | Table dropped; there is no `SubmissionCommentResponse` model — **replies are not migrated**. Dry-run warns. |
| `Document.submittedSnapshotId` stale vs which snapshot was actually graded | Rare; decoupled pass may attach to a different submission than the teacher intended. |

## Pre-migration checks

```bash
cd packages/prisma && DATABASE_URL="postgresql://..." bunx tsx scripts/document-hardening-dry-run.ts
```

## Post-migration checks

```bash
cd packages/prisma && DATABASE_URL="postgresql://..." bunx tsx scripts/verify-post-consolidate-migration.ts
```

Reconcile `SubmissionComment` count against the `GradeComment` count you recorded pre-migration (from dry-run output or a saved query).

## If production already ran the migration **without** the decoupled-grade comment INSERT

The old tables are gone. You cannot reconstruct lost rows from the migrated DB alone. Options: restore RDS from the pre-migration `pg_dump`, then deploy code that includes the updated migration and run `prisma migrate deploy` from a clean baseline, or accept loss for those rows.

## Rollback practice (local only)

One script: restore DB from a **plain SQL** dump taken immediately before release, then checkout the pre-release git ref and regenerate Prisma client.

1. Before release: `git rev-parse HEAD` → save as `PRE_RELEASE_GIT_REF`. Dump production (or staging) and upload to S3.
2. After a test “bad” deploy:

```bash
export PRE_RELEASE_GIT_REF='<sha-or-tag>'
export PRE_RELEASE_DUMP_S3_URI='s3://bucket/path/pre-release.sql'   # or PRE_RELEASE_DUMP_LOCAL=/path/to.sql
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/yawp'
YAWP_CONFIRM=yes ./scripts/practice-full-rollback.sh
```

This **does not** run `prisma migrate deploy` after restore (the dump already matches schema at that point).

## Production rollback (human-in-the-loop)

1. **Database:** Restore RDS from the same pre-release `pg_dump` (bastion + `psql`/`pg_restore` per your ops runbook). Destructive; coordinate maintenance window and `YAWP_I_UNDERSTAND`-style confirmation outside this repo.
2. **Code:** Redeploy the container/image (or git SHA) that was live before the release — same artifact as `PRE_RELEASE_GIT_REF` in git.

Emergency SQL-only rollback is **not** a full substitute for a restore: `packages/prisma/migrations/20260410192601_consolidate_submissions/down.sql` is a best-effort template; the header says to prefer backup restore for full fidelity.

## Related scripts

- `bun run db:sync-local-from-production` — pull live prod → local + `migrate deploy`.
- `bun run db:restore-local-from-s3` — older S3 snapshot → local + `migrate deploy`.
