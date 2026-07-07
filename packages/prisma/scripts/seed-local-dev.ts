/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  importProdFidelityFixtures,
  loadProdFidelityBundle,
} from './local-dev/import-prod-fidelity-fixtures';
import { seedApHistoryLocalDev } from './local-dev/seed-ap-history';
import { seedSyntheticLocalDevData } from './local-dev/seed-synthetic-data';
import { truncateAllPublicTables } from './local-dev/truncate-all';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PERSONAS,
} from './local-dev/dev-personas';

assertLocalSeedTarget();

const prisma = createPrismaClient();

console.log('🌱 Seeding local dev database...');

try {
  console.time('truncate');
  await truncateAllPublicTables(prisma);
  console.timeEnd('truncate');

  console.time('organization');
  await prisma.organization.create({
    data: {
      id: LOCAL_DEV_ORG_ID,
      name: LOCAL_DEV_ORG_NAME,
      numOfStudentSeats: 200,
      numOfTeacherSeats: 40,
    },
  });
  console.timeEnd('organization');

  console.time('prod-fidelity');
  const bundle = await loadProdFidelityBundle();
  await importProdFidelityFixtures(prisma, bundle);
  console.timeEnd('prod-fidelity');

  console.time('synthetic');
  const context = await seedSyntheticLocalDevData(prisma);
  console.timeEnd('synthetic');

  // Additive AP History seed. Isolated in its own try/catch so a failure here
  // can never abort or corrupt the rest of the local-dev/preview seed data.
  console.time('ap-history');
  try {
    await seedApHistoryLocalDev(prisma, context.organizationId);
  } catch (apHistoryError) {
    console.warn(
      '⚠️  AP History seed skipped (non-fatal); other seed data is unaffected:',
      apHistoryError
    );
  }
  console.timeEnd('ap-history');

  console.log('🌱 Local dev seed complete.');
  console.log(
    JSON.stringify(
      {
        organizationId: context.organizationId,
        primaryClassId: context.primaryClassId,
        thesisAssignmentTypeId: context.thesisAssignmentTypeId,
        personas: LOCAL_DEV_PERSONAS.map((persona) => ({
          label: persona.label,
          email: persona.email,
          password: persona.password,
        })),
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
