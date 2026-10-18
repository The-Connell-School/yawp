// Real-database checks for Brian's round 6 Lounge changes: posts with no
// topic, Attach from YAWP! only on a shared assignment, and next/previous.
//   LOUNGE_DB_TESTS=1 DATABASE_URL=... bun test app/domain/lounge/lounge-round-6.integration.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const enabled = process.env.LOUNGE_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;

type DbPrisma = typeof import('~/utils/db.server').prisma;
let prisma: DbPrisma;
let lounge: typeof import('./lounge.server');

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ids = { org: '', maria: '', devin: '', brian: '' };

// Posts for the next/previous checks sit on their own stretch of time, far
// from anything else in a shared test database.
const timeBase = Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 3_000_000) * 60_000;
const at = (hour: number) => new Date(timeBase + hour * 3_600_000);

async function makeUser(name: string, isAdmin = false) {
  const user = await prisma.user.create({
    data: {
      name,
      email: `lounge-r6-${name.toLowerCase().replace(/\s+/g, '.')}-${stamp}@yawp.test`,
      isAdmin,
      memberships: { create: { organizationId: ids.org, role: 'TEACHER' } },
    },
    select: { id: true },
  });
  return user.id;
}

suite('Faculty Lounge round 6 against the database', () => {
  beforeAll(async () => {
    ({ prisma } = await import('~/utils/db.server'));
    lounge = await import('./lounge.server');
    ids.org = (await prisma.organization.create({ data: { name: `Round Six ${stamp}` } })).id;
    ids.maria = await makeUser('Maria Round');
    ids.devin = await makeUser('Devin Round');
    ids.brian = await makeUser('Brian Round', true);
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = [ids.maria, ids.devin, ids.brian].filter(Boolean);
    await prisma.loungePost.deleteMany({ where: { authorUserId: { in: users } } });
    await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
  });

  const maria = () => ({ userId: ids.maria, isStaff: false });
  const devin = () => ({ userId: ids.devin, isStaff: false });
  const brian = () => ({ userId: ids.brian, isStaff: true });

  test('a post with no topic is in the feed but not in the topic counts', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.org,
      membershipId: null,
      input: { kind: 'QUESTION', topic: null, title: `No topic ${stamp}`, body: 'Hi.', askStaff: false, askPrivately: false },
    });
    const feed = await lounge.listLoungePosts(devin(), { sort: 'new' });
    expect(feed.posts.find((post) => post.id === postId)).toMatchObject({ topic: null, topicLabel: null });
    const counts = await lounge.listLoungeTopicCounts(devin());
    expect(counts.every((count) => count.topic !== null)).toBe(true);
  });

  test('only a shared assignment carries an attachment; on a question it is ignored', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.org,
      membershipId: null,
      input: {
        kind: 'QUESTION',
        topic: 'other',
        title: `Question with a sneaky attachment ${stamp}`,
        body: 'Hi.',
        askStaff: false,
        askPrivately: false,
        attachAssignmentId: 'not-an-assignment',
      },
    });
    const thread = await lounge.getLoungeThread(maria(), postId);
    expect(thread?.post.attachment).toBeNull();

    await expect(
      lounge.createLoungePost({
        viewer: maria(),
        organizationId: ids.org,
        membershipId: null,
        input: {
          kind: 'SHARE',
          topic: 'other',
          title: `Share with someone else's assignment ${stamp}`,
          body: 'Hi.',
          askStaff: false,
          askPrivately: false,
          attachAssignmentId: 'not-an-assignment',
        },
      })
    ).rejects.toBeInstanceOf(lounge.LoungeShareError);
  });

  test('next goes to the next older post and previous to the next newer, skipping what the reader cannot see', async () => {
    const make = async (title: string, hour: number, extra: Record<string, unknown> = {}) =>
      (
        await prisma.loungePost.create({
          data: {
            authorUserId: ids.maria,
            organizationId: ids.org,
            kind: 'QUESTION',
            topic: 'grading',
            title: `${title} ${stamp}`,
            body: `${title} body`,
            createdAt: at(hour),
            ...extra,
          },
          select: { id: true, createdAt: true },
        })
      );
    const a = await make('A', 0);
    await make('hidden', 1, { hiddenAt: new Date() });
    await make('deleted', 2, { deletedAt: new Date() });
    await make('draft', 3, { draft: true });
    await make('private', 4, { visibility: 'STAFF_ONLY' });
    const b = await make('B', 5);
    const c = await make('C', 6);

    const middle = await lounge.getAdjacentLoungePosts(devin(), b);
    expect(middle.next).toMatchObject({ id: a.id, title: `A ${stamp}`, excerpt: 'A body' });
    expect(middle.previous).toMatchObject({ id: c.id, title: `C ${stamp}` });

    // Maria wrote the private one, so she reads it in order.
    const forAuthor = await lounge.getAdjacentLoungePosts(maria(), b);
    expect(forAuthor.next?.title).toBe(`private ${stamp}`);

    // Same order as the feed for the YAWP! team: hidden and other people's
    // private posts stay out of it, as they do in the feed.
    const forStaff = await lounge.getAdjacentLoungePosts(brian(), b);
    expect(forStaff.next?.id).toBe(a.id);
  });

  test('two posts at the same moment still have an order', async () => {
    const when = at(100);
    const first = await prisma.loungePost.create({
      data: { authorUserId: ids.maria, organizationId: ids.org, kind: 'WIN', topic: 'other', title: `Tie 1 ${stamp}`, body: 'x', createdAt: when },
      select: { id: true, createdAt: true },
    });
    const second = await prisma.loungePost.create({
      data: { authorUserId: ids.maria, organizationId: ids.org, kind: 'WIN', topic: 'other', title: `Tie 2 ${stamp}`, body: 'x', createdAt: when },
      select: { id: true, createdAt: true },
    });
    const [lower, higher] = first.id < second.id ? [first, second] : [second, first];
    expect((await lounge.getAdjacentLoungePosts(devin(), higher)).next?.id).toBe(lower.id);
    expect((await lounge.getAdjacentLoungePosts(devin(), lower)).previous?.id).toBe(higher.id);
  });
});

