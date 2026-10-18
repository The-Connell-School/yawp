// Real-database round trip for Lounge shares, in-app video, and pinning.
//   LOUNGE_DB_TESTS=1 DATABASE_URL=... bun test app/domain/lounge/lounge-shares-video.integration.test.ts
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
  schoolA: '',
  type: '',
  devin: '',
  devinMembership: '',
  maria: '',
  mariaMembership: '',
  brian: '',
  assignment: '',
  othersAssignment: '',
};

async function makeTeacher(name: string, orgId: string, isAdmin = false) {
  const user = await prisma.user.create({
    data: {
      name,
      isAdmin,
      email: `lounge2-${name.toLowerCase().replace(/\W+/g, '.')}-${stamp}@yawp.test`,
      memberships: { create: { organizationId: orgId, role: 'TEACHER' } },
    },
    select: { id: true, memberships: { select: { id: true } } },
  });
  return { userId: user.id, membershipId: user.memberships[0].id };
}

const devin = () => ({ userId: ids.devin, isStaff: false });
const maria = () => ({ userId: ids.maria, isStaff: false });
const brian = () => ({ userId: ids.brian, isStaff: true });

const basePost = {
  kind: 'SHARE' as const,
  topic: 'writing-lessons' as const,
  title: `Conclusion checklist ${stamp}`,
  body: 'I give it the day before the essay is due.',
  askStaff: false,
  askPrivately: false,
};

