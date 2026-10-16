import { prisma } from '../app/utils/db.server';
import {
  backfillLlmLogDeidentification,
  parseBackfillArgs,
} from './backfill-llm-log-deidentify-lib';

const options = parseBackfillArgs(process.argv.slice(2));

console.log(
  `Starting LlmLog de-identification backfill environment=${options.environment} dryRun=${options.dryRun} batchSize=${options.batchSize}`
);

try {
  const summary = await backfillLlmLogDeidentification({ prisma, options });
  console.log(
    `Finished LlmLog de-identification backfill scanned=${summary.scanned} skipped=${summary.skipped} changed=${summary.changed} updated=${summary.updated} dryRun=${summary.dryRun}`
  );
} finally {
  await prisma.$disconnect();
}
