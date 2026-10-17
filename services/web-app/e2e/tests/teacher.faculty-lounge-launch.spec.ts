import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../test-setup';
import { setLoungeCommunityFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const ADMIN_PASSWORD = 'admin-e2e-password';

const SEED_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/prisma/scripts/seed-lounge-launch.ts'
);

const HOPPER_TITLE = 'Lessons Learned';
const CONTACT_MESSAGE = 'One of my students cannot see the grade I released yesterday.';

async function resetLounge(e2eContext: { adminEmail: string }) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.loungeContactMessage.deleteMany({});
    await prisma.loungeAttachmentUse.deleteMany({});
    await prisma.loungeAttachment.deleteMany({});
    await prisma.loungeReport.deleteMany({});
    await prisma.loungeMention.deleteMany({});
    await prisma.loungeVote.deleteMany({});
    await prisma.loungeReply.deleteMany({});
    await prisma.loungePost.deleteMany({});
    await prisma.loungeProfile.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
  // Brian's launch content through the real seed command, with the e2e admin
  // standing in for Brian.
  execFileSync('bun', ['run', SEED_SCRIPT, '--yes'], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? '',
      LOUNGE_SEED_BRIAN_EMAIL: e2eContext.adminEmail,
    },
    stdio: 'pipe',
  });
}

/** Leave the app first so no in-flight revalidation races the next sign-in. */
async function logout(page: import('@playwright/test').Page) {
  await page.goto('about:blank');
  await page.context().clearCookies();
}

