/* eslint-disable no-console */
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  DEFAULT_PREVIEW_SEAT_COUNT,
  buildPreviewSeatDefinitions,
  ensurePreviewSeats,
} from './preview-seats';

assertLocalSeedTarget();

const requestedCount = Number(
  process.env.PREVIEW_SEAT_COUNT ?? DEFAULT_PREVIEW_SEAT_COUNT,
);
const seats = buildPreviewSeatDefinitions(requestedCount);
const prisma = createPrismaClient();

try {
  const results = await ensurePreviewSeats(prisma, seats);
  for (const seat of seats) {
    const result = results.find(
      ({ organizationId }) => organizationId === seat.organizationId,
    );
    console.log(
      `Preview seat ${seat.number} (${seat.label}): ${result?.status ?? 'unknown'} ${seat.organizationId}`,
    );
  }
} finally {
  await prisma.$disconnect();
}
