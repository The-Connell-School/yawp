import { expect, test } from '../test-setup';
import { setLoungeCommunityFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

/**
 * Brian's round 6 notes on the Faculty Lounge: three post types that say what
 * they are for, topics that match YAWP!'s features, Attach from YAWP! only
 * when sharing an assignment, no private posts (Contact Us instead), and
 * next and previous links for reading straight through.
 */

const TEACHER_PASSWORD = 'teacher-e2e-password';
const ATTACH_PROMPT = 'Round six: write the sentence your reader will remember.';
const OLDEST = 'Round six oldest: my thesis warm-up';
const MIDDLE = 'Round six middle: grading in twenty minutes';
const NEWEST = 'Round six newest: a win from fourth period';
const NO_TOPIC_TITLE = 'Round six: anyone else teaching in a portable?';

async function resetLounge(e2eContext: {
  teacherUserId: string;
  adminUserId: string;
  organizationId: string;
  classId: string;
  assignmentTypeId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.loungeAttachmentUse.deleteMany({});
    await prisma.loungeAttachment.deleteMany({});
    await prisma.loungeReport.deleteMany({});
    await prisma.loungeMention.deleteMany({});
    await prisma.loungeVote.deleteMany({});
    await prisma.loungeReply.deleteMany({});
    await prisma.loungePost.deleteMany({});
    await prisma.loungeProfile.deleteMany({});
    await prisma.loungeProfile.create({
      data: { userId: e2eContext.teacherUserId, guidelinesAcceptedAt: new Date() },
    });
    await prisma.assignment.deleteMany({ where: { prompt: ATTACH_PROMPT } });
    await prisma.assignment.create({
      data: {
        assignmentTypeId: e2eContext.assignmentTypeId,
        title: 'Memorable sentence',
        prompt: ATTACH_PROMPT,
        classAssignments: { create: { classId: e2eContext.classId } },
      },
    });
    const base = Date.now() - 3 * 3_600_000;
    const posts = [
      { title: OLDEST, kind: 'SHARE' as const, topic: 'thesis-essays', body: 'Five minutes, every day.' },
      { title: MIDDLE, kind: 'QUESTION' as const, topic: 'grading', body: 'Is it possible?' },
      { title: NEWEST, kind: 'WIN' as const, topic: 'other', body: 'She rewrote her thesis three times, happily.' },
    ];
    for (const [index, post] of posts.entries()) {
      await prisma.loungePost.create({
        data: {
          ...post,
          authorUserId: e2eContext.adminUserId,
          organizationId: e2eContext.organizationId,
          createdAt: new Date(base + index * 3_600_000),
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Faculty Lounge, round 6', () => {
  test.beforeAll(async () => {
    await setLoungeCommunityFlag(true);
  });

  test.afterAll(async () => {
    await setLoungeCommunityFlag(false);
  });

  test('the new post form: three types that say what they are for, and the new topics', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await resetLounge(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge/new');

    const types = page.getByRole('group', { name: 'Post type' });
    await expect(types.getByRole('radio')).toHaveCount(3);
    for (const label of ['General question', 'Share an assignment', 'Win']) {
      await expect(types.getByLabel(label, { exact: true })).toBeVisible();
    }

    // Each type's instruction sits above the title.
    const instruction = page.getByTestId('lounge-kind-prompt');
    await expect(instruction).toHaveText('Ask anything about teaching writing or using YAWP!');
    await page.getByLabel('Win', { exact: true }).check();
    await expect(instruction).toHaveText(
      'Share a sample of student work that made you happy or proud this week. Remember to take the student’s name off.'
    );
    await page.getByLabel('Share an assignment', { exact: true }).check();
    await expect(instruction).toHaveText('Share an assignment that worked. What made it land?');

    const topic = page.getByLabel('Topic');
    await expect(topic.getByRole('option')).toHaveText([
      'No topic',
      'Writing practice',
      'Class starters',
      'Thesis development',
      'Grading & rubrics',
      'Reporter',
      'Lesson planner',
      'Classroom routines',
      'Prewriting',
      'Lessons learned',
      'Something else',
    ]);
    await topic.selectOption({ label: 'Lessons learned' });
    await expect(page.getByText('What you used to do, what you do now, and why it changed.')).toBeVisible();

    await expect(
      page.getByText('Sharing student writing is welcome, but be sure to take the student’s name off first.')
    ).toBeVisible();
  });

  test('Attach from YAWP! is only for sharing an assignment, and closes on a click anywhere', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge/new');

    await page.getByLabel('General question', { exact: true }).check();
    await expect(page.getByRole('button', { name: 'Attach from YAWP!' })).toHaveCount(0);
    await page.getByLabel('Win', { exact: true }).check();
    await expect(page.getByRole('button', { name: 'Attach from YAWP!' })).toHaveCount(0);

    await page.getByLabel('Share an assignment', { exact: true }).check();
    await expect(page.getByText('Attach one of your YAWP! lessons')).toBeVisible();
    await page.getByRole('button', { name: 'Attach from YAWP!' }).click();
    const picker = page.getByRole('dialog', { name: 'Attach from YAWP!' });
    await expect(picker).toBeVisible();
    await page.getByRole('heading', { name: 'New post' }).click();
    await expect(picker).toHaveCount(0);
  });

  test('no private posts: anything just for the team goes through Contact Us', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge/new');
    await expect(page.getByText(/Keep it private/)).toHaveCount(0);
    await expect(page.getByLabel('Ask the YAWP! team to answer this')).toBeVisible();
    await page.getByRole('link', { name: 'Contact Us', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/lounge\/contact/);
  });

  test('a post can go up with no topic', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge/new');
    await page.getByLabel('General question', { exact: true }).check();
    await page.getByLabel('Title').fill(NO_TOPIC_TITLE);
    await page.getByLabel('Details').fill('The heater clanks all period.');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByRole('heading', { name: NO_TOPIC_TITLE, level: 1 })).toBeVisible();
    await expect(page.getByText('Something else')).toHaveCount(0);
  });

  test('next and previous read straight through the Lounge, with a look at what is next', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await page.getByRole('link', { name: MIDDLE }).click();
    await expect(page.getByRole('heading', { name: MIDDLE, level: 1 })).toBeVisible();

    const bottom = page.getByRole('navigation', { name: 'More posts' });
    await expect(bottom.getByRole('link', { name: /Next post/ })).toContainText(OLDEST);
    await expect(bottom.getByRole('link', { name: /Next post/ })).toContainText('Five minutes, every day.');
    await expect(bottom.getByRole('link', { name: /Previous post/ })).toContainText(NEWEST);

    // The short row at the top goes to the same places.
    await expect(page.getByRole('navigation', { name: 'Previous and next post' })).toBeVisible();

    await bottom.getByRole('link', { name: /Next post/ }).click();
    await expect(page.getByRole('heading', { name: OLDEST, level: 1 })).toBeVisible();
    await page.getByRole('navigation', { name: 'More posts' }).getByRole('link', { name: /Previous post/ }).click();
    await expect(page.getByRole('heading', { name: MIDDLE, level: 1 })).toBeVisible();
  });
});
