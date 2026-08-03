/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './connection';
import { LOCAL_DEV_ORG_ID } from './dev-personas';

assertLocalSeedTarget();

const prisma = createPrismaClient();

const updated = await prisma.organization.updateMany({
  where: { id: LOCAL_DEV_ORG_ID },
  data: { classInsightsEnabled: true },
});

if (updated.count === 0) {
  console.warn(
    `No local dev organization (${LOCAL_DEV_ORG_ID}) found; skipping class insights enablement.`
  );
} else {
  console.log('Enabled class performance summaries for local dev organization.');
}

await prisma.$disconnect();
