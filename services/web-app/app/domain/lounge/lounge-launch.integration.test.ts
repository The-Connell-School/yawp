// Real-database round trip for the Faculty Lounge launch features.
//   LOUNGE_DB_TESTS=1 DATABASE_URL=... bun test app/domain/lounge/lounge-launch.integration.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const enabled = process.env.LOUNGE_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;

type DbPrisma = typeof import('~/utils/db.server').prisma;
let prisma: DbPrisma;
let lounge: typeof import('./lounge.server');

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ids = { org: '', maria: '', devin: '', brian: '', team: '' };
const maria = () => ({ userId: ids.maria, isStaff: false });
const devin = () => ({ userId: ids.devin, isStaff: false });
const brian = () => ({ userId: ids.brian, isStaff: true });

async function makeUser(name: string, isAdmin = false) {
  return (
    await prisma.user.create({
      data: {
        name,
        isAdmin,
        email: `lounge3-${name.toLowerCase().replace(/\W+/g, '.')}-${stamp}@yawp.test`,
        memberships: { create: { organizationId: ids.org, role: 'TEACHER' } },
      },
      select: { id: true },
    })
  ).id;
}

const base = {
  kind: 'QUESTION' as const,
  topic: 'other' as const,
  body: 'Body.',
  askStaff: false,
  askPrivately: false,
};

