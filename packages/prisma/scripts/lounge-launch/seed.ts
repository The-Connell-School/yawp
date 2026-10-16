import type { PrismaClient } from '../../generated/prisma';
import { LAUNCH_POSTS, type LaunchAuthor, type LaunchPost } from './content';

export { LAUNCH_POSTS } from './content';
export type { LaunchPost } from './content';

/** Same rule as hasPlaceholderText in the web app: "[like this]" but not a markdown link. */
export function hasLaunchPlaceholder(body: string): boolean {
  return /\[[^\]\n]{3,}\](?!\()/.test(body);
}

export type LoungeLaunchSeedOptions = {
  brianUserId: string;
  kevinUserId: string;
  now?: Date;
  posts?: LaunchPost[];
};

export type LoungeLaunchSeedResult = {
  created: string[];
  skipped: string[];
  drafts: string[];
};

type SeedPrisma = Pick<PrismaClient, 'loungePost' | 'loungeReply' | '$transaction'>;

const MINUTE = 60_000;

/**
 * Seeds the Faculty Lounge launch content. Create-only by seedKey: anything
 * already there (including edits made in the app, or a post the team
 * deleted) is left alone. Live posts go up two minutes apart so the newest-first
 * feed keeps Brian's order; the hopper goes in as drafts for the team to finish and
 * schedule from the inbox. A live post may never carry [placeholder] text.
 */
export async function seedLoungeLaunch(
  prisma: SeedPrisma,
  { brianUserId, kevinUserId, now = new Date(), posts = LAUNCH_POSTS }: LoungeLaunchSeedOptions
): Promise<LoungeLaunchSeedResult> {
  for (const post of posts) {
    if (!post.draft && (hasLaunchPlaceholder(post.body) || hasLaunchPlaceholder(post.answer?.body ?? ''))) {
      throw new Error(`Launch post ${post.seedKey} still has placeholder text; make it a draft or fill it in.`);
    }
  }

  const authorId = (author: LaunchAuthor) => (author === 'brian' ? brianUserId : kevinUserId);
  const existing = new Set(
    (
      await prisma.loungePost.findMany({
        where: { seedKey: { in: posts.map((p) => p.seedKey) } },
        select: { seedKey: true },
      })
    ).map((p) => p.seedKey)
  );

  const result: LoungeLaunchSeedResult = { created: [], skipped: [], drafts: [] };
  const live = posts.filter((p) => !p.draft);
  const pinned = posts.filter((p) => p.pin && !p.draft);

  await prisma.$transaction(async (tx) => {
    for (const post of posts) {
      if (existing.has(post.seedKey)) {
        result.skipped.push(post.seedKey);
        continue;
      }
      // The feed shows newest first, so the first live post is the newest:
      // the launch questions read top to bottom in Brian's order.
      const liveIndex = live.indexOf(post);
      const createdAt = post.draft ? now : new Date(now.getTime() - (liveIndex + 1) * 2 * MINUTE);
      const pinIndex = pinned.indexOf(post);
      const answered = Boolean(post.answer);
      const created = await tx.loungePost.create({
        data: {
          seedKey: post.seedKey,
          authorUserId: authorId(post.author),
          organizationId: null,
          kind: post.kind,
          topic: post.topic,
          title: post.title,
          body: post.body,
          draft: Boolean(post.draft),
          createdAt,
          ...(pinIndex >= 0
            ? { pinnedAt: new Date(now.getTime() - (pinned.length - pinIndex) * 1000), pinnedByUserId: brianUserId }
            : {}),
          ...(answered
            ? { staffStatus: 'ANSWERED', staffRequestedAt: createdAt, staffAnsweredAt: new Date(createdAt.getTime() + MINUTE) }
            : {}),
        },
        select: { id: true },
      });
      if (post.answer) {
        await tx.loungeReply.create({
          data: {
            seedKey: post.answer.seedKey,
            postId: created.id,
            authorUserId: brianUserId,
            organizationId: null,
            body: post.answer.body,
            isStaff: true,
            createdAt: new Date(createdAt.getTime() + MINUTE),
          },
        });
      }
      result.created.push(post.seedKey);
      if (post.draft) result.drafts.push(post.seedKey);
    }
  });

  return result;
}
