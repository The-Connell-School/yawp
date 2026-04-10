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
      `WARNING: ${grades - gradesWithSnapshot} grades have no snapshotId -- they will not get redirects`
    );
  }

  // Check for orphaned grade comments (grade has no snapshot)
  const orphanedComments = await prisma.gradeComment.count({
    where: { grade: { snapshotId: null } },
  });
  if (orphanedComments > 0) {
    issues.push(
      `WARNING: ${orphanedComments} grade comments reference grades without snapshots -- they will be lost`
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
