/**
 * Post-deploy checks after consolidate_submissions (Submission / SubmissionComment only).
 * Run against the same DATABASE_URL as the app.
 *
 *   cd packages/prisma && DATABASE_URL=... bunx tsx scripts/verify-post-consolidate-migration.ts
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
  const [submissions, comments, redirects] = await Promise.all([
    prisma.submission.count(),
    prisma.submissionComment.count(),
    prisma.legacyGradeRedirect.count(),
  ]);

  console.log('=== Post consolidate_submissions counts ===\n');
  console.log(`Submission:           ${submissions}`);
  console.log(`SubmissionComment:    ${comments}`);
  console.log(`LegacyGradeRedirect:  ${redirects}`);
  console.log(
    '\nCompare SubmissionComment to the GradeComment count you recorded pre-migration (dry-run).',
  );
  console.log(
    'If this migration ran before the decoupled-grade comment backfill was added, restore from backup and re-run migrate.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