suite('Faculty Lounge images against the database', () => {
  let prisma: DbPrisma;
  let lounge: typeof import('./lounge.server');
  const local = { org: '', maria: '', devin: '' };
  // PNG signature and an IEND chunk: the smallest PNG the metadata stripper keeps whole.
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  beforeAll(async () => {
    ({ prisma } = await import('~/utils/db.server'));
    lounge = await import('./lounge.server');
    local.org = (await prisma.organization.create({ data: { name: `Images ${stamp}` } })).id;
    for (const name of ['maria', 'devin'] as const) {
      local[name] = (
        await prisma.user.create({
          data: {
            name: `${name} Images`,
            email: `lounge-img-${name}-${stamp}@yawp.test`,
            memberships: { create: { organizationId: local.org, role: 'TEACHER' } },
          },
          select: { id: true },
        })
      ).id;
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = [local.maria, local.devin].filter(Boolean);
    await prisma.loungePost.deleteMany({ where: { authorUserId: { in: users } } });
    await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: local.org } });
  });

  const post = (kind: 'QUESTION' | 'SHARE' | 'WIN') =>
    lounge.createLoungePost({
      viewer: { userId: local.maria, isStaff: false },
      organizationId: local.org,
      membershipId: null,
      input: {
        kind,
        topic: null,
        title: `${kind} with a screenshot ${stamp}`,
        body: 'See the picture.',
        askStaff: false,
        askPrivately: false,
        images: [
          { contentType: 'image/png', bytes: png, altText: 'The grading screen' },
          { contentType: 'image/png', bytes: png, altText: 'The grading screen, scrolled' },
        ],
      },
    });

  test('a question keeps its images in order, and readers of the post can open them', async () => {
    const { postId } = await post('QUESTION');
    const thread = await lounge.getLoungeThread({ userId: local.devin, isStaff: false }, postId);
    expect(thread?.post.images.map((image) => image.altText)).toEqual([
      'The grading screen',
      'The grading screen, scrolled',
    ]);
    const image = await lounge.getVisibleLoungeImage({ userId: local.devin, isStaff: false }, thread!.post.images[0]!.id);
    expect(image).toMatchObject({ contentType: 'image/png', byteSize: png.length });
  });

  test('a shared assignment takes no images', async () => {
    const { postId } = await post('SHARE');
    const thread = await lounge.getLoungeThread({ userId: local.maria, isStaff: false }, postId);
    expect(thread?.post.images).toEqual([]);
  });

  test('once the team hides the post, teachers cannot open its images', async () => {
    const { postId } = await post('WIN');
    const thread = await lounge.getLoungeThread({ userId: local.devin, isStaff: false }, postId);
    const imageId = thread!.post.images[0]!.id;
    await prisma.loungePost.update({ where: { id: postId }, data: { hiddenAt: new Date() } });
    expect(await lounge.getVisibleLoungeImage({ userId: local.devin, isStaff: false }, imageId)).toBeNull();
    expect(await lounge.getVisibleLoungeImage({ userId: local.devin, isStaff: true }, imageId)).not.toBeNull();
  });
});
