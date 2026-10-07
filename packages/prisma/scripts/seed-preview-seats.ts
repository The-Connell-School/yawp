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

assertLocalSeedTarget();

const requestedCount = Number(
  process.env.PREVIEW_SEAT_COUNT ?? DEFAULT_PREVIEW_SEAT_COUNT
);
const seats = buildPreviewSeatDefinitions(requestedCount);
const prisma = createPrismaClient();

try {
  const results = await ensurePreviewSeats(prisma, seats);
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
} finally {
  await prisma.$disconnect();
}
