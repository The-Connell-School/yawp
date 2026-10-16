/* eslint-disable no-console */
/**
 * Puts Brian's Faculty Lounge launch content into a database, once.
 *
 *   LOUNGE_SEED_BRIAN_EMAIL=... LOUNGE_SEED_KEVIN_EMAIL=... \
 *     bun run seed-lounge-launch            # dry run: shows what would be created
 *   ... bun run seed-lounge-launch --yes    # creates it
 *
 * Create-only by seed key: posts already there (and any edits made to them
 * in the app) are never touched. Both authors must be YAWP! team accounts.
 * The hopper goes in as drafts for the team to finish and schedule.
 */
import { createPrismaClient } from './local-dev/connection';
import { LAUNCH_POSTS } from './lounge-launch/content';
import { seedLoungeLaunch } from './lounge-launch/seed';

const brianEmail = process.env.LOUNGE_SEED_BRIAN_EMAIL?.trim().toLowerCase();
const kevinEmail = process.env.LOUNGE_SEED_KEVIN_EMAIL?.trim().toLowerCase();
if (!brianEmail || !kevinEmail) {
  console.error('Set LOUNGE_SEED_BRIAN_EMAIL and LOUNGE_SEED_KEVIN_EMAIL to the two YAWP! team accounts.');
  process.exit(1);
}
const confirmed = process.argv.includes('--yes');
const prisma = createPrismaClient();

try {
  const authors = await prisma.user.findMany({
    where: { email: { in: [brianEmail, kevinEmail], mode: 'insensitive' } },
    select: { id: true, email: true, isAdmin: true },
  });
  const find = (email: string) => authors.find((u) => u.email?.toLowerCase() === email);
  const brian = find(brianEmail);
  const kevin = find(kevinEmail);
  for (const [label, email, user] of [['Brian', brianEmail, brian], ['Kevin', kevinEmail, kevin]] as const) {
    if (!user) throw new Error(`No account for ${label} (${email}).`);
    if (!user.isAdmin) throw new Error(`${label} (${email}) is not on the YAWP! team (isAdmin).`);
  }

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
    console.log(`  ${state.padEnd(13)} ${post.title}`);
  }

  if (!confirmed) {
    console.log('\nDry run. Re-run with --yes to create the posts marked new.');
  } else {
    const result = await seedLoungeLaunch(prisma, { brianUserId: brian!.id, kevinUserId: kevin!.id });
    console.log(`\nCreated ${result.created.length} (${result.drafts.length} drafts); left ${result.skipped.length} alone.`);
  }
} finally {
  await prisma.$disconnect();
}
