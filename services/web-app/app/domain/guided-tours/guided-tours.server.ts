import { prisma } from '~/utils/db.server';
import {
  guidedToursAvailable,
  isTourId,
  isTourStatus,
  nextTourStatus,
  type TourId,
  type TourStatus,
} from './tours';

/**
 * Tours the user has finished; their welcome cards stay closed for good. A
 * skipped tour is not here: it greets them again at their next login.
 */
export async function loadFinishedTourIds(userId: string): Promise<TourId[]> {
  const rows = await prisma.userTour.findMany({
    where: { userId, status: 'completed' },
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

/**
 * What a page needs to show tours: the finished tours for a free classroom
 * teacher while the free tier is on, or null for everyone else.
 */
export async function loadGuidedTours(
  userId: string,
  membership: { role: string; organization?: { plan?: string | null } | null }
): Promise<{ finishedTourIds: TourId[] } | null> {
  const plan = membership.organization?.plan;
  // Only free classroom teachers can see tours; skip the flag read otherwise.
  if (
    !guidedToursAvailable({
      freeTierEnabled: true,
      role: membership.role,
      plan,
    })
  ) {
    return null;
  }
  const { isFreeTierEnabled } =
    await import('~/domain/feature-flags/feature-flags.server');
  if (!(await isFreeTierEnabled())) return null;
  return { finishedTourIds: await loadFinishedTourIds(userId) };
}