test.describe.serial('Faculty Lounge launch', () => {
  test.beforeAll(async () => {
    await setLoungeCommunityFlag(true);
  });

  test.afterAll(async () => {
    await setLoungeCommunityFlag(false);
  });

  test("a teacher's first visit opens the welcome box, and Enter waits for the House Rules", async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await resetLounge(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.getByRole('link', { name: 'Faculty Lounge' }).first().click();

    await expect(page).toHaveURL(/\/app\/lounge\/welcome/);
    await expect(page.getByText(/a place where we ask questions, share ideas, and connect with each other/)).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Protect your students.' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(7);

    const enter = page.getByRole('button', { name: 'Enter the Lounge' });
    await expect(enter).toBeDisabled();
    await page.getByLabel(/YAWP! may share my posts, with my name removed/).check();
    await expect(enter).toBeDisabled();
    await page.getByLabel('I agree to follow the Lounge’s House Rules.').check();
    await expect(enter).toBeEnabled();
    await enter.click();

    await expect(page).toHaveURL(/\/app\/lounge$/);
    await expect(page.getByRole('heading', { name: 'Faculty Lounge', level: 1 })).toBeVisible();
    const pinned = page.getByRole('region', { name: 'Pinned' });
    await expect(pinned.getByRole('link')).toHaveText([/Welcome to the Faculty Lounge/, /House Rules for the Lounge/]);
    // The Letter look: Brian's welcome as a letter, the team's faces beside it.
    await expect(pinned.getByText(/Every school's faculty lounge has its own personality/)).toBeVisible();
    await expect(pinned.getByRole('heading', { name: 'Ask Admin or the YAWP! team' })).toBeVisible();
    await expect(pinned.getByText('@YAWP! team')).toBeVisible();
    // A question that is all title previews Brian's answer, and says who answered.
    const q1 = page.getByRole('article').filter({ hasText: "What's the best way to use YAWP!" });
    await expect(q1.getByText(/^Use the Class Starter to build reps\./)).toBeVisible();
    await expect(q1.getByText('Admin answered')).toBeVisible();
    // The launch questions are asked by the YAWP! team, not by one staff member.
    await expect(q1.getByText('YAWP! team', { exact: true })).toBeVisible();
    // Drafts in the hopper stay out of the feed.
    await expect(page.getByRole('link', { name: HOPPER_TITLE })).toHaveCount(0);

    // Once is enough.
    await page.goto('/app/lounge/new');
    await expect(page).toHaveURL(/\/app\/lounge\/new$/);
  });

  test("Brian's launch answer reads under Kevin's question, with no empty body", async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await page
      .getByRole('link', { name: "What's the best way to use YAWP! to make writing a regular part of our class routine?" })
      .click();
    const answers = page.getByRole('region', { name: 'Answers from the YAWP! team' });
    await expect(answers.getByText(/Use the Class Starter to build reps\./)).toBeVisible();
    await expect(answers.getByText("Admin's answer")).toBeVisible();
    await expect(page.getByTestId('lounge-post-body')).toHaveCount(0);
  });

  test('settings change the sharing consent later', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await page.getByRole('link', { name: 'Lounge settings' }).click();
    const consent = page.getByLabel(/YAWP! may share my posts, with my name removed/);
    await expect(consent).toBeChecked();
    await consent.uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/YAWP! may share my posts, with my name removed/)).not.toBeChecked();
  });

  test('Contact Us reaches the YAWP! team inbox, not the Lounge', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await page.getByRole('link', { name: 'Contact Us' }).click();
    await page.getByLabel('Message').fill(CONTACT_MESSAGE);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Thanks\. The YAWP! team will get back to you by email\./)).toBeVisible();

    await logout(page);
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/admin/lounge');
    const messages = page.getByRole('region', { name: 'Messages' });
    await expect(messages.getByText(CONTACT_MESSAGE)).toBeVisible();
    await expect(messages.getByText(e2eContext.teacherEmail)).toBeVisible();
    await messages.getByRole('button', { name: 'Mark handled' }).click();
    await expect(messages.getByText('No messages.')).toBeVisible();
  });

  test('the hopper waits until Brian fills in his notes, then goes up on schedule', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/admin/lounge');
    const drafts = page.getByRole('region', { name: 'Drafts and scheduled' });
    const lessons = drafts.getByRole('article').filter({ hasText: HOPPER_TITLE });
    await expect(lessons.getByText('Has [notes] to fill in')).toBeVisible();
    await lessons.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('alert')).toContainText('Fill in the [bracketed] notes');

    await lessons.getByRole('link', { name: HOPPER_TITLE }).click();
    await expect(page.getByText('Draft. Only the YAWP! team can see this.')).toBeVisible();
    await page.getByRole('button', { name: 'Edit post' }).click();
    const body = page.getByLabel('Edit details');
    const text = (await body.inputValue())
      .replace(/\[What came back:[^\]]*\]/, 'What came back was rushed.')
      .replace(/\[Add a one-line moment[^\]]*\]/, 'It clicked in 2019.');
    await body.fill(text);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByTestId('lounge-post-body')).toContainText('It clicked in 2019.');

    await page.goto('/app/admin/lounge');
    const row = page.getByRole('region', { name: 'Drafts and scheduled' }).getByRole('article').filter({ hasText: HOPPER_TITLE });
    await expect(row.getByText('Has [notes] to fill in')).toHaveCount(0);
    await row.getByRole('button', { name: 'Publish now' }).click();
    await expect(
      page.getByRole('region', { name: 'Drafts and scheduled' }).getByRole('article').filter({ hasText: HOPPER_TITLE })
    ).toHaveCount(0);

    await logout(page);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    const post = page.getByRole('article').filter({ hasText: HOPPER_TITLE });
    await expect(post).toBeVisible();
    // Changes made before it went live are not edits.
    await expect(post.getByText('edited')).toHaveCount(0);
  });

  test('the YAWP! team schedules a post for later from the composer', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/lounge/new');
    await page.getByLabel('Question').check();
    await page.getByLabel('Title').fill('How do you get through a stack of essays?');
    await page.getByLabel('Details').fill('Asking for everyone.');
    await page.getByLabel('Topic').selectOption({ label: 'Grading & Rubrics' });
    await page.getByLabel('Schedule').check();
    await page.getByLabel('Post on').fill('2099-01-05T07:30');
    await page.getByRole('button', { name: 'Schedule post' }).click();
    await expect(page.getByText(/Scheduled for/)).toBeVisible();

    await logout(page);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await expect(page.getByRole('link', { name: 'How do you get through a stack of essays?' })).toHaveCount(0);
  });

  test('a teacher edits their own reply and it says so', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lounge');
    await page.getByRole('link', { name: 'Wins', exact: true }).click();
    await page.getByLabel('Your reply').fill('My 9th grader wrote her best thesis yet.');
    await page.getByRole('button', { name: 'Post reply' }).click();
    const replies = page.getByRole('region', { name: 'Replies' });
    const mine = replies.getByRole('article').filter({ hasText: 'best thesis yet' });
    await mine.getByRole('button', { name: 'Edit' }).click();
    await mine.getByLabel('Edit reply').fill('My 9th grader wrote her best thesis yet. No name, as promised.');
    await mine.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    const edited = replies.getByRole('article').filter({ hasText: 'No name, as promised.' });
    await expect(edited.getByText('edited')).toBeVisible();
  });
});
