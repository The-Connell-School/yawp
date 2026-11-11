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
  // The Faculty Lounge's Trainings: the Thesis-Driven Essay course, with one
  // lesson module that has a deck and one that has none.
  let trainingId = '';
  const trainingModuleIds: Record<string, string> = {};

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
      const training = await prisma.teacherTraining.create({
        data: {
          title: 'The Thesis-Driven Essay',
          description: 'Brian’s course.',
          position: 50,
          teacherTrainingModules: {
            create: [
              { title: 'Lesson 2: Pre-writing', position: 7, description: 'Pre-writing.' },
              { title: 'Lesson 8: Review my Essay (optional)', position: 13, description: 'Review.' },
            ],
          },
        },
        select: { id: true, teacherTrainingModules: { select: { id: true, title: true } } },
      });
      trainingId = training.id;
      for (const module of training.teacherTrainingModules) trainingModuleIds[module.title] = module.id;
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    await setThesisEssayDecksFlag(false);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.assignmentModule.deleteMany({ where: { id: { in: createdModuleIds } } });
      if (trainingId) {
        await prisma.teacherTrainingModule.deleteMany({ where: { teacherTrainingId: trainingId } });
        await prisma.teacherTraining.delete({ where: { id: trainingId } });
      }
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
    await expect(page.getByRole('link', { name: /powerpoint:|present:/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /lesson plan:/i })).toHaveCount(0);
    // The Teachers' Lounge pointer is unchanged.
    await expect(page.getByText(/lesson materials are available in the teachers/i)).toBeVisible();

    const response = await page.request.get('/api/thesis-essay-deck/lesson-2-pre-writing');
    expect(response.status()).toBe(404);
    const plan = await page.request.get('/api/thesis-essay-deck/lesson-2-pre-writing-lesson-plan');
    expect(plan.status()).toBe(404);
    await page.goto('/present/thesis-essay/lesson-2-pre-writing');
    await expect(page.getByTestId('slide-stage')).toHaveCount(0);
    const image = await page.request.get('/api/thesis-essay-deck-asset/fallen-man.jpg');
    expect(image.status()).toBe(404);
  });

  test('puts each step’s deck and lesson plan in its module, and they download', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setThesisEssayDecksFlag(true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);

    await page.getByRole('button', { name: 'Modules' }).click();
    await expect(page.getByText(/each module has its slide deck, to present here/i)).toBeVisible();
    // Day 1 has no step of its own, so its materials sit above the list.
    await expect(page.getByText(/introduce YAWP! on Day 1/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /powerpoint: lesson 1 · introduce students to yawp!/i })
    ).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-1-day-1');
    await expect(
      page.getByRole('link', { name: /present: lesson 1 · introduce students to yawp!/i })
    ).toHaveAttribute('href', /^\/present\/thesis-essay\/lesson-1-day-1\?from=/);
    await expect(
      page.getByRole('link', { name: /lesson plan: lesson 1 · introduce students to yawp!/i })
    ).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-1-day-1-lesson-plan');
    await expect(page.getByRole('link', { name: /student sign-up handout/i })).toHaveAttribute(
      'href',
      '/api/thesis-essay-deck/student-sign-up'
    );
    await expect(page.getByRole('link', { name: /sample essay handout/i })).toHaveAttribute(
      'href',
      '/api/thesis-essay-deck/sample-essay-bored-in-the-usa'
    );

    await page.getByRole('button', { name: 'Pre-writing' }).click();
    const preWriting = page.getByRole('link', { name: /powerpoint: lesson 2 · pre-writing/i });
    await expect(preWriting).toBeVisible();
    await expect(preWriting).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-2-pre-writing');
    await expect(
      page.getByRole('link', { name: /lesson plan: lesson 2 · pre-writing/i })
    ).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-2-pre-writing-lesson-plan');

    await page.getByRole('button', { name: 'Thesis Statement' }).click();
    await expect(
      page.getByRole('link', { name: /powerpoint: lesson 3 · thesis statement/i })
    ).toHaveAttribute('href', '/api/thesis-essay-deck/lesson-3-thesis-statement');

    // The placeholder module matches no lesson, so it gets no deck: Day 1
    // plus the two steps.
    await page.getByRole('button', { name: 'The Thesis-Driven Essay' }).click();
    await expect(page.getByRole('link', { name: /powerpoint:/i })).toHaveCount(3);
    await expect(page.getByRole('link', { name: /present:/i })).toHaveCount(3);
    await expect(page.getByRole('link', { name: /lesson plan:/i })).toHaveCount(3);

    const response = await page.request.get('/api/thesis-essay-deck/lesson-2-pre-writing');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(response.headers()['content-disposition']).toContain('.pptx');
    // A .pptx is a zip: it starts with "PK".
    expect((await response.body()).subarray(0, 2).toString()).toBe('PK');

    const plan = await page.request.get('/api/thesis-essay-deck/lesson-2-pre-writing-lesson-plan');
    expect(plan.status()).toBe(200);
    expect(plan.headers()['content-type']).toBe('application/pdf');
    expect(plan.headers()['content-disposition']).toContain('.pdf');
    expect((await plan.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('presents a deck on YAWP!, slide by slide with notes, and closes back to the page', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setThesisEssayDecksFlag(true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const typePage = `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`;
    await page.goto(typePage);
    await page.getByRole('button', { name: 'Modules' }).click();
    await page.getByRole('button', { name: 'Pre-writing' }).click();
    await page.getByRole('link', { name: /present: lesson 2 · pre-writing/i }).click();

    await expect(page).toHaveURL(/\/present\/thesis-essay\/lesson-2-pre-writing/);
    await expect(page.getByTestId('slide-stage')).toBeVisible();
    await expect(page.getByTestId('slide-counter')).toHaveText('1 / 24');
    await expect(page.getByTestId('current-slide').getByText('Pre-Writing', { exact: true })).toBeVisible();

    // Arrow keys are what a presenter remote sends. Wait for hydration
    // first: a key pressed before React attaches its listener goes nowhere.
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-counter')).toHaveText('2 / 24');
    await expect(page.getByTestId('current-slide').getByText(/What are we doing/)).toBeVisible();

    await page.getByRole('button', { name: 'Notes' }).click();
    await expect(page.getByTestId('speaker-notes')).toContainText('big picture');

    // The deck's pictures come through the gated asset route.
    const image = await page.request.get('/api/thesis-essay-deck-asset/fallen-man.jpg');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/jpeg');

    await page.getByRole('link', { name: 'Close' }).click();
    await expect(page).toHaveURL(new RegExp(`${typePage}$`));
  });

  test('puts each lesson’s deck in its Trainings module too', async ({ page, signIn, e2eContext }) => {
    await setThesisEssayDecksFlag(true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const lesson2 = `/app/teacher-trainings/${trainingId}/modules/${trainingModuleIds['Lesson 2: Pre-writing']}`;
    await page.goto(lesson2);

    const decks = page.getByTestId('teacher-training-thesis-deck');
    await expect(decks).toBeVisible();
    await expect(decks.getByRole('link', { name: /present: lesson 2 · pre-writing/i })).toHaveAttribute(
      'href',
      `/present/thesis-essay/lesson-2-pre-writing?from=${encodeURIComponent(lesson2)}`
    );
    await expect(decks.getByRole('link', { name: /powerpoint: lesson 2 · pre-writing/i })).toHaveAttribute(
      'href',
      '/api/thesis-essay-deck/lesson-2-pre-writing'
    );
    await expect(decks.getByRole('link', { name: /lesson plan: lesson 2 · pre-writing/i })).toHaveAttribute(
      'href',
      '/api/thesis-essay-deck/lesson-2-pre-writing-lesson-plan'
    );

    // Presenting from a training comes back to the training.
    await decks.getByRole('link', { name: /present: lesson 2 · pre-writing/i }).click();
    await expect(page.getByTestId('slide-counter')).toHaveText('1 / 24');
    await page.getByRole('link', { name: 'Close' }).click();
    await expect(page).toHaveURL(new RegExp(`${lesson2}$`));

    // Lesson 8 has no deck.
    await page.goto(`/app/teacher-trainings/${trainingId}/modules/${trainingModuleIds['Lesson 8: Review my Essay (optional)']}`);
    await expect(page.getByText('Lesson 8: Review my Essay (optional)').first()).toBeVisible();
    await expect(page.getByTestId('teacher-training-thesis-deck')).toHaveCount(0);

    // And nothing while the flag is off.
    await setThesisEssayDecksFlag(false);
    await page.goto(lesson2);
    await expect(page.getByText('Lesson 2: Pre-writing').first()).toBeVisible();
    await expect(page.getByTestId('teacher-training-thesis-deck')).toHaveCount(0);
  });

  test('has no decks on other assignment types', async ({ page, signIn, e2eContext }) => {
    await setThesisEssayDecksFlag(true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Daily Pages' })).toBeVisible();
    await expect(page.getByRole('link', { name: /powerpoint:|present:/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /lesson plan:/i })).toHaveCount(0);
  });
});
