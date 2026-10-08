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
import { seedApHistoryLocalDev } from './local-dev/seed-ap-history';
import { seedSyntheticLocalDevData } from './local-dev/seed-synthetic-data';
import { seedStarterGradingEvaluations } from './local-dev/starter-grading-evaluations';
import { seedApHistoryLibrary } from './seed-ap-history-library';
import { truncateAllPublicTables } from './local-dev/truncate-all';
import { enableClassInsightsForOrganizations } from './local-dev/class-insights';
import {
  MissingOrganizationError,
  seedClassStarterAssignmentType,
} from './seed-class-starter-assignment-type';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PASSWORD,
  LOCAL_DEV_PERSONAS,
  UA_PREVIEW_ORG_ID,
  UA_PREVIEW_ORG_NAME,
} from './local-dev/dev-personas';
import { seedFreeTierShipReview } from './local-dev/seed-free-tier-ship-review';

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
      // Left off here on purpose: enableClassInsightsForOrganizations below is
      // the single place that turns it on, for local dev and preview seats.
      // Writing practice defaults off so it stays dark in production. Local dev
      // and previews exist to look at it, so they seed it on.
      writingPracticeEnabled: true,
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

  console.time('ap-history');
  await seedApHistoryLibrary(prisma, LOCAL_DEV_ORG_ID);
  console.timeEnd('ap-history');

  console.time('grading-evaluations');
  const evaluationSummary = await seedStarterGradingEvaluations(prisma, {
    demo: true,
  });
  console.timeEnd('grading-evaluations');

  // After the synthetic seed, because it puts the four student personas into
  // groups alongside the cohort it creates.
  console.time('collaboration');
  const collaboration = await seedCollaborationDemoData(prisma, {
    organizationId: context.organizationId,
    schoolCode: 'DEV-SCH-1',
    personas: LOCAL_DEV_PERSONAS,
  });
  console.timeEnd('collaboration');

  const databaseName = process.env.DATABASE_URL?.split('/').pop()?.split('?')[0] ?? '';
  const { shouldRunFreeTierShipReviewSeed } = await import(
    '../../../scripts/preview/free-tier-ship-review-seed-guard.mjs'
  );
  if (shouldRunFreeTierShipReviewSeed(databaseName)) {
    console.time('free-tier-ship-review');
    await seedFreeTierShipReview(prisma);
    console.timeEnd('free-tier-ship-review');
  }

  console.log('🌱 Local dev seed complete.');
  console.log(
    JSON.stringify(
      {
        organizationId: context.organizationId,
        primaryClassId: context.primaryClassId,
        thesisAssignmentTypeId: context.thesisAssignmentTypeId,
        evaluationSummary,
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

  // Class Starter's `kind` cannot be set through the admin UI, so the row has to
  // come from a seed. It is here and in sync-prod-fidelity-fixtures because a
  // preview deploy runs exactly one of the two: this for a freshly created
  // database, that one for a database that already existed.
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
