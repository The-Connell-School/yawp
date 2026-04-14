/**
 * Archive Submission rows that are not the canonical "real" submit for a document.
 *
 * Modes (`DERIVE_CANONICAL_FROM`):
 * - `submitted_snapshot_id` (default): SOURCE_DATABASE_URL must be a pre-consolidate DB with
 *   `Document.submittedSnapshotId`. TARGET_DATABASE_URL = current DB.
 * - `snapshot_submitted_at`: SOURCE has `DocumentSnapshot` (pre-consolidate). Archive each target
 *   `Submission` whose id is a snapshot with `submittedAt IS NULL` (version-only rows per
 *   `20260222000000_track_submission_snapshots`); keep snapshots that were backfilled as submits/grades.
 * - `latest_submitted_at`: no source dump — for each document with 2+ active submissions,
 *   treat the latest by `submittedAt` (then `id`) as canonical; archive the rest (subject to KEEP_GRADED).
 *   Use when production no longer has `submittedSnapshotId` (heuristic, not identical to old pointer).
 *
 * - TARGET_DATABASE_URL: defaults to DATABASE_URL if unset.
 * - Without YAWP_CONFIRM=yes: runs updates inside a transaction and ROLLBACKs.
 * - With YAWP_CONFIRM=yes: COMMITs.
 * - YAWP_DRY_RUN=1: same as preview (rollback).
 *
 * Optional: ARCHIVE_WHEN_NO_CANONICAL=yes — only for `submitted_snapshot_id` mode: for documents whose
 * old submittedSnapshotId was NULL, archive all submissions (respects KEEP_GRADED). Ignored for
 * `snapshot_submitted_at`.
 *
 * Run:
 *   cd packages/prisma && DERIVE_CANONICAL_FROM=latest_submitted_at TARGET_DATABASE_URL=... bun ./scripts/archive-non-canonical-submissions.ts
 */
import pg from 'pg';

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
const DERIVE_MODE = process.env.DERIVE_CANONICAL_FROM ?? 'submitted_snapshot_id';
const DRY_RUN =
  process.env.YAWP_DRY_RUN === '1' ||
  process.env.DRY_RUN === '1' ||
  process.env.YAWP_DRY_RUN === 'true';
const CONFIRM = process.env.YAWP_CONFIRM === 'yes';
const ARCHIVE_WHEN_NO_CANONICAL =
  process.env.ARCHIVE_WHEN_NO_CANONICAL === 'yes' ||
  process.env.ARCHIVE_WHEN_NO_CANONICAL === '1';
const KEEP_GRADED = process.env.KEEP_GRADED !== 'no' && process.env.KEEP_GRADED !== '0';

function requireEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

type SourceRow = {
  id: string;
  submittedSnapshotId: string | null;
};

async function loadSourceDocuments(client: pg.PoolClient): Promise<SourceRow[]> {
  const { rows } = await client.query<SourceRow>(
    `SELECT id, "submittedSnapshotId" FROM "Document"`,
  );
  return rows;
}

