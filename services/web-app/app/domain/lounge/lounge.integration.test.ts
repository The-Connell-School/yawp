// Real-database round trip for the Teacher's Lounge community board.
//   LOUNGE_DB_TESTS=1 DATABASE_URL=... bun test app/domain/lounge/lounge.integration.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const enabled = process.env.LOUNGE_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;

type DbPrisma = typeof import('~/utils/db.server').prisma;
let prisma: DbPrisma;
let lounge: typeof import('./lounge.server');

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ids = {
  orgA: '',
  orgB: '',
  maria: '',
  devin: '',
  brian: '',
  student: '',
};

async function makeUser(name: string, opts: { isAdmin?: boolean; orgId: string; role: 'TEACHER' | 'STUDENT' }) {
  const user = await prisma.user.create({
    data: {
      name,
      email: `lounge-${name.toLowerCase().replace(/\s+/g, '.')}-${stamp}@yawp.test`,
      isAdmin: opts.isAdmin ?? false,
      memberships: { create: { organizationId: opts.orgId, role: opts.role } },
    },
    select: { id: true },
  });
  return user.id;
}

suite('Teacher Lounge against the database', () => {
  beforeAll(async () => {
    ({ prisma } = await import('~/utils/db.server'));
    lounge = await import('./lounge.server');
    ids.orgA = (await prisma.organization.create({ data: { name: `Cristo Rey ${stamp}` } })).id;
    ids.orgB = (await prisma.organization.create({ data: { name: `St. Ignatius ${stamp}` } })).id;
    ids.maria = await makeUser('Maria Santos', { orgId: ids.orgA, role: 'TEACHER' });
    ids.devin = await makeUser('Devin Reyes', { orgId: ids.orgB, role: 'TEACHER' });
    ids.brian = await makeUser('Brian Connell', { orgId: ids.orgA, role: 'TEACHER', isAdmin: true });
    ids.student = await makeUser('Sam Student', { orgId: ids.orgA, role: 'STUDENT' });
    await lounge.acceptLoungeGuidelines(ids.maria, 'FIRST_NAME_LAST_INITIAL');
    await lounge.acceptLoungeGuidelines(ids.devin, 'FIRST_NAME_ONLY');
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = [ids.maria, ids.devin, ids.brian, ids.student].filter(Boolean);
    await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } });
  });

  const maria = () => ({ userId: ids.maria, isStaff: false });
  const devin = () => ({ userId: ids.devin, isStaff: false });
  const brian = () => ({ userId: ids.brian, isStaff: true });

  test('a question asked of the Yawp team waits in the staff inbox and shows in the feed', async () => {
    const { postId, notifications } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgA,
      membershipId: null,
      input: {
        kind: 'QUESTION',
        topic: 'daily-pages',
        title: `Pacing Daily Pages ${stamp}`,
        body: 'We lose ten minutes settling in.',
        askStaff: true,
        askPrivately: false,
      },
    });
    expect(notifications).toEqual([
      expect.objectContaining({ kind: 'staff-request', postId, isPrivate: false }),
    ]);

    const inbox = await lounge.listLoungeStaffInbox();
    expect(inbox.waiting.map((item) => item.id)).toContain(postId);

    const feed = await lounge.listLoungePosts(devin(), { sort: 'new' });
    const summary = feed.posts.find((post) => post.id === postId);
    expect(summary).toMatchObject({
      kind: 'QUESTION',
      topicLabel: 'Daily Pages',
      author: { name: 'Maria S.', detail: `Cristo Rey ${stamp}` },
      replyCount: 0,
      helpfulCount: 0,
      staffAnswered: false,
      viewerVoted: false,
    });

    const unanswered = await lounge.listLoungePosts(devin(), { sort: 'unanswered' });
    expect(unanswered.posts.map((post) => post.id)).toContain(postId);
  });

  test('a staff reply answers the question, notifies the asker, and leaves the inbox', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgA,
      membershipId: null,
      input: { kind: 'QUESTION', topic: 'grading', title: `Rubric help ${stamp}`, body: 'How?', askStaff: true, askPrivately: false },
    });
    const { notifications } = await lounge.createLoungeReply({
      viewer: brian(),
      organizationId: ids.orgA,
      postId,
      input: { body: 'Twelve minutes.', videoUrl: 'https://www.loom.com/share/abc' },
    });
    expect(notifications).toEqual([
      expect.objectContaining({ kind: 'reply', toUserId: ids.maria, actorIsStaff: true, postId }),
    ]);

    const thread = await lounge.getLoungeThread(devin(), postId);
    expect(thread?.staffReplies).toHaveLength(1);
    expect(thread?.staffReplies[0]).toMatchObject({
      author: { name: 'Brian Connell', detail: 'Yawp team' },
      videoUrl: 'https://www.loom.com/share/abc',
    });
    expect(thread?.replies).toHaveLength(0);

    const inbox = await lounge.listLoungeStaffInbox();
    expect(inbox.waiting.map((item) => item.id)).not.toContain(postId);

    const feed = await lounge.listLoungePosts(devin(), { sort: 'new' });
    expect(feed.posts.find((post) => post.id === postId)?.staffAnswered).toBe(true);
  });

  test('a private question is visible only to its author and the Yawp team', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgA,
      membershipId: null,
      input: { kind: 'QUESTION', topic: 'grading', title: `Private rubric ${stamp}`, body: 'One student.', askStaff: true, askPrivately: true },
    });
    expect(await lounge.getLoungeThread(devin(), postId)).toBeNull();
    expect(await lounge.getLoungeThread(maria(), postId)).not.toBeNull();
    expect(await lounge.getLoungeThread(brian(), postId)).not.toBeNull();
    const devinFeed = await lounge.listLoungePosts(devin(), { sort: 'new' });
    expect(devinFeed.posts.map((post) => post.id)).not.toContain(postId);
    const mariaFeed = await lounge.listLoungePosts(maria(), { sort: 'new' });
    expect(mariaFeed.posts.find((post) => post.id === postId)?.isPrivate).toBe(true);
  });

  test('mentioning Brian in a reply reopens the request; mentioning a stranger does nothing', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgA,
      membershipId: null,
      input: { kind: 'SHARE', topic: 'writing-lessons', title: `Checklist ${stamp}`, body: 'Here it is.', askStaff: false, askPrivately: false },
    });
    const { notifications } = await lounge.createLoungeReply({
      viewer: devin(),
      organizationId: ids.orgB,
      postId,
      input: {
        body: `@[Brian Connell](user:${ids.brian}) and @[Sam](user:${ids.student}) thoughts?`,
        videoUrl: null,
      },
    });
    expect(notifications.map((n) => [n.kind, 'toUserId' in n ? n.toUserId : null])).toEqual([
      ['reply', ids.maria],
      ['mention', ids.brian],
    ]);
    const mentions = await prisma.loungeMention.findMany({ where: { postId }, select: { mentionedUserId: true } });
    expect(mentions.map((m) => m.mentionedUserId)).toEqual([ids.brian]);
    const inbox = await lounge.listLoungeStaffInbox();
    expect(inbox.waiting.map((item) => item.id)).toContain(postId);
  });

  test('helpful votes toggle and are counted once per teacher', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgA,
      membershipId: null,
      input: { kind: 'WIN', topic: 'other', title: `A win ${stamp}`, body: 'She revised on her own.', askStaff: false, askPrivately: false },
    });
    expect(await lounge.toggleLoungeVote(devin(), { postId })).toEqual({ voted: true });
    expect(await lounge.toggleLoungeVote(brian(), { postId })).toEqual({ voted: true });
    expect(await lounge.toggleLoungeVote(devin(), { postId })).toEqual({ voted: false });
    expect(await lounge.toggleLoungeVote(maria(), { postId })).toEqual({ voted: false });
    const feed = await lounge.listLoungePosts(devin(), { sort: 'top' });
    expect(feed.posts.find((post) => post.id === postId)).toMatchObject({ helpfulCount: 1, viewerVoted: false });
  });

  test('a reported post leaves the feed once the Yawp team hides it', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: devin(),
      organizationId: ids.orgB,
      membershipId: null,
      input: { kind: 'SHARE', topic: 'other', title: `Selling stuff ${stamp}`, body: 'Buy my course.', askStaff: false, askPrivately: false },
    });
    await lounge.reportLoungeContent(maria(), { postId, reason: 'Selling' });
    const inbox = await lounge.listLoungeStaffInbox();
    const report = inbox.reports.find((item) => item.postId === postId);
    expect(report).toMatchObject({ reason: 'Selling', postTitle: `Selling stuff ${stamp}` });
    await lounge.hideLoungeContent(ids.brian, { postId });
    const feed = await lounge.listLoungePosts(maria(), { sort: 'new' });
    expect(feed.posts.map((post) => post.id)).not.toContain(postId);
    const after = await lounge.listLoungeStaffInbox();
    expect(after.reports.map((item) => item.postId)).not.toContain(postId);
  });

  test('authors can delete their own replies and posts, and no one else can', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgA,
      membershipId: null,
      input: { kind: 'SHARE', topic: 'other', title: `Delete me ${stamp}`, body: 'Oops.', askStaff: false, askPrivately: false },
    });
    const { replyId } = await lounge.createLoungeReply({ viewer: devin(), organizationId: ids.orgB, postId, input: { body: 'Nice', videoUrl: null } });
    expect(await lounge.deleteOwnLoungeReply(maria(), replyId)).toBe(false);
    expect(await lounge.deleteOwnLoungeReply(devin(), replyId)).toBe(true);
    expect((await lounge.getLoungeThread(maria(), postId))?.replies).toHaveLength(0);
    expect(await lounge.deleteOwnLoungePost(devin(), postId)).toBe(false);
    expect(await lounge.deleteOwnLoungePost(maria(), postId)).toBe(true);
    expect(await lounge.getLoungeThread(maria(), postId)).toBeNull();
  });

  test('mention candidates are the Yawp team first, then people in the thread', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgA,
      membershipId: null,
      input: { kind: 'QUESTION', topic: 'other', title: `Who to ask ${stamp}`, body: 'Anyone?', askStaff: false, askPrivately: false },
    });
    await lounge.createLoungeReply({ viewer: devin(), organizationId: ids.orgB, postId, input: { body: 'Me', videoUrl: null } });
    const candidates = await lounge.listMentionCandidates(maria(), postId);
    const brianIndex = candidates.findIndex((c) => c.userId === ids.brian);
    const devinIndex = candidates.findIndex((c) => c.userId === ids.devin);
    expect(brianIndex).toBeGreaterThanOrEqual(0);
    expect(devinIndex).toBeGreaterThan(brianIndex);
    expect(candidates[devinIndex]).toMatchObject({ label: 'Devin', detail: null });
    expect(candidates.some((c) => c.userId === ids.maria)).toBe(false);
  });
});
