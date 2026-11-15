/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { shouldRunFreeTierShipReviewSeed as isPrPreviewDatabase } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';
import { LAUNCH_POSTS } from './content';
import { seedLoungeLaunch } from './seed';
import { ensureLoungeTeamAccount } from './team-account';

/**
 * Stand-in for Brian in PR previews. No password, so nobody can sign in as
 * him; he exists only so the welcome letter and answers have a byline.
 */
export const PREVIEW_LOUNGE_BRIAN = { email: 'lounge-brian@preview.yawp.invalid', name: 'Brian C.' } as const;

/** Earlier previews posted the launch questions from a "Kevin G." stand-in. */
const OLD_PREVIEW_KEVIN_EMAIL = 'lounge-kevin@preview.yawp.invalid';

/** PR previews (`yawp_pr_<n>`) open with Brian's launch content in the Lounge. */
export async function ensureLoungeLaunchContentForPreview(
  prisma: Pick<PrismaClient, 'user' | 'loungePost' | 'loungeReply' | '$transaction'>,
  databaseName: string
) {
  if (!isPrPreviewDatabase(databaseName)) return { skipped: true as const };
  const brian = await prisma.user.upsert({
    where: { email: PREVIEW_LOUNGE_BRIAN.email },
    create: { ...PREVIEW_LOUNGE_BRIAN, isAdmin: true },
    update: {},
    select: { id: true },
  });
  const team = await ensureLoungeTeamAccount(prisma);
  // Move launch posts an earlier preview put under "Kevin G." to the team account.
  const oldKevin = await prisma.user.findUnique({ where: { email: OLD_PREVIEW_KEVIN_EMAIL }, select: { id: true } });
  const moved = oldKevin
    ? (
        await prisma.loungePost.updateMany({
          where: { authorUserId: oldKevin.id, seedKey: { in: LAUNCH_POSTS.map((p) => p.seedKey) } },
          data: { authorUserId: team.id },
        })
      ).count
    : 0;
  const result = await seedLoungeLaunch(prisma, { brianUserId: brian.id, teamUserId: team.id });
  console.log(
    `Faculty Lounge launch content: ${result.created.length} created, ${result.skipped.length} already there, ${moved} moved to the team account`
  );
  return { created: result.created.length, skipped: result.skipped.length, moved };
}
