/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import { seedStarterGradingEvaluations } from './local-dev/starter-grading-evaluations';

assertLocalSeedTarget();
const prisma = createPrismaClient();

try {
  const summary = await seedStarterGradingEvaluations(prisma);
  console.log('Starter grading evaluations are ready.');
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
