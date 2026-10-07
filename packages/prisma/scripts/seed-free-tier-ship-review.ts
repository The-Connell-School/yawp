/* eslint-disable no-console */
import { createPrismaClient, assertLocalSeedTarget } from './local-dev/connection';
import { seedFreeTierShipReview } from './local-dev/seed-free-tier-ship-review';

assertLocalSeedTarget();
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
