/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  loadProdFidelityBundle,
  syncProdFidelityFixtures,
} from './local-dev/import-prod-fidelity-fixtures';
import {
  MissingOrganizationError,
  seedClassStarterAssignmentType,
} from './seed-class-starter-assignment-type';

assertLocalSeedTarget();

const prisma = createPrismaClient();

try {
  const bundle = await loadProdFidelityBundle();
  const result = await prisma.$transaction(
    (transaction) => syncProdFidelityFixtures(transaction, bundle),
    { timeout: 60_000 }
  );
  console.log('Synced prod-fidelity configuration fixtures.');
  console.log(JSON.stringify(result, null, 2));

  // Class Starter's `kind` cannot be set through the admin UI, so the row has to
  // come from a seed. It is here and in seed-local-dev because a preview deploy
  // runs exactly one of the two: seed-local-dev for a freshly created database,
  // this one for a database that already existed.
  try {
    await seedClassStarterAssignmentType(prisma);
    console.log('Class Starter assignment type ready.');
  } catch (error) {
    // Never fail a whole seed run over the one case that is legitimately absent.
    if (error instanceof MissingOrganizationError) {
      console.warn(`${error.message} Skipping.`);
    } else {
      throw error;
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
