/**
 * Dry-run script for document-hardening Phase 2 migration.
 * Counts rows in old tables to validate pre-migration state.
 *
 * Run: cd packages/prisma && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/yawp bunx tsx scripts/document-hardening-dry-run.ts
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString, ssl: false });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== Document Hardening Phase 2 — Pre-Migration Counts ===\n');

  const [snapshots, activeSnapshots, grades, gradesWithSnapshot, gradeComments, gradeCommentResponses] =
    await Promise.all([
      prisma.documentSnapshot.count(),
      prisma.documentSnapshot.count({ where: { archivedAt: null } }),
      prisma.grade.count(),
      prisma.grade.count({ where: { snapshotId: { not: null } } }),
      prisma.gradeComment.count(),
      prisma.gradeCommentResponse.count(),
    ]);

  console.log(`DocumentSnapshot (total):    ${snapshots}`);
  console.log(`DocumentSnapshot (active):   ${activeSnapshots}  <- will become Submissions`);
  console.log(`Grade (total):               ${grades}`);
  console.log(`Grade (with snapshot):       ${gradesWithSnapshot}  <- will become LegacyGradeRedirects`);
  console.log(`GradeComment:                ${gradeComments}  <- will become SubmissionComments`);
  console.log(`GradeCommentResponse:        ${gradeCommentResponses}`);

  console.log('\n--- Expected post-migration counts ---');
  console.log(`Submission:                  ~${activeSnapshots}`);
  console.log(`SubmissionComment:           ~${gradeComments}`);
  console.log(`LegacyGradeRedirect:         ~${gradesWithSnapshot}`);

  // Sanity checks
  const issues: string[] = [];
  if (gradesWithSnapshot !== grades) {
    issues.push(
      `INFO: ${grades - gradesWithSnapshot} grades have no snapshotId -- LegacyGradeRedirect rows only for snapshot-linked grades; decoupled grade comments map via submittedSnapshotId / latest submission in migration SQL`
    );
  }

  const decoupledComments = await prisma.gradeComment.count({
    where: { grade: { snapshotId: null } },
  });
  if (decoupledComments > 0) {
    console.log(
      `\nINFO: ${decoupledComments} grade comments on decoupled grades -- migration maps these to SubmissionComment using Document.submittedSnapshotId (else latest Submission per document)`
    );
  }

  const unmappableDecoupled = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM "GradeComment" gc
    INNER JOIN "Grade" g ON g.id = gc."gradeId"
    WHERE g."snapshotId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "DocumentSnapshot" s
      WHERE s."documentId" = g."documentId"
      AND s."archivedAt" IS NULL
    )
  `;
  const unmappableN = Number(unmappableDecoupled[0]?.count ?? 0n);
  if (unmappableN > 0) {
    issues.push(
      `WARNING: ${unmappableN} grade comments on decoupled grades have no active DocumentSnapshot for that document -- no Submission row to attach to; these will still be lost`
    );
  }

  const commentsOnArchivedSnapshotOnly = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM "GradeComment" gc
    INNER JOIN "Grade" g ON g.id = gc."gradeId"
    WHERE g."snapshotId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "DocumentSnapshot" s
      WHERE s.id = g."snapshotId"
      AND s."archivedAt" IS NULL
    )
  `;
  const archivedSnapN = Number(commentsOnArchivedSnapshotOnly[0]?.count ?? 0n);
  if (archivedSnapN > 0) {
    issues.push(
      `WARNING: ${archivedSnapN} grade comments reference a grade whose snapshot is archived (no Submission row) -- still not migrated`
    );
  }

  if (gradeCommentResponses > 0) {
    issues.push(
      `WARNING: ${gradeCommentResponses} GradeCommentResponse rows exist -- table is dropped in migration with no SubmissionCommentResponse model; thread replies are not migrated`
    );
  }

  if (issues.length > 0) {
    console.log('\n--- Issues ---');
    issues.forEach((i) => console.log(i));
  } else {
    console.log('\nNo issues found. Safe to migrate.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
