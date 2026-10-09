import { prisma } from '~/utils/db.server';
import {
  isTourId,
  isTourStatus,
  nextTourStatus,
  type TourId,
  type TourStatus,
} from './tours';

/** Tours the user has finished or skipped; their welcome cards stay closed. */
export async function loadFinishedTourIds(userId: string): Promise<TourId[]> {
  const rows = await prisma.userTour.findMany({
    where: { userId },
    select: { tourId: true },
  });
  return rows.map((row) => row.tourId).filter(isTourId);
}

/** Store how the user left a tour. A finished tour is never marked skipped. */
export async function recordTourOutcome(
  userId: string,
  tourId: TourId,
  outcome: TourStatus
) {
  const existing = await prisma.userTour.findUnique({
    where: { userId_tourId: { userId, tourId } },
    select: { status: true },
  });
  const previous = isTourStatus(existing?.status) ? existing.status : null;
  const status = nextTourStatus(previous, outcome);
  if (!status) return;
  await prisma.userTour.upsert({
    where: { userId_tourId: { userId, tourId } },
    create: { userId, tourId, status },
    update: { status },
  });
}

/** Forget every tour the user finished or skipped, so each page greets them again. */
export async function resetTours(userId: string) {
  await prisma.userTour.deleteMany({ where: { userId } });
}