suite('Faculty Lounge launch features against the database', () => {
  beforeAll(async () => {
    ({ prisma } = await import('~/utils/db.server'));
    lounge = await import('./lounge.server');
    ids.org = (await prisma.organization.create({ data: { name: `Cristo Rey ${stamp}` } })).id;
    ids.maria = await makeUser('Maria Santos');
    ids.devin = await makeUser('Devin Reyes');
    ids.brian = await makeUser('Brian Connell', true);
    ids.team = await makeUser('YAWP! team', true);
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = [ids.maria, ids.devin, ids.brian, ids.team].filter(Boolean);
    await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
  });

  test('the welcome box records the house rules and the optional consent, which settings can change', async () => {
    expect(await lounge.getLoungeProfile(ids.maria)).toBeNull();
    await lounge.acceptLoungeHouseRules(ids.maria, { shareConsent: true });
    const profile = await lounge.getLoungeProfile(ids.maria);
    expect(profile?.guidelinesAcceptedAt).toBeInstanceOf(Date);
    expect(profile?.shareConsentAt).toBeInstanceOf(Date);

    await lounge.updateLoungeSettings(ids.maria, { shareConsent: false, emailNotifications: false });
    expect(await lounge.getLoungeProfile(ids.maria)).toMatchObject({ shareConsentAt: null, emailNotifications: false });
    await lounge.acceptLoungeHouseRules(ids.devin, { shareConsent: false });
  });

  test('a draft and a scheduled post stay out of sight until they go live', async () => {
    const now = new Date();
    const { postId: draftId } = await lounge.createLoungePost({
      viewer: brian(),
      organizationId: ids.org,
      membershipId: null,
      input: { ...base, title: `Lessons Learned ${stamp}`, schedule: { draft: true, publishAt: null } },
    });
    const later = new Date(now.getTime() + 7 * 86_400_000);
    const { postId: scheduledId } = await lounge.createLoungePost({
      viewer: brian(),
      organizationId: ids.org,
      membershipId: null,
      input: { ...base, title: `Revision policy ${stamp}`, schedule: { draft: false, publishAt: later } },
    });

    const feed = await lounge.listLoungePosts(maria(), { sort: 'new' });
    expect(feed.posts.map((p) => p.id)).not.toContain(draftId);
    expect(feed.posts.map((p) => p.id)).not.toContain(scheduledId);
    expect(await lounge.getLoungeThread(maria(), draftId)).toBeNull();
    expect(await lounge.getLoungeThread(brian(), draftId)).not.toBeNull();

    const queue = await lounge.listLoungeUnpublished();
    expect(queue.find((p) => p.id === draftId)).toMatchObject({ draft: true, publishAt: null });
    expect(queue.find((p) => p.id === scheduledId)).toMatchObject({ draft: false, publishAt: later.toISOString() });

    // Once its time comes, the scheduled post is live as of that time.
    const feedLater = await lounge.listLoungePosts(maria(), { sort: 'new', now: new Date(later.getTime() + 1000) });
    expect(feedLater.posts.find((p) => p.id === scheduledId)?.createdAt).toBe(later.toISOString());

    await lounge.publishLoungePostNow(draftId);
    expect((await lounge.listLoungePosts(maria(), { sort: 'new' })).posts.map((p) => p.id)).toContain(draftId);
    expect((await lounge.listLoungeUnpublished()).map((p) => p.id)).not.toContain(draftId);
  });

  test('a draft can be scheduled from the inbox, but not while it still has placeholders', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: brian(),
      organizationId: ids.org,
      membershipId: null,
      input: { ...base, title: `Hopper ${stamp}`, body: 'I used to [add a moment].', schedule: { draft: true, publishAt: null } },
    });
    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    await expect(lounge.scheduleLoungePost(postId, nextWeek)).rejects.toThrow(lounge.LoungePlaceholderError);
    await expect(lounge.publishLoungePostNow(postId)).rejects.toThrow(lounge.LoungePlaceholderError);

    expect(await lounge.editOwnLoungePost(brian(), postId, { title: `Hopper ${stamp}`, body: 'I used to grade at home.' })).toBe(true);
    await lounge.scheduleLoungePost(postId, nextWeek);
    expect((await lounge.listLoungeUnpublished()).find((p) => p.id === postId)).toMatchObject({
      draft: false,
      publishAt: nextWeek.toISOString(),
      hasPlaceholders: false,
    });
    expect((await lounge.listLoungePosts(maria(), { sort: 'new' })).posts.map((p) => p.id)).not.toContain(postId);
    // Editing before it goes live is not an "edit" anyone needs to see.
    expect((await lounge.getLoungeThread(brian(), postId))?.post.isEdited).toBe(false);
  });

  test("Brian's launch content seeds once: pinned welcome and rules, answered questions, hopper as drafts", async () => {
    const { seedLoungeLaunch, LAUNCH_POSTS } = await import('@app/prisma/lounge-launch');
    // Unique keys per run so this never collides with real launch content.
    const posts = LAUNCH_POSTS.map((p) => ({
      ...p,
      seedKey: `${p.seedKey}:${stamp}`,
      answer: p.answer && { ...p.answer, seedKey: `${p.answer.seedKey}:${stamp}` },
    }));
    const first = await seedLoungeLaunch(prisma, { brianUserId: ids.brian, teamUserId: ids.team, posts });
    expect(first.created).toHaveLength(LAUNCH_POSTS.length);
    const again = await seedLoungeLaunch(prisma, { brianUserId: ids.brian, teamUserId: ids.team, posts });
    expect(again.created).toHaveLength(0);

    const seeded = await prisma.loungePost.findMany({
      where: { seedKey: { in: posts.map((p) => p.seedKey) } },
      select: { id: true, seedKey: true },
    });
    const idFor = (key: string) => seeded.find((p) => p.seedKey === `${key}:${stamp}`)!.id;

    const pinned = (await lounge.listPinnedLoungePosts(maria())).map((p) => p.id);
    expect(pinned.slice(0, 2)).toEqual([idFor('launch:welcome'), idFor('launch:house-rules')]);

    const feed = (await lounge.listLoungePosts(maria(), { sort: 'new' })).posts.map((p) => p.id);
    expect(feed).toContain(idFor('launch:q1-routine'));
    expect(feed).not.toContain(idFor('hopper:lessons-learned'));

    const q1 = await lounge.getLoungeThread(maria(), idFor('launch:q1-routine'));
    expect(q1?.post.body).toBe('');
    expect(q1?.staffReplies[0].body).toStartWith('Use the Class Starter to build reps.');

    const lessons = (await lounge.listLoungeUnpublished()).find((p) => p.id === idFor('hopper:lessons-learned'));
    expect(lessons).toMatchObject({ draft: true, hasPlaceholders: true });

    // The Letter look: Brian's answer previews under a question that is all title.
    const feedRows = (await lounge.listLoungePosts(maria(), { sort: 'new' })).posts;
    const q1Row = feedRows.find((p) => p.id === idFor('launch:q1-routine'));
    expect(q1Row?.preview).toStartWith('Use the Class Starter to build reps.');
    expect(q1Row?.answeredBy).toBe('Brian');
    // The launch questions come from the YAWP! team, not from one person.
    expect(q1Row?.author).toEqual({ name: 'YAWP! team', detail: null });
    expect(q1Row?.avatar).toMatchObject({ initials: 'Y!', isStaff: true });
    const wins = feedRows.find((p) => p.id === idFor('launch:wins'));
    expect(wins).toMatchObject({ preview: expect.stringContaining('Share a sample of student work'), answeredBy: null });

    const [welcome] = (await lounge.listPinnedLoungePosts(maria())).filter((p) => p.id === idFor('launch:welcome'));
    expect(welcome.excerpt).toStartWith("Every school's faculty lounge has its own personality");
    expect(welcome.author).toEqual({ name: 'Brian Connell', detail: 'YAWP! team' });
    expect(welcome.avatar).toMatchObject({ initials: 'BC', isStaff: true });

    const thread = await lounge.getLoungeThread(maria(), idFor('launch:q1-routine'));
    expect(thread?.staffReplies[0].avatar).toMatchObject({ initials: 'BC', isStaff: true });
  });

  test('teachers can @mention Brian or the YAWP! team, not each staff member', async () => {
    const kevin = await makeUser('Kevin Gregorio', true);
    const host = await lounge.getLoungeHost();
    expect(host).toMatchObject({ userId: ids.brian, firstName: 'Brian' });

    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.org,
      membershipId: null,
      input: { ...base, title: `Pacing ${stamp}` },
    });
    await lounge.createLoungeReply({ viewer: { userId: kevin, isStaff: true }, organizationId: ids.org, postId, input: { body: 'Kevin here.', videoUrl: null } });
    await lounge.createLoungeReply({ viewer: devin(), organizationId: ids.org, postId, input: { body: 'Same question.', videoUrl: null } });

    const candidates = await lounge.listMentionCandidates(maria(), postId);
    expect(candidates.slice(0, 2)).toEqual([
      { userId: 'yawp-team', label: 'YAWP! team', detail: 'Brian and the team' },
      { userId: ids.brian, label: 'Brian', detail: 'YAWP! team' },
    ]);
    const offered = candidates.map((c) => c.userId);
    expect(offered).toContain(ids.devin);
    expect(offered).not.toContain(kevin);
    expect(offered).not.toContain(ids.team);

    // "@YAWP! team" asks the team: it lands in the inbox and emails the team.
    const { notifications } = await lounge.createLoungeReply({
      viewer: devin(),
      organizationId: ids.org,
      postId,
      input: { body: 'Any ideas @[YAWP! team](user:yawp-team)?', videoUrl: null },
    });
    expect(notifications.map((n) => n.kind)).toContain('staff-request');
    expect((await lounge.listLoungeStaffInbox()).waiting.map((w) => w.id)).toContain(postId);

    const { postId: asked } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.org,
      membershipId: null,
      input: { ...base, title: `Team mention ${stamp}`, body: 'Help @[YAWP! team](user:yawp-team)' },
    });
    expect((await lounge.getLoungeThread(maria(), asked))?.post.staffStatus).toBe('OPEN');

    await prisma.orgMembership.deleteMany({ where: { userId: kevin } });
    await prisma.user.delete({ where: { id: kevin } });
  });

  test('topic counts match the feed, busiest first', async () => {
    const counts = await lounge.listLoungeTopicCounts(maria());
    const routines = counts.find((c) => c.topic === 'classroom-routines');
    expect(routines?.label).toBe('Classroom routines');
    expect(routines?.count).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < counts.length; i++) expect(counts[i].count).toBeLessThanOrEqual(counts[i - 1].count);
  });

  test('teachers cannot schedule or draft; their posts go live now', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.org,
      membershipId: null,
      input: { ...base, title: `Teacher draft ${stamp}`, schedule: { draft: true, publishAt: null } },
    });
    expect((await lounge.listLoungePosts(devin(), { sort: 'new' })).posts.map((p) => p.id)).toContain(postId);
  });

  test('the welcome post and the house rules stay pinned together, oldest pin first', async () => {
    const make = async (title: string) =>
      (
        await lounge.createLoungePost({
          viewer: brian(),
          organizationId: ids.org,
          membershipId: null,
          input: { ...base, kind: 'SHARE', title, pin: true },
        })
      ).postId;
    const welcome = await make(`Welcome ${stamp}`);
    const rules = await make(`House Rules ${stamp}`);
    const pinned = (await lounge.listPinnedLoungePosts(maria())).map((p) => p.id);
    expect(pinned.indexOf(welcome)).toBeGreaterThanOrEqual(0);
    expect(pinned.indexOf(rules)).toBeGreaterThan(pinned.indexOf(welcome));
  });

  test('authors can edit their own posts and replies, and nobody else can', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: brian(),
      organizationId: ids.org,
      membershipId: null,
      input: { ...base, title: `Draft answer ${stamp}` },
    });
    const { replyId } = await lounge.createLoungeReply({
      viewer: brian(),
      organizationId: ids.org,
      postId,
      input: { body: 'First pass.', videoUrl: null },
    });
    expect(await lounge.editOwnLoungePost(maria(), postId, { title: 'Hijack', body: 'x' })).toBe(false);
    expect(await lounge.editOwnLoungePost(brian(), postId, { title: `Final answer ${stamp}`, body: 'Better.' })).toBe(true);
    expect(await lounge.editOwnLoungeReply(maria(), replyId, { body: 'x' })).toBe(false);
    expect(await lounge.editOwnLoungeReply(brian(), replyId, { body: 'Second pass.' })).toBe(true);
    const thread = await lounge.getLoungeThread(maria(), postId);
    expect(thread?.post).toMatchObject({ title: `Final answer ${stamp}`, body: 'Better.', isEdited: true });
    expect(thread?.staffReplies[0]).toMatchObject({ body: 'Second pass.', isEdited: true });
  });

  test('Contact Us reaches the team inbox until someone marks it handled', async () => {
    const { messageId, notification } = await lounge.createLoungeContactMessage(maria(), {
      organizationId: ids.org,
      message: 'The grade did not release for one student.',
      pageUrl: '/app/lounge',
    });
    expect(notification).toMatchObject({ kind: 'contact', actorName: 'Maria S.' });
    const inbox = await lounge.listLoungeStaffInbox();
    expect(inbox.messages.find((m) => m.id === messageId)).toMatchObject({
      message: 'The grade did not release for one student.',
      from: { name: 'Maria S.', detail: `Cristo Rey ${stamp}` },
      pageUrl: '/app/lounge',
    });
    await lounge.resolveLoungeContactMessage(ids.brian, messageId);
    expect((await lounge.listLoungeStaffInbox()).messages.map((m) => m.id)).not.toContain(messageId);
  });
});
