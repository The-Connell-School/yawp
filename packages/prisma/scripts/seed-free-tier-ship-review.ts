/* eslint-disable no-console */
import { createPrismaClient, assertLocalSeedTarget } from './local-dev/connection';
import { seedFreeTierShipReview } from './local-dev/seed-free-tier-ship-review';
import { shouldRunFreeTierShipReviewSeed } from '../../scripts/preview/free-tier-ship-review-seed-guard.mjs';

assertLocalSeedTarget();

const databaseName = process.env.DATABASE_URL?.split('/').pop()?.split('?')[0] ?? '';
if (!shouldRunFreeTierShipReviewSeed(databaseName)) {
  console.log(
    `Skipping free-tier ship-review seed: database "${databaseName}" is not an isolated PR preview (yawp_pr_<n>).`
  );
  process.exit(0);
}
const prisma = createPrismaClient();

try {
  await seedFreeTierShipReview(prisma);
  console.log('Free tier ship-review fixture ready.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
