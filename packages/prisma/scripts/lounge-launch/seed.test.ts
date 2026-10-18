import { describe, expect, test } from 'bun:test';
import { HOPPER, HOUSE_RULES, LAUNCH_POSTS, LAUNCH_QUESTIONS, WELCOME, type LaunchPost } from './content';
import { hasLaunchPlaceholder, moveLaunchTopics, seedLoungeLaunch } from './seed';

type Row = Record<string, any>;

function fakePrisma(existingSeedKeys: string[] = []) {
  const posts: Row[] = [];
  const replies: Row[] = [];
  const tx = {
    loungePost: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `post-${posts.length + 1}`, ...data };
        posts.push(row);
        return { id: row.id };
      },
    },
    loungeReply: {
      create: async ({ data }: { data: Row }) => {
        replies.push(data);
        return {};
      },
    },
  };
  const prisma = {
    loungePost: {
      findMany: async () => existingSeedKeys.map((seedKey) => ({ seedKey })),
    },
    loungeReply: tx.loungeReply,
    $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  } as any;
  return { prisma, posts, replies };
}

const now = new Date('2026-10-20T12:00:00Z');
const people = { brianUserId: 'brian', teamUserId: 'team', now };

describe('Faculty Lounge launch content', () => {
  test('nothing is posted under a staff member other than Brian', () => {
    expect(new Set(LAUNCH_POSTS.map((p) => p.author))).toEqual(new Set(['brian', 'team']));
    for (const post of HOPPER.filter((p) => p.kind === 'QUESTION')) expect(post.author).toBe('team');
  });

  test('every seed key is unique', () => {
    const keys = LAUNCH_POSTS.flatMap((p) => [p.seedKey, ...(p.answer ? [p.answer.seedKey] : [])]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("nothing that goes live has Brian's [placeholders] in it", () => {
    for (const post of LAUNCH_POSTS.filter((p) => !p.draft)) {
      expect(hasLaunchPlaceholder(post.body)).toBe(false);
      expect(hasLaunchPlaceholder(post.answer?.body ?? '')).toBe(false);
    }
    expect(hasLaunchPlaceholder(HOPPER.find((p) => p.seedKey === 'hopper:lessons-learned')!.body)).toBe(true);
  });

  test('the six launch questions come from the YAWP! team and each has an answer from Brian', () => {
    expect(LAUNCH_QUESTIONS).toHaveLength(6);
    for (const q of LAUNCH_QUESTIONS) {
      expect(q).toMatchObject({ author: 'team', kind: 'QUESTION' });
      expect(q.answer?.body.length).toBeGreaterThan(100);
    }
  });
});

describe('seedLoungeLaunch', () => {
  test('creates the launch posts, pins the welcome above the House Rules, and answers each question', async () => {
    const { prisma, posts, replies } = fakePrisma();
    const result = await seedLoungeLaunch(prisma, people);

    expect(result.created).toHaveLength(LAUNCH_POSTS.length);
    expect(result.drafts).toEqual(HOPPER.map((p) => p.seedKey));

    const welcome = posts.find((p) => p.seedKey === WELCOME.seedKey)!;
    const rules = posts.find((p) => p.seedKey === HOUSE_RULES.seedKey)!;
    expect(welcome).toMatchObject({ authorUserId: 'brian', title: 'Welcome to the Faculty Lounge', draft: false });
    expect(welcome.pinnedAt.getTime()).toBeLessThan(rules.pinnedAt.getTime());
    expect(posts.filter((p) => p.pinnedAt)).toHaveLength(2);

    const q1 = posts.find((p) => p.seedKey === 'launch:q1-routine')!;
    expect(q1).toMatchObject({ authorUserId: 'team', staffStatus: 'ANSWERED', body: '' });
    const answer = replies.find((r) => r.postId === q1.id)!;
    expect(answer).toMatchObject({ authorUserId: 'brian', isStaff: true, seedKey: 'launch:q1-routine:brian' });
    expect(answer.createdAt.getTime()).toBeGreaterThan(q1.createdAt.getTime());
    expect(replies).toHaveLength(6);

    // Newest first in the feed reads in Brian's order; everything is in the past; drafts wait.
    const live = posts.filter((p) => !p.draft);
    for (let i = 1; i < live.length; i++) {
      expect(live[i].createdAt.getTime()).toBeLessThan(live[i - 1].createdAt.getTime());
    }
    expect(Math.max(...replies.map((r) => r.createdAt.getTime()))).toBeLessThanOrEqual(now.getTime());
    expect(posts.filter((p) => p.draft).map((p) => p.seedKey)).toEqual(HOPPER.map((p) => p.seedKey));
  });

  test('seeding again leaves existing posts alone', async () => {
    const { prisma, posts } = fakePrisma([WELCOME.seedKey, 'launch:q1-routine']);
    const result = await seedLoungeLaunch(prisma, people);
    expect(result.skipped).toEqual([WELCOME.seedKey, 'launch:q1-routine']);
    expect(posts.map((p) => p.seedKey)).not.toContain(WELCOME.seedKey);
    expect(posts).toHaveLength(LAUNCH_POSTS.length - 2);
  });

  test('refuses to publish a post that still has placeholder text', async () => {
    const { prisma, posts } = fakePrisma();
    const unfinished: LaunchPost = { ...HOPPER[4], draft: false };
    await expect(seedLoungeLaunch(prisma, { ...people, posts: [WELCOME, unfinished] })).rejects.toThrow(
      'still has placeholder text'
    );
    expect(posts).toHaveLength(0);
  });
});

describe('Lessons Learned moves to its own topic', () => {
  test('the hopper post is filed under Lessons learned', () => {
    expect(HOPPER.find((p) => p.seedKey === 'hopper:lessons-learned')?.topic).toBe('lessons-learned');
  });

  test('a copy seeded before the topic existed moves over, and only if nobody re-filed it', async () => {
    const calls: Row[] = [];
    const prisma = {
      loungePost: {
        updateMany: async (args: Row) => {
          calls.push(args);
          return { count: 1 };
        },
      },
    } as any;
    expect(await moveLaunchTopics(prisma)).toEqual(['hopper:lessons-learned']);
    expect(calls).toEqual([
      {
        where: { seedKey: 'hopper:lessons-learned', topic: 'other' },
        data: { topic: 'lessons-learned' },
      },
    ]);
  });

  test('running it again changes nothing', async () => {
    const prisma = { loungePost: { updateMany: async () => ({ count: 0 }) } } as any;
    expect(await moveLaunchTopics(prisma)).toEqual([]);
  });
});
