import { expect, test } from '../test-setup';
import { setLoungeCommunityFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const ADMIN_PASSWORD = 'admin-e2e-password';
const STUDENT_EMAIL = 'jdoe@brock.software';
const STUDENT_PASSWORD = 'johndoe';

const QUESTION_TITLE = 'How are you pacing Daily Pages in a 45-minute period?';
const QUESTION_BODY = 'We lose the first ten minutes to settling in. Opener or closer?';
const STAFF_ANSWER = 'Make it the opener and give them exactly twelve minutes.';

async function clearLounge() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.loungeReport.deleteMany({});
    await prisma.loungeMention.deleteMany({});
    await prisma.loungeVote.deleteMany({});
    await prisma.loungeReply.deleteMany({});
    await prisma.loungePost.deleteMany({});
    await prisma.loungeProfile.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

async function logout(page: import('@playwright/test').Page) {
  await page.context().clearCookies();
}

test.describe.serial("Teacher's Lounge community board", () => {
  test.beforeAll(async () => {
    await clearLounge();
  });

  test.afterAll(async () => {
    await setLoungeCommunityFlag(false);
    await clearLounge();
  });

  test('flag off: the Lounge stays the course grid and community pages are hidden', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLoungeCommunityFlag(false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.getByRole('link', { name: "Teacher's Lounge" }).first().click();
    await expect(page).toHaveURL(/\/app\/teacher-trainings$/);
    await expect(page.getByRole('heading', { name: "Teacher's Lounge" })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Community' })).toHaveCount(0);

    const response = await page.goto('/app/lounge');
    expect(response?.status()).toBe(404);
  });

  test('a teacher sets how they appear, then asks the Yawp team a question', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLoungeCommunityFlag(true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.getByRole('link', { name: "Teacher's Lounge" }).first().click();
    await expect(page).toHaveURL(/\/app\/lounge$/);
    await expect(page.getByRole('heading', { name: "Teacher's Lounge" })).toBeVisible();
    await expect(page.getByText('No posts yet')).toBeVisible();

    // The course grid is one tab away, and the nav still reads as the Lounge there.
    await page.getByRole('link', { name: 'Trainings' }).click();
    await expect(page).toHaveURL(/\/app\/teacher-trainings$/);
    await expect(page.getByRole('link', { name: 'Community' })).toBeVisible();
    await page.getByRole('link', { name: 'Community' }).click();

    await page.getByRole('link', { name: 'New post' }).click();
    await expect(page.getByRole('heading', { name: 'How should other teachers see you?' })).toBeVisible();
    await page.getByLabel('First name, last initial, and school').check();
    await page.getByLabel(/community guidelines/).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/app\/lounge\/new/);
    await page.getByLabel('Question').check();
    await page.getByLabel('Title').fill(QUESTION_TITLE);
    await page.getByLabel('Details').fill('My student Jake rushes it.');
    await expect(page.getByText(/may include a student's name/)).toBeVisible();
    await page.getByLabel('Details').fill(QUESTION_BODY);
    await expect(page.getByText(/may include a student's name/)).toHaveCount(0);
    await page.getByLabel('Topic').selectOption({ label: 'Daily Pages' });
    await page.getByLabel('Ask the Yawp team to answer this').check();
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    await expect(page.getByRole('heading', { name: QUESTION_TITLE })).toBeVisible();
    await expect(page.getByText(QUESTION_BODY)).toBeVisible();
    await expect(page.getByText('Waiting on the Yawp team')).toBeVisible();
  });

  test('the Yawp team answers from the admin inbox', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/admin/lounge');
    await expect(page.getByRole('heading', { name: 'Lounge inbox' })).toBeVisible();
    await page.getByRole('link', { name: QUESTION_TITLE }).click();
    await expect(page.getByText(QUESTION_BODY)).toBeVisible();
    await page.getByLabel('Reply as the Yawp team').fill(STAFF_ANSWER);
    await page.getByLabel('Video link (optional)').fill('https://www.loom.com/share/e2e-answer');
    await page.getByRole('button', { name: 'Post reply' }).click();
    await expect(page.getByText('Nothing waiting. Nice.')).toBeVisible();

    await page.goto('/app/lounge');
    const thread = page.getByRole('article').filter({ hasText: QUESTION_TITLE });
    await expect(thread.getByText('Yawp team answered')).toBeVisible();
  });

  test('another teacher finds it, marks it helpful, and replies with a mention', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.ua.teacher.email, e2eContext.ua.teacher.password);
    await page.goto('/app/lounge');
    await page.getByRole('link', { name: QUESTION_TITLE }).click();

    const answers = page.getByRole('region', { name: 'Answers from the Yawp team' });
    await expect(answers.getByText(STAFF_ANSWER)).toBeVisible();
    await expect(answers.getByRole('link', { name: 'Watch the video' })).toHaveAttribute(
      'href',
      'https://www.loom.com/share/e2e-answer'
    );

    const helpful = page.getByRole('button', { name: /helpful/i }).first();
    await expect(helpful).toHaveAttribute('aria-pressed', 'false');
    await helpful.click();
    await expect(helpful).toHaveAttribute('aria-pressed', 'true');
    await expect(helpful).toContainText('1');

    // First reply asks for the identity card, then comes back to the thread.
    await page.getByRole('link', { name: 'Choose how you appear to reply' }).click();
    await page.getByLabel('First name only').check();
    await page.getByLabel(/community guidelines/).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: QUESTION_TITLE })).toBeVisible();

    const reply = page.getByLabel('Your reply');
    await reply.fill('Opener here too. Thanks ');
    await reply.pressSequentially('@Adm');
    await page.getByRole('option', { name: /Admin E2E/ }).click();
    await reply.pressSequentially('for the video.');
    await page.getByRole('button', { name: 'Post reply' }).click();

    const replies = page.getByRole('region', { name: 'Replies' });
    await expect(replies.getByText('Opener here too.')).toBeVisible();
    await expect(replies.getByText('@Admin E2E')).toBeVisible();
    await expect(replies.getByText(/\(user:/)).toHaveCount(0);
  });

  test('a reported reply disappears once the Yawp team hides it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await page.getByRole('link', { name: QUESTION_TITLE }).click();
    const replies = page.getByRole('region', { name: 'Replies' });
    const item = replies.getByRole('article').filter({ hasText: 'Opener here too.' });
    await item.getByText('Report', { exact: true }).click();
    await item.getByLabel('What is wrong?').fill('Testing moderation');
    await item.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Thanks. The Yawp team will take a look.')).toBeVisible();

    await logout(page);
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/admin/lounge');
    const reports = page.getByRole('region', { name: 'Reports' });
    await expect(reports.getByText('Testing moderation')).toBeVisible();
    await reports.getByRole('button', { name: 'Hide' }).first().click();
    await expect(reports.getByText('No open reports.')).toBeVisible();

    await logout(page);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await page.getByRole('link', { name: QUESTION_TITLE }).click();
    await expect(page.getByText('Opener here too.')).toHaveCount(0);
  });

  test('students never reach the Lounge community', async ({ page, signIn }) => {
    await signIn(STUDENT_EMAIL, STUDENT_PASSWORD);
    const response = await page.goto('/app/lounge');
    expect(response?.status()).toBe(404);
  });
});
