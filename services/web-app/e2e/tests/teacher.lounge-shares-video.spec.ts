import { expect, test } from '../test-setup';
import { setLoungeCommunityFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const ADMIN_PASSWORD = 'admin-e2e-password';

const SHARE_TITLE = 'My conclusion checklist, if it helps anyone';
const SHARED_PROMPT = 'Before you write your conclusion, answer three questions: what did you prove, why does it matter, and what should your reader think about next?';
const QUESTION_TITLE = 'Do you teach literary and argument thesis statements separately?';
const PROMPT_TITLE = "What's the one sentence you say every time a student starts a body paragraph?";

// Recording needs a camera and microphone; Chromium supplies fake ones.
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ...(process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {}),
  },
});

async function resetLounge(e2eContext: {
  teacherUserId: string;
  adminUserId: string;
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
    for (const userId of [e2eContext.teacherUserId, e2eContext.adminUserId]) {
      await prisma.loungeProfile.create({
        data: { userId, guidelinesAcceptedAt: new Date() },
      });
    }
    await prisma.assignment.deleteMany({ where: { prompt: SHARED_PROMPT } });
    await prisma.assignment.create({
      data: {
        assignmentTypeId: e2eContext.assignmentTypeId,
        title: 'Conclusion checklist',
        prompt: SHARED_PROMPT,
        classAssignments: { create: { classId: e2eContext.classId } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Leave the app first so no in-flight revalidation races the next sign-in. */
async function logout(page: import('@playwright/test').Page) {
  await page.goto('about:blank');
  await page.context().clearCookies();
}

async function seedWaitingQuestion(teacherUserId: string, organizationId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.loungePost.create({
      data: {
        authorUserId: teacherUserId,
        organizationId,
        kind: 'QUESTION',
        topic: 'thesis-essays',
        title: QUESTION_TITLE,
        body: 'My 10th graders freeze on literary analysis.',
        staffStatus: 'OPEN',
        staffRequestedAt: new Date(),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("Faculty Lounge shares and Brian's videos", () => {
  test.beforeAll(async () => {
    await setLoungeCommunityFlag(true);
  });

  test.afterAll(async () => {
    await setLoungeCommunityFlag(false);
  });

  test('a teacher shares one of their assignments in a post', async ({ page, signIn, e2eContext }) => {
    await resetLounge(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge/new');
    await page.getByLabel('Share').check();
    await page.getByLabel('Title').fill(SHARE_TITLE);
    await page.getByLabel('Details').fill('I give it the day before the essay is due.');
    await page.getByLabel('Topic').selectOption({ label: 'Writing Lessons' });

    await page.getByRole('button', { name: 'Attach from YAWP!' }).click();
    const picker = page.getByRole('dialog', { name: 'Attach from YAWP!' });
    await picker.getByRole('button', { name: /Conclusion checklist/ }).click();
    await expect(picker).toHaveCount(0);
    await expect(page.getByText('Conclusion checklist', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    const card = page.getByRole('region', { name: 'Shared from YAWP!' });
    await expect(card.getByText('Conclusion checklist', { exact: true })).toBeVisible();
    await expect(card.getByText('Shared from your assignments')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Use in my class' })).toHaveCount(0);
  });

  test('another teacher sees it in one line and uses it in their class in one click', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/lounge');
    const row = page.getByRole('article').filter({ hasText: SHARE_TITLE });
    await expect(row.getByText(/Conclusion checklist/)).toBeVisible();
    await row.getByRole('link', { name: SHARE_TITLE }).click();

    const card = page.getByRole('region', { name: 'Shared from YAWP!' });
    await card.getByText('Preview').click();
    await expect(card.getByText(SHARED_PROMPT)).toBeVisible();
    await card.getByRole('button', { name: 'Use in my class' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/assignment-types/${e2eContext.assignmentTypeId}`));
    await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(SHARED_PROMPT);

    await page.goto('/app/lounge');
    await expect(
      page.getByRole('article').filter({ hasText: SHARE_TITLE }).getByText('used by 1 teacher')
    ).toBeVisible();
  });

  test('Brian records a video answer from the inbox and teachers watch it in the thread', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await seedWaitingQuestion(e2eContext.teacherUserId, e2eContext.organizationId);
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/admin/lounge');
    await page.getByRole('link', { name: QUESTION_TITLE }).click();

    await page.getByRole('button', { name: 'Add a video' }).click();
    await page.getByRole('button', { name: 'Record' }).click();
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByText(/Recording 0:0/)).toBeVisible();
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Use this video' }).click();
    await expect(page.getByText(/Video ready/)).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Title on the video (optional)').fill('One lesson, two thesis shapes');
    await page.getByLabel('Reply as the YAWP! team').fill('Teach them together. Argument first, then flip it.');
    await page.getByRole('button', { name: 'Post reply' }).click();
    await expect(page.getByText('Nothing waiting. Nice.')).toBeVisible();

    await logout(page);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    const row = page.getByRole('article').filter({ hasText: QUESTION_TITLE });
    await expect(row.getByText('YAWP! team answered on video')).toBeVisible();
    await row.getByRole('link', { name: QUESTION_TITLE }).click();

    const answers = page.getByRole('region', { name: 'Answers from the YAWP! team' });
    await expect(answers.getByText('One lesson, two thesis shapes')).toBeVisible();
    const video = answers.locator('video');
    await expect(video).toHaveAttribute('src', /\/api\/lounge\/video-local\?key=lounge%2Fvideos%2F/);
    const response = await page.request.get((await video.getAttribute('src'))!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^video\//);
  });

  test('Brian pins a weekly prompt to the top of the feed', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/lounge/new');
    await page.getByLabel('Question').check();
    await page.getByLabel('Title').fill(PROMPT_TITLE);
    await page.getByLabel('Details').fill('Reply with yours. I will share mine on Friday.');
    await page.getByLabel('Topic').selectOption({ label: 'Writing Lessons' });
    await page.getByLabel('Pin to the top of the Lounge').check();
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByRole('heading', { name: PROMPT_TITLE })).toBeVisible();

    await logout(page);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    const pinned = page.getByRole('region', { name: 'Pinned' });
    await expect(pinned.getByText('From Admin')).toBeVisible();
    await expect(pinned.getByRole('link', { name: PROMPT_TITLE })).toBeVisible();
    // Shown once, at the top, not again in the list below.
    await expect(page.getByRole('link', { name: PROMPT_TITLE })).toHaveCount(1);
  });

  test('teachers cannot ask for an upload URL', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const response = await page.request.post('/api/lounge/video-upload', {
      data: { contentType: 'video/webm', size: 1000 },
    });
    expect(response.status()).toBe(404);
  });
});
