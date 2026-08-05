/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  DEFAULT_PREVIEW_SEAT_COUNT,
  backfillLegacyPreviewSeatCodes,
  buildPreviewSeatDefinitions,
  ensurePreviewSeats,
} from './preview-seats';

assertLocalSeedTarget();

const requestedCount = Number(
  process.env.PREVIEW_SEAT_COUNT ?? DEFAULT_PREVIEW_SEAT_COUNT
);
const seats = buildPreviewSeatDefinitions(requestedCount);
const prisma = createPrismaClient();

try {
  const results = await ensurePreviewSeats(prisma, seats);
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