suite('Lounge shares, video, and pinning against the database', () => {
  beforeAll(async () => {
    ({ prisma } = await import('~/utils/db.server'));
    lounge = await import('./lounge.server');
    ids.orgA = (await prisma.organization.create({ data: { name: `St. Ignatius ${stamp}` } })).id;
    ids.orgB = (await prisma.organization.create({ data: { name: `Cristo Rey ${stamp}` } })).id;
    ids.schoolA = (await prisma.school.create({ data: { name: `School ${stamp}`, code: `S${stamp}`, organizationId: ids.orgA } })).id;
    ids.type = (await prisma.assignmentType.create({ data: { title: `Exit Ticket ${stamp}`, position: 999 } })).id;
    const d = await makeTeacher('Devin Reyes', ids.orgA);
    const m = await makeTeacher('Maria Santos', ids.orgB);
    const b = await makeTeacher('Brian Connell', ids.orgA, true);
    Object.assign(ids, { devin: d.userId, devinMembership: d.membershipId, maria: m.userId, mariaMembership: m.membershipId, brian: b.userId });
    for (const id of [ids.devin, ids.maria]) await lounge.acceptLoungeHouseRules(id, { shareConsent: false });

    const klass = await prisma.class.create({
      data: { code: `C${stamp}`, schoolId: ids.schoolA, teachers: { connect: { id: ids.devinMembership } } },
      select: { id: true },
    });
    const assignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: ids.type,
        title: 'Conclusion checklist',
        prompt: 'Before you write your conclusion, answer three questions.',
        submitForGrade: false,
        pointValue: null,
        tutorEnabled: false,
        classAssignments: { create: { classId: klass.id } },
      },
      select: { id: true },
    });
    ids.assignment = assignment.id;
    ids.othersAssignment = (
      await prisma.assignment.create({ data: { assignmentTypeId: ids.type, prompt: 'Not Devin’s.' }, select: { id: true } })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = [ids.devin, ids.maria, ids.brian].filter(Boolean);
    await prisma.assignment.deleteMany({ where: { id: { in: [ids.assignment, ids.othersAssignment] } } });
    await prisma.class.deleteMany({ where: { schoolId: ids.schoolA } });
    await prisma.school.deleteMany({ where: { id: ids.schoolA } });
    await prisma.assignmentType.deleteMany({ where: { id: ids.type } });
    await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } });
  });

  test('a teacher can attach only assignments from their own classes', async () => {
    const shareable = await lounge.listShareableAssignments(ids.devinMembership);
    expect(shareable.map((a) => a.id)).toEqual([ids.assignment]);
    expect(shareable[0]).toMatchObject({ title: 'Conclusion checklist', typeTitle: `Exit Ticket ${stamp}` });

    await expect(
      lounge.createLoungePost({
        viewer: devin(),
        organizationId: ids.orgA,
        membershipId: ids.devinMembership,
        input: { ...basePost, attachAssignmentId: ids.othersAssignment },
      })
    ).rejects.toThrow('That assignment is not one of yours.');
  });

  test('a share is frozen, shows in the feed, and counts each teacher who uses it once', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: devin(),
      organizationId: ids.orgA,
      membershipId: ids.devinMembership,
      input: { ...basePost, attachAssignmentId: ids.assignment },
    });
    // The original changes after sharing; the share does not.
    await prisma.assignment.update({ where: { id: ids.assignment }, data: { prompt: 'Changed later.' } });

    const thread = await lounge.getLoungeThread(maria(), postId);
    const attachment = thread?.post.attachment;
    expect(attachment).toMatchObject({
      kind: 'assignment',
      title: 'Conclusion checklist',
      typeTitle: `Exit Ticket ${stamp}`,
      assignmentTypeId: ids.type,
      prompt: 'Before you write your conclusion, answer three questions.',
      useCount: 0,
      viewerUsed: false,
    });

    const first = await lounge.recordShareUse(maria(), attachment!.id);
    expect(first).toEqual({ assignmentTypeId: ids.type });
    await lounge.recordShareUse(maria(), attachment!.id);
    await lounge.recordShareUse(brian(), attachment!.id);

    const feed = await lounge.listLoungePosts(devin(), { sort: 'new' });
    expect(feed.posts.find((p) => p.id === postId)?.attachment).toMatchObject({
      title: 'Conclusion checklist',
      typeTitle: `Exit Ticket ${stamp}`,
      useCount: 2,
    });

    expect(await lounge.getSharePromptForViewer(maria(), attachment!.id, ids.type)).toBe(
      'Before you write your conclusion, answer three questions.'
    );
    expect(await lounge.getSharePromptForViewer(maria(), attachment!.id, 'some-other-type')).toBeNull();
  });

  // New posts can no longer be private (round 6), but private posts made
  // before then keep their privacy, attachments included.
  test('a share inside a private post cannot be used by other teachers', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: devin(),
      organizationId: ids.orgA,
      membershipId: ids.devinMembership,
      input: { ...basePost, askStaff: true, askPrivately: true, attachAssignmentId: ids.assignment },
    });
    const own = await lounge.getLoungeThread(devin(), postId);
    const attachmentId = own!.post.attachment!.id;
    await expect(lounge.recordShareUse(maria(), attachmentId)).rejects.toThrow('Lounge post not found');
    expect(await lounge.getSharePromptForViewer(maria(), attachmentId, ids.type)).toBeNull();
  });

  test('the Yawp team answers on video and the feed says so', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgB,
      membershipId: ids.mariaMembership,
      input: { ...basePost, kind: 'QUESTION', title: `Pacing ${stamp}`, askStaff: true },
    });
    const video = {
      key: `lounge/videos/${ids.brian}/abcdef0123456789.webm`,
      contentType: 'video/webm' as const,
      durationSeconds: 161,
      title: 'Twelve minutes, no apologies',
    };
    await lounge.createLoungeReply({
      viewer: brian(),
      organizationId: ids.orgA,
      postId,
      input: { body: 'Short version: make it the opener.', videoUrl: null, video },
    });
    const thread = await lounge.getLoungeThread(maria(), postId);
    expect(thread?.staffReplies[0].video).toEqual(video);
    const feed = await lounge.listLoungePosts(maria(), { sort: 'new' });
    expect(feed.posts.find((p) => p.id === postId)).toMatchObject({ staffAnswered: true, staffAnsweredOnVideo: true });
  });

  test('video from a teacher is ignored', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgB,
      membershipId: ids.mariaMembership,
      input: { ...basePost, title: `No video ${stamp}` },
    });
    await lounge.createLoungeReply({
      viewer: devin(),
      organizationId: ids.orgA,
      postId,
      input: {
        body: 'Here is my video',
        videoUrl: null,
        video: { key: `lounge/videos/${ids.devin}/abcdef0123456789.webm`, contentType: 'video/webm', durationSeconds: 3, title: null },
      },
    });
    const thread = await lounge.getLoungeThread(maria(), postId);
    expect(thread?.replies[0].video).toBeNull();
  });

  test('the Yawp team posts a weekly video prompt and pins it to the top', async () => {
    const { postId } = await lounge.createLoungePost({
      viewer: brian(),
      organizationId: ids.orgA,
      membershipId: null,
      input: {
        ...basePost,
        kind: 'QUESTION',
        title: `This week ${stamp}`,
        video: { key: `lounge/videos/${ids.brian}/0123456789abcdef.mp4`, contentType: 'video/mp4', durationSeconds: 58, title: null },
        pin: true,
      },
    });
    const pinned = await lounge.listPinnedLoungePosts(maria());
    expect(pinned.find((p) => p.id === postId)).toMatchObject({ authorFirstName: 'Brian', authorIsStaff: true, videoDurationSeconds: 58 });

    // Teachers cannot pin; asking to is ignored.
    const { postId: teacherPost } = await lounge.createLoungePost({
      viewer: maria(),
      organizationId: ids.orgB,
      membershipId: ids.mariaMembership,
      input: { ...basePost, title: `Teacher pin ${stamp}`, pin: true },
    });
    const ids2 = (await lounge.listPinnedLoungePosts(maria())).map((p) => p.id);
    expect(ids2).toContain(postId);
    expect(ids2).not.toContain(teacherPost);

    await lounge.setLoungePostPinned(ids.brian, postId, false);
    expect((await lounge.listPinnedLoungePosts(maria())).map((p) => p.id)).not.toContain(postId);
  });
});
