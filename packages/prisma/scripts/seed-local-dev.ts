/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  importProdFidelityFixtures,
  loadProdFidelityBundle,
} from './local-dev/import-prod-fidelity-fixtures';
import { seedCollaborationDemoData } from './local-dev/seed-collaboration';
import { seedSyntheticLocalDevData } from './local-dev/seed-synthetic-data';
import { truncateAllPublicTables } from './local-dev/truncate-all';
import { enableClassInsightsForOrganizations } from './local-dev/class-insights';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PASSWORD,
  LOCAL_DEV_PERSONAS,
  UA_PREVIEW_ORG_ID,
  UA_PREVIEW_ORG_NAME,
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
      reporterEnabled: true,
      classInsightsEnabled: false,
    },
  });
  await prisma.organization.create({
    data: {
      id: UA_PREVIEW_ORG_ID,
      name: UA_PREVIEW_ORG_NAME,
      numOfStudentSeats: 500,
      numOfTeacherSeats: 0,
    },
  });
  await enableClassInsightsForOrganizations(prisma, [LOCAL_DEV_ORG_ID]);
  console.timeEnd('organization');

  console.time('prod-fidelity');
  const bundle = await loadProdFidelityBundle();
  await importProdFidelityFixtures(prisma, bundle);
  console.timeEnd('prod-fidelity');

  console.time('synthetic');
  const context = await seedSyntheticLocalDevData(prisma);
  console.timeEnd('synthetic');

  // After the synthetic seed, because it puts the four student personas into
  // groups alongside the cohort it creates.
  console.time('collaboration');
  const collaboration = await seedCollaborationDemoData(prisma, {
    organizationId: context.organizationId,
    schoolCode: 'DEV-SCH-1',
    personas: LOCAL_DEV_PERSONAS,
  });
  console.timeEnd('collaboration');

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
        // Listed because these have no persona entry — the preview login picker
        // reads the organization's users, so they are selectable there, but a
        // local run needs the addresses printed to know they exist.
        collaborationDemo: collaboration
          ? {
              classId: collaboration.classId,
              groups: collaboration.groupIds.length,
              students: collaboration.cohort.map((student) => ({
                name: student.name,
                email: student.email,
                password: LOCAL_DEV_PASSWORD,
              })),
            }
          : null,
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
