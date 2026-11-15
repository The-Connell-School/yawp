/* eslint-disable no-console */
/**
 * Puts Brian's Faculty Lounge launch content into a database, once.
 *
 *   LOUNGE_SEED_BRIAN_EMAIL=... bun run seed-lounge-launch          # dry run: shows what would be created
 *   LOUNGE_SEED_BRIAN_EMAIL=... bun run seed-lounge-launch --yes    # creates it
 *
 * Create-only by seed key: posts already there (and any edits made to them
 * in the app) are never touched. Brian must be a YAWP! team account. The
 * launch questions are posted from the shared "YAWP! team" account, which
 * --yes creates if it is missing (no password; see team-account.ts). The
 * hopper goes in as drafts for the team to finish and schedule.
 */
import { createPrismaClient } from './local-dev/connection';
import { LAUNCH_POSTS } from './lounge-launch/content';
import { seedLoungeLaunch } from './lounge-launch/seed';
import { LOUNGE_TEAM_ACCOUNT, ensureLoungeTeamAccount, findLoungeTeamAccount } from './lounge-launch/team-account';

const brianEmail = process.env.LOUNGE_SEED_BRIAN_EMAIL?.trim().toLowerCase();
if (!brianEmail) {
  console.error("Set LOUNGE_SEED_BRIAN_EMAIL to Brian's YAWP! team account.");
  process.exit(1);
}
const confirmed = process.argv.includes('--yes');
const prisma = createPrismaClient();

try {
  const brian = await prisma.user.findFirst({
    where: { email: { equals: brianEmail, mode: 'insensitive' } },
    select: { id: true, isAdmin: true },
  });
  if (!brian) throw new Error(`No account for Brian (${brianEmail}).`);
  if (!brian.isAdmin) throw new Error(`Brian (${brianEmail}) is not on the YAWP! team (isAdmin).`);

  const team = await findLoungeTeamAccount(prisma);
  console.log(
    team
      ? `  Team account ${LOUNGE_TEAM_ACCOUNT.email} already there.`
      : `  Team account ${LOUNGE_TEAM_ACCOUNT.email} ("${LOUNGE_TEAM_ACCOUNT.name}", no password) will be created.`
  );
  const existing = new Set(
    (
      await prisma.loungePost.findMany({
        where: { seedKey: { in: LAUNCH_POSTS.map((p) => p.seedKey) } },
        select: { seedKey: true },
      })
    ).map((p) => p.seedKey)
  );
  for (const post of LAUNCH_POSTS) {
    const state = existing.has(post.seedKey) ? 'already there' : post.draft ? 'new draft' : 'new, live';
    const by = post.author === 'brian' ? 'Brian' : LOUNGE_TEAM_ACCOUNT.name;
    console.log(`  ${state.padEnd(13)} ${post.title}  (${by})`);
  }

  if (!confirmed) {
    console.log('\nDry run. Re-run with --yes to create the posts marked new.');
  } else {
    const { id: teamUserId } = await ensureLoungeTeamAccount(prisma);
    const result = await seedLoungeLaunch(prisma, { brianUserId: brian.id, teamUserId });
    console.log(`\nCreated ${result.created.length} (${result.drafts.length} drafts); left ${result.skipped.length} alone.`);
  }
} finally {
  await prisma.$disconnect();
}
