/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  loadProdFidelityBundle,
  syncProdFidelityFixtures,
} from './local-dev/import-prod-fidelity-fixtures';

assertLocalSeedTarget();

const prisma = createPrismaClient();

try {
  const bundle = await loadProdFidelityBundle();
  const result = await prisma.$transaction((transaction) =>
    syncProdFidelityFixtures(transaction, bundle)
  );
  console.log('Synced prod-fidelity configuration fixtures.');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
