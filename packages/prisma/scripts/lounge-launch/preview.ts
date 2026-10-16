/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { shouldRunFreeTierShipReviewSeed as isPrPreviewDatabase } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';
import { seedLoungeLaunch } from './seed';

/**
 * Stand-in YAWP! team authors for PR previews. No password, so nobody can
 * sign in as them; they exist only so the launch posts have bylines.
 */
export const PREVIEW_LOUNGE_AUTHORS = {
  brian: { email: 'lounge-brian@preview.yawp.invalid', name: 'Brian C.' },
  kevin: { email: 'lounge-kevin@preview.yawp.invalid', name: 'Kevin G.' },
} as const;

/** PR previews (`yawp_pr_<n>`) open with Brian's launch content in the Lounge. */
export async function ensureLoungeLaunchContentForPreview(
  prisma: Pick<PrismaClient, 'user' | 'loungePost' | 'loungeReply' | '$transaction'>,
  databaseName: string
) {
  if (!isPrPreviewDatabase(databaseName)) return { skipped: true as const };
  const [brian, kevin] = await Promise.all(
    [PREVIEW_LOUNGE_AUTHORS.brian, PREVIEW_LOUNGE_AUTHORS.kevin].map((author) =>
      prisma.user.upsert({
        where: { email: author.email },
        create: { ...author, isAdmin: true },
        update: {},
        select: { id: true },
      })
    )
  );
  const result = await seedLoungeLaunch(prisma, { brianUserId: brian.id, kevinUserId: kevin.id });
  console.log(`Faculty Lounge launch content: ${result.created.length} created, ${result.skipped.length} already there`);
  return { created: result.created.length, skipped: result.skipped.length };
}
