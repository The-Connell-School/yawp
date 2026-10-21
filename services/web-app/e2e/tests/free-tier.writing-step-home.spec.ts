import { test, expect, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';

/**
 * The free-tier Prewriting and Thesis Statement pages: what the step is, a
 * "See how it works" guide, and the course lesson's plan, deck, and video in
 * a box in the middle of the page.
 */
const db = createE2EPrismaClient();
const COURSE_TITLE = 'The Thesis-Driven Essay';
const STEPS = [
  {
    kind: 'prewriting',
    title: 'Prewriting',
    lesson: 'Lesson 2: Pre-writing',
    deck: 'Pre-Writing Slide Deck.pptx',
    plan: 'Yawp!_ Prewriting Lesson Plan.pdf',
    about: /write nonstop about the prompt/i,
  },
  {
    kind: 'thesis_statement',
    title: 'Thesis Statement',
    lesson: 'Lesson 3: Developing a Thesis Statement',
    deck: 'How to Write a Thesis Statement Slide Deck.pptx',
    plan: 'Thesis Statement Lesson Plan.pdf',
    about: /one sentence/i,
  },
] as const;

let createdCourseId: string | null = null;

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email or handle').fill('dev.teacher.free@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL('**/app**');
}

async function typeIdFor(kind: string) {
  const row = await db.assignmentType.findUniqueOrThrow({
    where: { kind },
    select: { id: true },
  });
  return row.id;
}

test.beforeAll(async () => {
  // Local dev imports the real course; a bare E2E database may not have it.
  const existing = await db.teacherTraining.findFirst({
    where: { title: COURSE_TITLE },
    select: { id: true },
  });
  if (existing) return;
  const course = await db.teacherTraining.create({
    data: {
      title: COURSE_TITLE,
      position: 99,
      teacherTrainingModules: {
        create: STEPS.map((step, index) => ({
          title: step.lesson,
          position: index + 7,
          videoS3Key: `e2e/${step.kind}.mp4`,
          resources: {
            create: [
              {
                name: step.plan,
                contentType: 'application/pdf',
                blob: Buffer.from('%PDF-1.4 e2e'),
              },
              {
                name: step.deck,
                contentType:
                  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                blob: Buffer.from('e2e deck'),
              },
            ],
          },
        })),
      },
    },
    select: { id: true },
  });
  createdCourseId = course.id;
});

test.afterAll(async () => {
  if (createdCourseId) {
    await db.teacherTraining.delete({ where: { id: createdCourseId } });
  }
  await db.$disconnect();
});

for (const step of STEPS) {
  test(`${step.title} home page explains the step and offers its lesson`, async ({
    page,
  }) => {
    const pagePath = `/app/assignment-types/${await typeIdFor(step.kind)}`;
    await login(page);
    await page.goto(pagePath);

    await expect(
      page.getByRole('heading', { level: 1, name: step.title })
    ).toBeVisible();
    const about = page.getByRole('region', {
      name: `About ${step.title}`,
    });
    await expect(about).toContainText(step.about);

    // The box in the middle: the course lesson's plan, deck, and video.
    const materials = page.getByRole('region', { name: /teach the lesson/i });
    await expect(materials).toContainText(step.lesson);
    await expect(
      materials.getByRole('link', { name: /lesson plan/i })
    ).toHaveAttribute('href', /^\/api\/teacher-training-module-resource\//);
    await expect(
      materials.getByRole('link', { name: /slide deck/i })
    ).toHaveAttribute('href', /^\/api\/teacher-training-module-resource\//);
    await expect(
      materials.getByRole('link', { name: /tutorial video/i })
    ).toHaveAttribute('href', /^\/app\/teacher-trainings\/[^/]+\/modules\//);

    // "How it works" up top, and back again.
    await page.getByRole('link', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(new RegExp(`${pagePath}/how-it-works$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      step.title
    );
    await expect(
      page.getByRole('region', { name: /teach the lesson/i })
    ).toBeVisible();
    await expect(page.getByTestId('guide-wont')).toContainText(
      /write .* for a student/i
    );
    await page
      .getByRole('link', { name: new RegExp(`back to ${step.title}`, 'i') })
      .click();
    await expect(page).toHaveURL(new RegExp(`${pagePath}$`));
  });
}

test('Class Starter keeps its own page', async ({ page }) => {
  await login(page);
  await page.goto(`/app/assignment-types/${await typeIdFor('class_starter')}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Class Starter' })
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: /teach the lesson/i })
  ).toHaveCount(0);
});
