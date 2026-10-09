/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  DEFAULT_PREVIEW_SEAT_COUNT,
  backfillLegacyPreviewSeatCodes,
  buildPreviewSeatDefinitions,
  enableWritingPracticeForPreviewOrganizations,
  ensurePreviewSeats,
} from './preview-seats';
import { seedApHistoryLibrary } from './seed-ap-history-library';
import { attachApHistorySourceImages } from './local-dev/seed-ap-history';
import { applyDailyPagesEngagementV2Seed } from './apply-daily-pages-engagement-v2-seed';
import {
  ensurePreviewFreeClassroomFixture,
  ensurePreviewSchoolReporterNavFixture,
} from './local-dev/seed-preview-free-classroom';
import {
  isDemoPlannerQaEnvironment,
  seedPreviewPlannerQa,
} from './seed-preview-planner-qa';
import { ensureLessonPlannerEnabledForDemo } from './local-dev/seed-lesson-planner-feature-flag';
import { ensureFreeTierEnabledForPreview } from './local-dev/seed-free-tier-feature-flag';
import {
  seedPreviewTeacherNotesQa,
  shouldRunPreviewTeacherNotesQaSeed,
} from './seed-preview-teacher-notes-qa';

assertLocalSeedTarget();

const requestedCount = Number(
  process.env.PREVIEW_SEAT_COUNT ?? DEFAULT_PREVIEW_SEAT_COUNT
);
const seats = buildPreviewSeatDefinitions(requestedCount);
const prisma = createPrismaClient();
const databaseName = process.env.DATABASE_URL?.split('/').pop()?.split('?')[0] ?? '';

try {
  const freeTierFlag = await ensureFreeTierEnabledForPreview(prisma, databaseName);
  console.log(`Free tier feature flag seed: ${JSON.stringify(freeTierFlag)}`);
  const results = await ensurePreviewSeats(prisma, seats);
  const includeFreeClassroomFixture =
    process.env.PREVIEW_SLUG !== 'demo' &&
    process.env.INCLUDE_PREVIEW_FREE_CLASSROOM_FIXTURE !== 'false';
  if (includeFreeClassroomFixture) {
    const freeClassroom = await ensurePreviewFreeClassroomFixture(prisma);
    console.log(`Preview free classroom fixture: ${freeClassroom.status}`);
    const schoolReporterNav = await ensurePreviewSchoolReporterNavFixture(prisma);
    console.log(`Preview school reporter nav fixture: ${schoolReporterNav.status}`);
  } else {
    console.log('Preview free classroom fixture: skipped');
  }
  const writingPractice = await enableWritingPracticeForPreviewOrganizations(
    prisma,
    seats.map(({ organizationId }) => organizationId)
  );
  console.log(
    `Writing practice preview enablement: ${writingPractice.count} seat(s) updated`
  );
  // PR previews retain their database across deploys. Reconcile this branch's
  // idempotent AP catalog on every seed-mode deploy, including existing seats.
  await seedApHistoryLibrary(prisma, seats[0].organizationId);
  await attachApHistorySourceImages(prisma);
  await applyDailyPagesEngagementV2Seed(prisma);
  if (shouldRunPreviewTeacherNotesQaSeed()) {
    try {
      await seedPreviewTeacherNotesQa(prisma);
    } catch (error) {
      console.error('seed-preview-teacher-notes-qa: failed (non-fatal)', error);
    }
  }
  for (const seat of seats) {
    const result = results.find(
      ({ organizationId }) => organizationId === seat.organizationId
    );
    console.log(
      `Preview seat ${seat.number} (${seat.label}): ${result?.status ?? 'unknown'} ${seat.organizationId}`
    );
  }
  if (process.env.PREVIEW_ACCESS_SEATS) {
    const configuredSeats = JSON.parse(
      process.env.PREVIEW_ACCESS_SEATS
    ) as Array<{ code: string; organizationId: string; label: string }>;
    const backfillResults = await backfillLegacyPreviewSeatCodes(
      prisma,
      configuredSeats
    );
    for (const result of backfillResults) {
      console.log(
        `Preview seat code ${result.organizationId}: ${result.status}`
      );
    }
  }
  if (!isDemoPlannerQaEnvironment()) {
    for (const seat of seats) {
      try {
        const plannerQa = await seedPreviewPlannerQa(prisma, {
          organizationId: seat.organizationId,
        });
        console.log(
          `preview planner QA seed (seat ${seat.number}):`,
          JSON.stringify(plannerQa)
        );
      } catch (error) {
        console.warn(
          'preview planner QA seed failed (non-fatal):',
          error instanceof Error ? error.message : error
        );
      }
    }
  } else {
    console.log('preview planner QA seed skipped: demo environment');
    await ensureLessonPlannerEnabledForDemo(prisma);
    const { ensureFreeTierEnabledForDemo } = await import(
      './local-dev/seed-free-tier-feature-flag'
    );
    await ensureFreeTierEnabledForDemo(prisma);
  }
} finally {
  await prisma.$disconnect();
}
