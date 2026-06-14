/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  exportProdFidelityFixtures,
  writeProdFidelityBundle,
} from './local-dev/export-prod-fidelity-fixtures';

const sourceDatabaseUrl =
  process.env.SOURCE_DATABASE_URL?.trim() || process.env.DATABASE_URL;

if (!sourceDatabaseUrl) {
  throw new Error('Set SOURCE_DATABASE_URL or DATABASE_URL before exporting fixtures.');
}

assertLocalSeedTarget(sourceDatabaseUrl);

const prisma = createPrismaClient(sourceDatabaseUrl);

try {
  const bundle = await exportProdFidelityFixtures(prisma, sourceDatabaseUrl);
  await writeProdFidelityBundle(bundle);
} finally {
  await prisma.$disconnect();
}
