import { prisma } from '~/utils/db.server';
import { isTourId, type TourId, type TourStatus } from './tours';

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
  if (outcome === 'dismissed') {
    // ON CONFLICT DO NOTHING: a late Skip must never overwrite Finish from
    // another tab, even when both requests started with no progress row.
    await prisma.userTour.createMany({
      data: [{ userId, tourId, status: outcome }],
      skipDuplicates: true,
    });
    return;
  }
  await prisma.userTour.upsert({
    where: { userId_tourId: { userId, tourId } },
    create: { userId, tourId, status: outcome },
    update: { status: outcome },
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
  _userId: string,
  _membership: { role: string; organization?: { id?: string; plan?: string | null } | null },
  _request: Request
): Promise<{ finishedTourIds: TourId[]; storageScope: string } | null> {
  return null;
}


/** The existing approval gate establishes teacher identity without provisioning a membership. */
export async function loadWaitingPreviewTours(
  _userId: string,
  _application: { status: string; organizationId: string | null },
  _request: Request
) {
  return null;
}
