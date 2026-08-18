/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './connection';
import { LOCAL_DEV_ORG_ID } from './dev-personas';
import { enableClassInsightsForOrganizations } from './class-insights';

assertLocalSeedTarget();

const prisma = createPrismaClient();

const [result] = await enableClassInsightsForOrganizations(prisma, [
  LOCAL_DEV_ORG_ID,
]);

if (!result?.enabled) {
  console.warn(
    `No local dev organization (${LOCAL_DEV_ORG_ID}) found; skipping class insights enablement.`
  );
} else {
  console.log('Enabled class performance summaries for local dev organization.');
}

await prisma.$disconnect();
