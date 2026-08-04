import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';

async function setLessonPlannerEnabled(
  organizationId: string,
  enabled: boolean
) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { lessonPlannerEnabled: enabled },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Write a ready class summary straight to the DB so the hand-off test does not
 * depend on the insight generation path (covered by its own spec).
 */
async function seedClassInsight(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const summaryJson = {
      overview: 'The class argues well but lands its essays softly.',
      categories: [
        {
          key: 'organization_and_structure',
          label: 'Organization/Structure',
          status: 'gap',
          summary: 'Conclusions restate the introduction.',
        },
      ],
      nextSteps: [
        {
          title: 'Teach conclusions that answer "so what?"',
          detail: 'Model two conclusions side by side, then revise their own.',
          rubricCategory: 'organization_and_structure',
        },
      ],
    };
    await prisma.classAssignmentInsight.upsert({
      where: { classAssignmentId },
      create: {
        classAssignmentId,
        status: 'ready',
        submissionCount: 12,
        generatedAt: new Date(),
        summaryJson,
      },
      update: {
        status: 'ready',
        submissionCount: 12,
        generatedAt: new Date(),
        summaryJson,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function clearClassInsight(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('YAWP! Lesson Planner', () => {
  test.afterEach(async ({ e2eContext }) => {
    // Leave the org in its default (disabled) state for other specs.
    await setLessonPlannerEnabled(e2eContext.organizationId, false);
  });

  test('is hidden and unreachable when the org flag is off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // No sidebar entry.
    await expect(
      page.getByRole('link', { name: 'Lesson Planner' })
    ).toHaveCount(0);

    // Direct navigation redirects back into the app, away from the planner.
    await page.goto('/app/lesson-planner');
    await expect(page).toHaveURL(/\/app(?!\/lesson-planner)/);
  });

  test('lets an enabled teacher open the planner and start a lesson', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // The planner appears in the sidebar and opens.
    await page.getByRole('link', { name: 'Lesson Planner' }).click();
    await expect(page).toHaveURL(/\/app\/lesson-planner/);

    // Empty state with the recommended starter prompts.
    await expect(
      page.getByRole('heading', { name: /what are we teaching/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /same topic, two very different/i })
    ).toBeVisible();

    // Picking a starter prompt optimistically posts the teacher's message.
    await page
      .getByRole('button', { name: /same topic, two very different/i })
      .click();
    await expect(page.locator('[data-role="user"]').first()).toBeVisible();
    await expect(page.getByText(/planning the lesson/i)).toBeVisible();
  });

  test('supports typing a lesson request', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');

    const composer = page.getByLabel('Message the Lesson Planner');
    await composer.fill('Help me teach conclusion paragraphs.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(
      page.getByText('Help me teach conclusion paragraphs.')
    ).toBeVisible();
    // Composer clears after sending.
    await expect(composer).toHaveValue('');
  });

  test('opens from a Class Summary next step with the ask pre-filled', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await seedClassInsight(e2eContext.classAssignmentId);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/assignments/${e2eContext.assignmentId}`
    );
    await expect(page.getByText(/suggested next steps/i)).toBeVisible();

    await page.getByRole('link', { name: /plan this lesson/i }).click();

    // Ids in the URL, not prompt text.
    await expect(page).toHaveURL(
      new RegExp(
        `/app/lesson-planner\\?from=${e2eContext.classAssignmentId}&step=0`
      )
    );

    // The planner explains where the lesson came from and pre-fills the ask,
    // without sending it — the teacher can add their own context first.
    await expect(page.getByTestId('lesson-planner-seed')).toContainText(
      /so what/i
    );
    await expect(page.getByLabel('Message the Lesson Planner')).toHaveValue(
      /Teach conclusions that answer "so what\?"/
    );
    await expect(page.locator('[data-role="user"]')).toHaveCount(0);

    await clearClassInsight(e2eContext.classAssignmentId);
  });

  test('keeps planner controls in bounds at desktop and mobile breakpoints', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/app/lesson-planner');

      const composer = page.getByLabel('Message the Lesson Planner');
      const send = page.getByRole('button', { name: 'Send message' });
      await expect(composer).toBeVisible();
      await expect(send).toBeVisible();
      if (viewport.width === 390) {
        await expect(page.getByLabel('Saved lessons')).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'New lesson' })
        ).toBeVisible();
      }

      for (const control of [composer, send]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - window.innerWidth,
        document: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(overflow.body).toBeLessThanOrEqual(0);
      expect(overflow.document).toBeLessThanOrEqual(0);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