/** Snapshots that became Submissions but were never submission/grade rows (submittedAt never set). */
async function loadSnapshotIdsWithoutSubmittedAt(client: pg.PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM "DocumentSnapshot" WHERE "archivedAt" IS NULL AND "submittedAt" IS NULL`,
  );
  return rows.map((r) => r.id);
}

async function loadPairsLatestSubmittedAt(
  client: pg.PoolClient,
): Promise<{ documentId: string; canonicalId: string }[]> {
  const { rows } = await client.query<{ document_id: string; canonical_id: string }>(`
    WITH ranked AS (
      SELECT
        id,
        "documentId",
        ROW_NUMBER() OVER (
          PARTITION BY "documentId"
          ORDER BY "submittedAt" DESC, id DESC
        ) AS rn
      FROM "Submission"
      WHERE "archivedAt" IS NULL
    ),
    multi AS (
      SELECT "documentId"
      FROM "Submission"
      WHERE "archivedAt" IS NULL
      GROUP BY "documentId"
      HAVING COUNT(*) > 1
    )
    SELECT r.id AS canonical_id, r."documentId" AS document_id
    FROM ranked r
    INNER JOIN multi m ON m."documentId" = r."documentId"
    WHERE r.rn = 1
  `);
  return rows.map((r) => ({ documentId: r.document_id, canonicalId: r.canonical_id }));
}

function gradeSignalsSql(alias: string): string {
  const s = alias;
  return `
    ${s}."gradedAt" IS NOT NULL
    OR ${s}."overallScore" IS NOT NULL
    OR ${s}."numericPercentage" IS NOT NULL
    OR (${s}."letterGrade" IS NOT NULL AND ${s}."letterGrade" <> '')
    OR (${s}.score IS NOT NULL AND ${s}.score <> '')
    OR (${s}.feedback IS NOT NULL AND ${s}.feedback <> '')
  `;
}

async function main() {
  const targetUrl = requireEnv('TARGET_DATABASE_URL or DATABASE_URL', TARGET_URL);

  if (
    DERIVE_MODE !== 'submitted_snapshot_id' &&
    DERIVE_MODE !== 'snapshot_submitted_at' &&
    DERIVE_MODE !== 'latest_submitted_at'
  ) {
    throw new Error(
      `Invalid DERIVE_CANONICAL_FROM="${DERIVE_MODE}" (use submitted_snapshot_id, snapshot_submitted_at, or latest_submitted_at)`,
    );
  }

  const useSource =
    DERIVE_MODE === 'submitted_snapshot_id' || DERIVE_MODE === 'snapshot_submitted_at';
  const sourceUrl = useSource ? requireEnv('SOURCE_DATABASE_URL', SOURCE_URL) : undefined;

  const sourcePool = sourceUrl ? new pg.Pool({ connectionString: sourceUrl }) : null;
  const targetPool = new pg.Pool({ connectionString: targetUrl });

  const now = new Date();
  const willCommit = CONFIRM && !DRY_RUN;

  try {
    let pairs: { documentId: string; canonicalId: string }[] = [];
    let withoutCanonical: SourceRow[] = [];

    if (DERIVE_MODE === 'snapshot_submitted_at') {
      const sourceClient = await sourcePool!.connect();
      let versionOnlyIds: string[];
      try {
        versionOnlyIds = await loadSnapshotIdsWithoutSubmittedAt(sourceClient);
      } finally {
        sourceClient.release();
      }
      console.log(
        `Mode snapshot_submitted_at: ${versionOnlyIds.length} active DocumentSnapshots with submittedAt NULL (version-only).`,
      );

      const targetClient = await targetPool.connect();
      try {
        let archived = 0;
        await targetClient.query('BEGIN');
        try {
          const chunkSize = 500;
          const updateSql = KEEP_GRADED
            ? `
            UPDATE "Submission" s
            SET "archivedAt" = $1::timestamptz, "updatedAt" = $1::timestamptz
            WHERE s.id = ANY($2::text[])
              AND s."archivedAt" IS NULL
              AND NOT (${gradeSignalsSql('s')})
            `
            : `
            UPDATE "Submission" s
            SET "archivedAt" = $1::timestamptz, "updatedAt" = $1::timestamptz
            WHERE s.id = ANY($2::text[])
              AND s."archivedAt" IS NULL
            `;
          for (let i = 0; i < versionOnlyIds.length; i += chunkSize) {
            const chunk = versionOnlyIds.slice(i, i + chunkSize);
            if (chunk.length === 0) continue;
            const res = await targetClient.query(updateSql, [now, chunk]);
            archived += res.rowCount ?? 0;
          }

          if (willCommit) {
            await targetClient.query('COMMIT');
            console.log('\nCommitted.');
          } else {
            await targetClient.query('ROLLBACK');
            console.log(
              DRY_RUN
                ? '\nDRY_RUN: rolled back.'
                : '\nPreview: rolled back (set YAWP_CONFIRM=yes to commit).',
            );
          }
        } catch (err) {
          await targetClient.query('ROLLBACK');
          throw err;
        }

        console.log(`Archived (version-only snapshots): ${archived} submission rows`);
        console.log(`KEEP_GRADED=${KEEP_GRADED} DERIVE_CANONICAL_FROM=${DERIVE_MODE}`);
      } finally {
        targetClient.release();
      }
      return;
    }

    if (DERIVE_MODE === 'latest_submitted_at') {
      const targetClient = await targetPool.connect();
      try {
        pairs = await loadPairsLatestSubmittedAt(targetClient);
      } finally {
        targetClient.release();
      }
      console.log(
        `Mode latest_submitted_at: ${pairs.length} documents with multiple active submissions (canonical = latest submittedAt).`,
      );
    } else {
      const sourceClient = await sourcePool!.connect();
      let sourceDocs: SourceRow[];
      try {
        sourceDocs = await loadSourceDocuments(sourceClient);
      } finally {
        sourceClient.release();
      }

      const withCanonical = sourceDocs.filter((d) => d.submittedSnapshotId != null) as {
        id: string;
        submittedSnapshotId: string;
      }[];
      withoutCanonical = sourceDocs.filter((d) => d.submittedSnapshotId == null);

      console.log(
        `Loaded ${sourceDocs.length} documents from source (${withCanonical.length} with submittedSnapshotId, ${withoutCanonical.length} without).`,
      );

      const targetClient = await targetPool.connect();
      try {
        const missingCanonical: string[] = [];

        for (const d of withCanonical) {
          const check = await targetClient.query<{ ok: boolean }>(
            `SELECT true AS ok FROM "Submission" WHERE id = $1 AND "documentId" = $2 LIMIT 1`,
            [d.submittedSnapshotId, d.id],
          );
          if (check.rows.length === 0) {
            missingCanonical.push(d.id);
            continue;
          }
          pairs.push({ documentId: d.id, canonicalId: d.submittedSnapshotId });
        }

        if (missingCanonical.length > 0) {
          console.warn(
            `\nWARNING: ${missingCanonical.length} documents have a canonical snapshot id that is missing or mismatched on target (skipped). First 20 ids:`,
          );
          console.warn(missingCanonical.slice(0, 20).join(', '));
        }
      } finally {
        targetClient.release();
      }
    }

    const targetClient = await targetPool.connect();
    try {
      let archivedCanonical = 0;
      let archivedNoCanonical = 0;

      await targetClient.query('BEGIN');
      try {
        await targetClient.query(`
          CREATE TEMP TABLE _archive_canonical_submission (
            document_id TEXT NOT NULL,
            canonical_id TEXT NOT NULL,
            PRIMARY KEY (document_id)
          ) ON COMMIT DROP;
        `);

        const chunkSize = 500;
        for (let i = 0; i < pairs.length; i += chunkSize) {
          const chunk = pairs.slice(i, i + chunkSize);
          let n = 1;
          const flat: string[] = [];
          const values = chunk
            .map((p) => {
              const a = n++;
              const b = n++;
              flat.push(p.documentId, p.canonicalId);
              return `($${a}, $${b})`;
            })
            .join(', ');
          await targetClient.query(
            `INSERT INTO _archive_canonical_submission (document_id, canonical_id) VALUES ${values}`,
            flat,
          );
        }

        const canonicalUpdateSql = KEEP_GRADED
          ? `
          UPDATE "Submission" s
          SET "archivedAt" = $1::timestamptz, "updatedAt" = $1::timestamptz
          FROM _archive_canonical_submission m
          WHERE s."documentId" = m.document_id
            AND s.id <> m.canonical_id
            AND s."archivedAt" IS NULL
            AND NOT (${gradeSignalsSql('s')})
          `
          : `
          UPDATE "Submission" s
          SET "archivedAt" = $1::timestamptz, "updatedAt" = $1::timestamptz
          FROM _archive_canonical_submission m
          WHERE s."documentId" = m.document_id
            AND s.id <> m.canonical_id
            AND s."archivedAt" IS NULL
          `;

        const canonicalRes = await targetClient.query(canonicalUpdateSql, [now]);
        archivedCanonical = canonicalRes.rowCount ?? 0;

        if (useSource && ARCHIVE_WHEN_NO_CANONICAL && withoutCanonical.length > 0) {
          const ids = withoutCanonical.map((d) => d.id);
          const res = await targetClient.query(
            KEEP_GRADED
              ? `
          UPDATE "Submission" s
          SET "archivedAt" = $1::timestamptz, "updatedAt" = $1::timestamptz
          WHERE s."documentId" = ANY($2::text[])
            AND s."archivedAt" IS NULL
            AND NOT (${gradeSignalsSql('s')})
          `
              : `
          UPDATE "Submission" s
          SET "archivedAt" = $1::timestamptz, "updatedAt" = $1::timestamptz
          WHERE s."documentId" = ANY($2::text[])
            AND s."archivedAt" IS NULL
          `,
            [now, ids],
          );
          archivedNoCanonical = res.rowCount ?? 0;
        } else if (useSource && withoutCanonical.length > 0) {
          console.log(
            `\nINFO: ${withoutCanonical.length} documents had NULL submittedSnapshotId in source — skipped (set ARCHIVE_WHEN_NO_CANONICAL=yes to archive their submissions).`,
          );
        }

        if (willCommit) {
          await targetClient.query('COMMIT');
          console.log('\nCommitted.');
        } else {
          await targetClient.query('ROLLBACK');
          console.log(
            DRY_RUN
              ? '\nDRY_RUN: rolled back.'
              : '\nPreview: rolled back (set YAWP_CONFIRM=yes to commit).',
          );
        }
      } catch (err) {
        await targetClient.query('ROLLBACK');
        throw err;
      }

      console.log(`Archived (canonical path): ${archivedCanonical} submission rows`);
      console.log(`Archived (no-canonical path): ${archivedNoCanonical} submission rows`);
      console.log(`Total rows updated in transaction: ${archivedCanonical + archivedNoCanonical}`);
      console.log(`KEEP_GRADED=${KEEP_GRADED} DERIVE_CANONICAL_FROM=${DERIVE_MODE}`);
    } finally {
      targetClient.release();
    }
  } finally {
    if (sourcePool) await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
