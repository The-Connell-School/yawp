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
  resolveDailyPagesSampleTargets,
  seedDailyPagesSampleEntries,
} from './local-dev/seed-daily-pages-samples';
import {
  MissingOrganizationError,
  seedClassStarterAssignmentType,
} from './seed-class-starter-assignment-type';
import { applyDailyPagesEngagementV2Seed } from './apply-daily-pages-engagement-v2-seed';

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
    const engagementV2 = await applyDailyPagesEngagementV2Seed(prisma);
    console.log('Daily Pages engagement v2 seed:', engagementV2);
  } catch (error) {
    // Never fail a whole seed run over the one case that is legitimately absent.
    if (error instanceof MissingOrganizationError) {
      console.warn(`${error.message} Skipping.`);
    } else {
      throw error;
    }
  }
  // The sync above re-imports the Daily Pages row, saved 0-30 engagement
  // rubric and all, and a saved rubric always wins — so a preview would grade
  // Daily Pages exactly as it did before the split. This puts the type back on
  // the short-form assistant and seeds the graded class set if it is missing.
  // Creating is skipped when the entries are already there, so it is safe on
  // every deploy.
  const sampleTargets = await resolveDailyPagesSampleTargets(prisma);
  if (!sampleTargets) {
    console.warn(
      'No seeded Daily Pages world found (dev personas or class missing). Skipping sample entries.'
    );
  } else {
    const samples = await seedDailyPagesSampleEntries(prisma, sampleTargets);
    console.log(
      samples.alreadySeeded
        ? 'Daily Pages sample entries already present.'
        : `Seeded ${samples.submissionIds.length} graded Daily Pages entries.`
    );
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
