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

/**
 * Write a planning conversation with two assistant replies straight to the DB,
 * so the packet tests exercise the packet rather than the model.
 */
async function seedLessonPlan(
  e2eContext: { teacherMembershipId: string; organizationId: string },
  {
    keepFirst = false,
    keepLongHandout = false,
  }: { keepFirst?: boolean; keepLongHandout?: boolean } = {}
) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Conclusions lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on conclusions.',
              createdAt: new Date('2026-08-04T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Warm-up (5 min)\n\nDaily Pages prompt FW-001.\n\n### Teacher moves\n\nCircle the room.',
              createdAt: new Date('2026-08-04T10:00:01.000Z'),
              ...(keepFirst
                ? {
                    keptAt: new Date('2026-08-04T10:05:00.000Z'),
                    keptAudience: 'teacher',
                  }
                : {}),
            },
            {
              role: 'assistant',
              // Paragraphs, not a numbered list: Markdown turns "1." into a
              // list marker, so the number never appears in the DOM text.
              content: keepLongHandout
                ? `## Conclusion practice handout\n\n${Array.from(
                    { length: 40 },
                    (_unused, index) =>
                      `Practice item ${index + 1}: rewrite this conclusion so it answers "so what?".`
                  ).join('\n\n')}`
                : '## Conclusion practice handout\n\nRewrite each conclusion so it answers "so what?".',
              createdAt: new Date('2026-08-04T10:00:02.000Z'),
              ...(keepLongHandout
                ? {
                    keptAt: new Date('2026-08-04T10:05:01.000Z'),
                    keptAudience: 'student',
                  }
                : {}),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function clearLessonPlans(membershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.deleteMany({ where: { membershipId } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A conversation whose kept reply carries a real structured deck, so the
 * presenter can be exercised without calling a model.
 */
async function seedSlideDeck(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const deck = {
    title: 'Evidence that earns its place',
    subtitle: 'English 10 · Period 3',
    slides: [
      {
        layout: 'title',
        title: 'Evidence that earns its place',
        subtitle: 'Why some quotes land',
        speakerNotes: 'Set the stakes before naming the skill.',
        minutes: 1,
      },
      {
        layout: 'compare',
        title: 'Which one makes you cringe?',
        left: { label: 'Version A', text: 'The author says the door slammed.' },
        right: {
          label: 'Version B',
          text: 'When the door slams, she is done talking.',
        },
        speakerNotes: 'Three silent minutes of writing before anyone speaks.',
        minutes: 5,
      },
      {
        layout: 'closing',
        title: 'Exit ticket',
        body: 'Rewrite one sentence from your draft.',
        speakerNotes: 'Collect on the way out.',
        minutes: 3,
      },
    ],
  };
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Deck lesson',
        messages: {
          create: [
            {
              role: 'assistant',
              content: `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(
                deck
              )}\n\`\`\``,
              createdAt: new Date('2026-08-04T10:00:01.000Z'),
              keptAt: new Date('2026-08-04T10:05:00.000Z'),
              keptAudience: 'teacher',
            },
          ],
        },
      },
      select: { id: true, messages: { select: { id: true } } },
    });
    return {
      conversationId: conversation.id,
      messageId: conversation.messages[0]!.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('YAWP! Lesson Planner', () => {
  test.afterEach(async ({ e2eContext }) => {
    // Leave the org in its default (disabled) state for other specs.
    await setLessonPlannerEnabled(e2eContext.organizationId, false);
    // Seeded lessons would otherwise pile up across tests and retries, and the
    // library legitimately shows every one of them.
    await clearLessonPlans(e2eContext.teacherMembershipId);
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

  test('keeps replies and turns them into a printable lesson packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Nothing is in the packet until the teacher keeps something.
    await expect(page.getByTestId('lesson-packet-bar')).toHaveCount(0);

    const replies = page.locator('[data-role="assistant"]');
    await replies
      .nth(0)
      .getByRole('button', { name: /keep for the lesson/i })
      .click();

    const bar = page.getByTestId('lesson-packet-bar');
    await expect(bar).toContainText(/1 section/i);

    // The second reply is a handout, so it is kept for students.
    await replies
      .nth(1)
      .getByRole('button', { name: /keep as a handout/i })
      .click();
    await expect(bar).toContainText(/2 sections/i);

    await bar.getByRole('link', { name: /open lesson packet/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/lesson-planner/${conversationId}/packet`)
    );

    // The document names itself and carries both kept sections, in order.
    await expect(
      page.getByRole('heading', { name: /warm-up/i, level: 2 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /conclusion practice/i, level: 2 })
    ).toBeVisible();
    await expect(page.getByText(/5 min/i).first()).toBeVisible();

    // The handout is marked as student-facing and gets a name/date line.
    const handout = page.getByTestId('packet-section-student').first();
    await expect(handout).toBeVisible();
    await expect(handout).toContainText(/name/i);

    // The outline view collapses the packet to what fits beside a laptop.
    await page.getByRole('button', { name: /outline/i }).click();
    await expect(page.getByTestId('packet-outline')).toContainText('Warm-up');
    await expect(page.getByTestId('packet-outline')).not.toContainText(
      'Daily Pages prompt FW-001'
    );
  });

  test('names the packet and keeps the name', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const nameField = page.getByLabel('Lesson name');
    await nameField.fill('Conclusions, period 3');
    // The name saves on blur; reloading before that request lands would race it.
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await nameField.blur();
    await saved;

    await page.reload();
    await expect(page.getByLabel('Lesson name')).toHaveValue(
      'Conclusions, period 3'
    );
  });

  test('collects kept lessons in the lesson library', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const kept = await seedLessonPlan(e2eContext, { keepFirst: true });
    const draft = await seedLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto('/app/lesson-planner');
    await page.getByRole('link', { name: /lesson library/i }).click();
    await expect(page).toHaveURL(/\/app\/lesson-planner\/library/);

    // The lesson with something kept is a document; the untouched draft is not
    // yet a lesson and stays out of the library. Assert on the two specific
    // lessons rather than a row count — the library shows every kept lesson,
    // and the app shell contributes list items of its own.
    const keptLink = page.locator(
      `a[href="/app/lesson-planner/${kept.conversationId}/packet"]`
    );
    const draftLink = page.locator(
      `a[href="/app/lesson-planner/${draft.conversationId}/packet"]`
    );
    await expect(keptLink).toHaveCount(1);
    await expect(draftLink).toHaveCount(0);
    await expect(
      page.getByRole('listitem').filter({ has: keptLink })
    ).toContainText(/1 section/i);

    await keptLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/app/lesson-planner/${kept.conversationId}/packet`)
    );
  });

  test('scrolls the whole packet when a handout runs past the viewport', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // A handout prints with open leading, so it runs long on screen too. The
    // app shell is a fixed-height frame, so the packet has to own its scroll —
    // without it the end of the document is simply unreachable.
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // The packet must be the scroll container itself. `overflow: hidden` is
    // still scrollable programmatically, so scrollIntoView would pass even
    // when the bug is present — this checks what a teacher can actually do.
    const scroller = page.getByTestId('packet-scroll');
    const overflows = await scroller.evaluate(
      (node) => node.scrollHeight > node.clientHeight
    );
    expect(overflows).toBe(true);

    const lastLine = page.getByText('Practice item 40:');
    await expect(lastLine).toHaveCount(1);
    await expect(lastLine).not.toBeInViewport();

    // A real wheel gesture, which a clipped container would not answer.
    await page.mouse.move(640, 400);
    await expect(async () => {
      await page.mouse.wheel(0, 4000);
      await expect(lastLine).toBeInViewport({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
  });

  test('browses saved resources from the lesson index', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // Every saved resource is listed, so nothing has to be scrolled for.
    const index = page.getByTestId('resource-index');
    await expect(index).toContainText('Warm-up');
    await expect(index).toContainText('Conclusion practice handout');

    // Jumping goes to the resource rather than the top of the document.
    await index.getByRole('button', { name: /conclusion practice/i }).click();
    await expect(
      page.getByTestId('packet-section-student').first()
    ).toBeInViewport();

    // Filtering narrows the document to one kind of material.
    await index.getByRole('button', { name: 'Handout', exact: true }).click();
    await expect(page.getByTestId('packet-section-student')).toHaveCount(1);
    await expect(page.getByTestId('packet-section-teacher')).toHaveCount(0);
  });

  test('renames a saved resource and keeps the name', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const nameField = page.getByLabel('Name for Warm-up (5 min)');
    await nameField.fill('Bell-ringer');
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await nameField.blur();
    await saved;

    await page.reload();
    // The index and the document both use the teacher's name for it.
    await expect(page.getByTestId('resource-index')).toContainText(
      'Bell-ringer'
    );
    // The timing still comes from the lesson, not from the new label.
    await expect(page.getByTestId('resource-index')).toContainText('5m');
  });

  test('names the lesson once, everywhere', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const nameField = page.getByLabel('Lesson name');
    await nameField.fill('Conclusions, period 3');
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await nameField.blur();
    await saved;

    // The planner rail and the library both follow the packet's name.
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await expect(
      page.getByRole('button', { name: 'Conclusions, period 3' })
    ).toBeVisible();

    await page.goto('/app/lesson-planner/library');
    await expect(
      page.getByRole('link', { name: 'Conclusions, period 3' })
    ).toBeVisible();
  });

  test('shows a deck as a deck, never as raw JSON', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const card = page.getByTestId('slide-deck-card');
    await expect(card).toContainText('Evidence that earns its place');
    await expect(card).toContainText('3 slides');
    await expect(card).toContainText('9 min');
    // The machinery must never surface to a teacher.
    await expect(page.locator('body')).not.toContainText('speakerNotes');
    await expect(page.locator('body')).not.toContainText('yawp-slides');
  });

  test('presents the deck with keyboard control and speaker notes', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId, messageId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/present/${conversationId}/${messageId}`);

    const stage = page.getByTestId('slide-stage');
    const counter = page.getByTestId('slide-counter');
    await expect(stage).toContainText('Evidence that earns its place');
    await expect(counter).toHaveText('1 / 3');

    // Arrow keys and space are what a presenter remote sends.
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 3');
    await expect(stage).toContainText('Which one makes you cringe?');
    // The compare layout puts the two versions side by side, not in a list.
    await expect(stage).toContainText('Version A');
    await expect(stage).toContainText('Version B');

    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('1 / 3');
    await page.keyboard.press('End');
    await expect(counter).toHaveText('3 / 3');

    // Notes are for the teacher's screen and never on the slide itself.
    await expect(page.getByTestId('speaker-notes')).toHaveCount(0);
    await page.keyboard.press('n');
    const notes = page.getByTestId('speaker-notes');
    await expect(notes).toContainText('Collect on the way out.');
    await expect(stage).not.toContainText('Collect on the way out.');
  });

  test('refuses to present a reply that has no deck in it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    const response = await page.goto(
      `/present/${conversationId}/not-a-deck-message`
    );
    expect(response?.status()).toBe(404);
  });
});
