import { setThesisEssayDecksFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';
import { test, expect } from '../test-setup';

const TEACHER_PASSWORD = 'teacher-e2e-password';

// The e2e seed gives the Thesis-Driven Essay a single placeholder module. The
// real type's steps are what the decks hang off, so this spec adds two of
// them for itself and removes them afterwards.
const STEP_MODULES = [
  { title: 'Pre-writing', position: 2, description: 'Find a specific focus for your essay.' },
  { title: 'Thesis Statement', position: 3, description: 'Write your thesis statement.' },
];

test.describe.serial('Thesis-Driven Essay: slide decks in the Modules', () => {
  const createdModuleIds: string[] = [];

  test.beforeAll(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      for (const step of STEP_MODULES) {
        const created = await prisma.assignmentModule.create({
          data: { ...step, assignmentTypeId: e2eContext.thesisEssayAssignmentTypeId },
          select: { id: true },
        });
        createdModuleIds.push(created.id);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    await setThesisEssayDecksFlag(false);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.assignmentModule.deleteMany({ where: { id: { in: createdModuleIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('shows no decks while the flag is off', async ({ page, signIn, e2eContext }) => {
    await setThesisEssayDecksFlag(false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);

    await page.getByRole('button', { name: 'Modules' }).click();
    await page.getByRole('button', { name: 'Pre-writing' }).click();
    await expect(page.getByText('Find a specific focus for your essay.')).toBeVisible();
    await expect(page.getByRole('link', { name: /slide deck/i })).toHaveCount(0);
    // The Teachers' Lounge pointer is unchanged.
    await expect(page.getByText(/lesson materials are available in the teachers/i)).toBeVisible();

    const response = await page.request.get('/api/thesis-essay-deck/lesson-2-pre-writing');
    expect(response.status()).toBe(404);
  });

  test('puts each step’s deck in its module, and it downloads', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setThesisEssayDecksFlag(true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);

    await page.getByRole('button', { name: 'Modules' }).click();
    await expect(page.getByText(/each module has its slide deck/i)).toBeVisible();
    // Day 1 has no step of its own, so its deck sits above the list.
    await expect(page.getByText(/introduce YAWP! on Day 1/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /slide deck: lesson 1 · introduce students to yawp!/i })
    ).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-1-day-1');

    await page.getByRole('button', { name: 'Pre-writing' }).click();
    const preWriting = page.getByRole('link', { name: /slide deck: lesson 2 · pre-writing/i });
    await expect(preWriting).toBeVisible();
    await expect(preWriting).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-2-pre-writing');

    await page.getByRole('button', { name: 'Thesis Statement' }).click();
    await expect(
      page.getByRole('link', { name: /slide deck: lesson 3 · thesis statement/i })
    ).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-3-thesis-statement');

    // The placeholder module matches no lesson, so it gets no deck: Day 1
    // plus the two steps.
    await page.getByRole('button', { name: 'The Thesis-Driven Essay' }).click();
    await expect(page.getByRole('link', { name: /slide deck/i })).toHaveCount(3);

    const response = await page.request.get('/api/thesis-essay-deck/lesson-2-pre-writing');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(response.headers()['content-disposition']).toContain('.pptx');
    // A .pptx is a zip: it starts with "PK".
    expect((await response.body()).subarray(0, 2).toString()).toBe('PK');
  });

  test('has no decks on other assignment types', async ({ page, signIn, e2eContext }) => {
    await setThesisEssayDecksFlag(true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Daily Pages' })).toBeVisible();
    await expect(page.getByRole('link', { name: /slide deck/i })).toHaveCount(0);
  });
});
