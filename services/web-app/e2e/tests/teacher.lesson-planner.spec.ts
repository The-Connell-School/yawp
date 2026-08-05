import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { readFile } from 'node:fs/promises';

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

/**
 * A kept reply whose deck the schema rejects — the state a teacher lands in
 * when even the repair pass could not save it. What must never happen is the
 * JSON showing up on screen.
 */
async function seedUnreadableDeck(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const broken = {
    title: 'Conclusions that land',
    // No speakerNotes, and a bullets slide with no bullets.
    slides: [{ layout: 'bullets', title: 'What a conclusion does' }],
  };
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Broken deck lesson',
        messages: {
          create: [
            {
              role: 'assistant',
              content: `## Conclusions that land\n\nHere is the deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(
                broken
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

/** A reply carrying a handout and a sample, neither of them kept yet. */
async function seedLessonWithMaterials(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const content = [
    '## Objective',
    '',
    'Explain what a piece of evidence proves, not just what it says.',
    '',
    '## Lesson Sequence',
    '',
    'Project the two drafts below, then hand out the practice set.',
    '',
    '```yawp-material',
    'kind: sample',
    'title: Two conclusions, side by side',
    '---',
    '**Draft A.** In conclusion, this essay has shown many things.',
    '',
    '**Draft B.** The door slams because she is finished asking.',
    '```',
    '',
    '```yawp-material',
    'kind: handout',
    'title: Diagnose & Repair',
    '---',
    'Read each excerpt. Underline the sentence that explains the quote.',
    '```',
  ].join('\n');
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Evidence lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content,
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
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

/** The same handout twice: the original, then a rewrite claiming its slot. */
async function seedRevisedHandout(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const block = (slot: string, body: string) =>
    [
      '```yawp-material',
      'kind: handout',
      `slot: ${slot}`,
      'title: Diagnose & Repair',
      '---',
      body,
      '```',
    ].join('\n');
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Revision lesson',
        messages: {
          create: [
            {
              role: 'assistant',
              content: `## Lesson\n\nHere it is.\n\n${block(
                'handout:diagnose-repair',
                'The long version.'
              )}`,
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content: `## Shorter\n\nTightened it.\n\n${block(
                'handout:diagnose-repair',
                'The shorter version.'
              )}`,
              createdAt: new Date('2026-08-05T10:01:00.000Z'),
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

/** An intake turn that asks with controls rather than in prose. */
async function seedAskTurn(
  e2eContext: { teacherMembershipId: string; organizationId: string },
  block: string,
  /** Options the reply offers alongside the controls, one per line. */
  suggestions?: string
) {
  const prisma = createE2EPrismaClient();
  const offered = suggestions
    ? `\n\n\`\`\`suggestions\n${suggestions}\n\`\`\``
    : '';
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Intake lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content: `Before I plan, two quick things.\n\n\`\`\`yawp-ask\n${block}\n\`\`\`${offered}`,
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
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

/** A reply whose warm-up prompt the planner wrote itself. */
async function seedWrittenWarmUp(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Warm-up lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Warm-up (7 min)\n\nPost this and give them four minutes to write.\n\n' +
                '```yawp-daily-pages\n' +
                'Think of the last time you tried to convince someone of something.\n' +
                '```\n\n' +
                '## Mini-lesson\n\nWhat evidence actually does.',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
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

/**
 * A plain lesson plan carrying no artifacts, so the follow-on offers are both
 * still on the table. A reply that already built a handout suppresses that
 * offer on purpose, which is a different case.
 */
async function seedBareLessonPlan(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Bare plan',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Objective\n\nExplain what a quote proves.\n\n## Lesson Sequence\n\nWarm-up, mini-lesson, practice.',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
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
    await expect(bar).toContainText(/1 resource/i);

    // The second reply is a handout, so it is kept for students.
    await replies
      .nth(1)
      .getByRole('button', { name: /keep as a handout/i })
      .click();
    await expect(bar).toContainText(/2 resources/i);

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
    const handout = page
      .locator('[data-testid="packet-section"][data-audience="student"]')
      .first();
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
      page
        .locator('[data-testid="packet-section"][data-audience="student"]')
        .first()
    ).toBeInViewport();

    // Filtering narrows the document to one kind of material.
    await index.getByRole('button', { name: 'Handout', exact: true }).click();
    await expect(
      page.locator('[data-testid="packet-section"][data-audience="student"]')
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid="packet-section"][data-audience="teacher"]')
    ).toHaveCount(0);
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

  test('shows the lesson and a way forward when a deck will not build', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId, messageId } = await seedUnreadableDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // The lesson itself still arrives.
    await expect(page.locator('main')).toContainText('Conclusions that land');
    await expect(page.locator('main')).toContainText('Here is the deck.');
    // The machinery does not.
    await expect(page.locator('body')).not.toContainText('speakerNotes');
    await expect(page.locator('body')).not.toContainText('yawp-slides');
    await expect(page.locator('body')).not.toContainText('"layout"');
    // And the teacher is told what to do instead of being left guessing.
    await expect(page.locator('main')).toContainText('rebuild it, shorter');
    // Nothing pretends to be presentable.
    await expect(page.getByTestId('slide-deck-card')).toHaveCount(0);

    const response = await page.goto(`/present/${conversationId}/${messageId}`);
    expect(response?.status()).toBe(404);
  });

  test('hands over a handout as a thing, not as text to copy out', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const cards = page.getByTestId('material-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('Two conclusions, side by side');
    await expect(cards.nth(1)).toContainText('Diagnose & Repair');
    // The plan around them still reads as a plan.
    await expect(page.locator('main')).toContainText('Lesson Sequence');
    // The machinery never surfaces.
    await expect(page.locator('main')).not.toContainText('yawp-material');
    await expect(page.locator('main')).not.toContainText('kind: handout');

    // The material itself is one click away, not pasted into the plan.
    await expect(page.locator('main')).not.toContainText('Underline the');
    await cards.nth(1).getByText('Diagnose & Repair').click();
    await expect(cards.nth(1)).toContainText('Underline the sentence');
  });

  test('opens the packet from a material alone, with no reply kept', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    await expect(page.getByTestId('lesson-packet-bar')).toHaveCount(0);

    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .getByTestId('material-card')
      .first()
      .getByTestId('material-toggle')
      .click();
    await save;

    // Filing a handout puts something in the packet, so there has to be a way
    // to get to it — without keeping the whole lesson plan first.
    const bar = page.getByTestId('lesson-packet-bar');
    await expect(bar).toContainText(/1 resource/i);
    await bar.getByRole('link', { name: /open lesson packet/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/lesson-planner/${conversationId}/packet`)
    );
  });

  test('prints material inside a kept reply as material, not as a code block', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const keep = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .locator('[data-role="assistant"]')
      .first()
      .getByRole('button', { name: /keep for the lesson/i })
      .click();
    await keep;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // The header and fence must never reach the page.
    await expect(page.locator('main')).not.toContainText('kind: sample');
    await expect(page.locator('main')).not.toContainText('yawp-material');
    // The material still prints, as material.
    await expect(page.locator('main')).toContainText(
      'Two conclusions, side by side'
    );
    await expect(page.locator('main')).toContainText('The door slams');
    // And its headings are not mistaken for stages of the lesson.
    await page.getByRole('button', { name: /outline/i }).click();
    await expect(page.locator('main')).not.toContainText('Draft A');
  });

  test('puts one material in the packet without keeping the whole plan', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const handout = page.getByTestId('material-card').nth(1);
    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await handout.getByTestId('material-toggle').click();
    await save;
    await expect(handout.getByTestId('material-toggle')).toContainText(
      'In the packet'
    );

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    // The handout is there, printable, with a name-and-date line…
    await expect(page.locator('main')).toContainText('Diagnose & Repair');
    await expect(page.locator('main')).toContainText('Underline the sentence');
    await expect(page.locator('main')).toContainText('Name ___');
    // …and the lesson plan the teacher did not keep is not.
    await expect(page.locator('main')).not.toContainText('Lesson Sequence');
  });

  test('remembers which materials are already in the packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const toggle = page
      .getByTestId('material-card')
      .first()
      .getByTestId('material-toggle');
    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await toggle.click();
    await save;

    await page.reload();
    await expect(
      page.getByTestId('material-card').first().getByTestId('material-toggle')
    ).toContainText('In the packet');
    // The one beside it is untouched.
    await expect(
      page.getByTestId('material-card').nth(1).getByTestId('material-toggle')
    ).toContainText('Add to packet');
  });

  test('combines the student pieces into one handout to lead a class through', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // File both pieces, then go and combine them.
    for (const index of [0, 1]) {
      const save = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await page
        .getByTestId('material-card')
        .nth(index)
        .getByTestId('material-toggle')
        .click();
      await save;
    }

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByRole('button', { name: /student handout/i }).click();

    const parts = page.getByTestId('handout-part');
    await expect(parts).toHaveCount(2);
    await expect(parts.first()).toContainText('Part 1.');
    await expect(parts.first()).toContainText('Two conclusions, side by side');
    await expect(parts.nth(1)).toContainText('Part 2.');
    await expect(parts.nth(1)).toContainText('Diagnose & Repair');
    // One name/date line for the packet, not one per piece.
    await expect(page.getByText(/^Name _+$/)).toHaveCount(1);

    // The teacher can leave a piece out, and the numbering follows.
    await page
      .getByRole('checkbox', { name: 'Two conclusions, side by side' })
      .uncheck();
    await expect(parts).toHaveCount(1);
    await expect(parts.first()).toContainText('Part 1.');
    await expect(parts.first()).toContainText('Diagnose & Repair');
  });

  test('prints the student handout without the teacher’s plan', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .getByTestId('material-card')
      .nth(1)
      .getByTestId('material-toggle')
      .click();
    await save;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByRole('button', { name: /student handout/i }).click();

    // What actually reaches paper, rather than what the screen shows.
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('handout-part')).toBeVisible();
    await expect(page.locator('main')).toContainText('Underline the sentence');
    // The controls and the include/exclude list are not part of the handout.
    await expect(page.getByTestId('packet-print')).toBeHidden();
    await expect(page.getByTestId('packet-save-pdf')).toBeHidden();
    await expect(page.getByText('What goes in this handout')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });

  test('prints one resource on its own when asked to', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    // window.print() is a no-op in headless Chromium, so stub it to keep the
    // page in its printing state and assert what would have gone to paper.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const sections = page.locator('[data-testid="packet-section"]');
    await expect(sections).toHaveCount(2);

    await sections
      .nth(1)
      .getByRole('button', { name: /print this/i })
      .click();

    await page.emulateMedia({ media: 'print' });
    // Only the resource the teacher asked for goes to paper.
    await expect(sections.nth(0)).toBeHidden();
    await expect(sections.nth(1)).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });

  test('downloads the lesson as a real PDF in one click', async ({
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
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const lessonName = (
      await page.locator('article h1').first().textContent()
    )?.trim();
    expect(lessonName).toBeTruthy();

    // One click, one file — no print dialog to steer.
    const download = page.waitForEvent('download');
    await page.getByTestId('packet-save-pdf').click();
    const file = await download;

    expect(file.suggestedFilename()).toBe(`${lessonName}.pdf`);
    const path = await file.path();
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('%%EOF');
    // A whole lesson, not an empty shell.
    expect(bytes.length).toBeGreaterThan(2000);
  });

  test('downloads the student handout when that is what is on screen', async ({
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
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByRole('button', { name: /student handout/i }).click();

    const download = page.waitForEvent('download');
    await page.getByTestId('packet-save-pdf').click();
    const file = await download;

    // The file says which one it is, so the two do not collide in Downloads.
    expect(file.suggestedFilename()).toContain('Student handout');
    expect(file.suggestedFilename().endsWith('.pdf')).toBe(true);
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('still offers a plain Print for paper', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await page.addInitScript(() => {
      (window as any).__printed = 0;
      window.print = () => {
        (window as any).__printed += 1;
      };
    });
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    await page.getByTestId('packet-print').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__printed))
      .toBe(1);
  });

  test('offers the deck and the handout the moment a plan lands', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedBareLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The seeded reply is a plan that built nothing, so both follow-ons are
    // pinned by the app rather than left to whatever the model suggested.
    await expect(
      page.getByRole('button', {
        name: /build the slide deck for this lesson/i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /build the student handout for this lesson/i,
      })
    ).toBeVisible();
  });

  test('a revised handout takes the place of the one in the packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedRevisedHandout(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const cards = page.getByTestId('material-card');
    await expect(cards).toHaveCount(2);

    // File the first version, then the rewrite that claims the same slot.
    for (const index of [0, 1]) {
      const save = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await cards.nth(index).getByTestId('material-toggle').click();
      await save;
    }

    // The original stops claiming to be filed — there is one handout, not two.
    await expect(cards.nth(0).getByTestId('material-toggle')).toContainText(
      'Add to packet'
    );
    await expect(cards.nth(1).getByTestId('material-toggle')).toContainText(
      'In the packet'
    );

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.locator('main')).toContainText('The shorter version.');
    await expect(page.locator('main')).not.toContainText('The long version.');
  });

  test('files a deck on its own and presents it from the packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('deck-toggle').click();
    await save;
    await expect(page.getByTestId('deck-toggle')).toContainText(
      'In the packet'
    );

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    // The seeded reply is kept too, so the filed deck is the later card.
    const card = page.getByTestId('slide-deck-card').last();
    await expect(card).toContainText('Evidence that earns its place');
    await card.getByRole('link', { name: /present/i }).click();
    await expect(page.getByTestId('slide-counter')).toHaveText('1 / 3');
  });

  test('asks for the lesson length on a spectrum instead of in prose', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(e2eContext, 'minutes: 50');
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The request itself is machinery and never reaches the teacher as text.
    await expect(page.locator('main')).not.toContainText('yawp-ask');
    await expect(page.locator('main')).toContainText('Before I plan');

    const card = page.getByTestId('lesson-ask-card');
    await expect(card).toBeVisible();
    // It opens on the planner's own guess, so agreeing costs one tap.
    await expect(page.getByTestId('lesson-minutes-value')).toHaveText('50 min');

    const slider = page.getByRole('slider', {
      name: /lesson length in minutes/i,
    });
    await slider.fill('90');
    await expect(page.getByTestId('lesson-minutes-value')).toHaveText(
      '1 hr 30 min'
    );
    await slider.fill('5');
    await expect(page.getByTestId('lesson-minutes-value')).toHaveText('5 min');
  });

  test('sends the activities a teacher checks as their own message', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(
      e2eContext,
      'minutes: 45\nactivities'
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    await page.getByRole('checkbox', { name: 'Jigsaw' }).check();
    await page.getByRole('checkbox', { name: 'Gallery walk' }).check();

    const sent = page.waitForRequest(
      (request) =>
        request.url().includes('/api/domain/lesson-planner') &&
        request.method() === 'POST'
    );
    await page.getByTestId('lesson-ask-send').click();
    const request = await sent;

    // It leaves as a sentence the teacher could have typed themselves.
    expect(request.postData()).toContain('45+minutes.');
    expect(request.postData()).toContain('Jigsaw');
    expect(request.postData()).toContain('Gallery+walk');
  });

  test('always offers to let the planner pick the activities', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(e2eContext, 'activities');
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // No length was asked for, so no slider is drawn.
    await expect(
      page.getByRole('slider', { name: /lesson length in minutes/i })
    ).toHaveCount(0);

    const handBack = page.getByRole('checkbox', {
      name: /you pick the ones that fit/i,
    });
    await expect(handBack).toBeVisible();
    await page.getByRole('checkbox', { name: 'Jigsaw' }).check();
    await handBack.check();
    // Handing the choice back clears what was picked — the two contradict.
    await expect(
      page.getByRole('checkbox', { name: 'Jigsaw' })
    ).not.toBeChecked();

    const sent = page.waitForRequest(
      (request) =>
        request.url().includes('/api/domain/lesson-planner') &&
        request.method() === 'POST'
    );
    await page.getByTestId('lesson-ask-send').click();
    const request = await sent;
    expect(request.postData()).toContain('You+pick+the+activities');
  });

  test('carries the chosen option and the length in one message', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(
      e2eContext,
      'minutes: 50',
      'Build it around Evidence/Support\nFocus on integrating quotes'
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const card = page.getByTestId('lesson-ask-card');
    const option = page.getByRole('button', {
      name: 'Build it around Evidence/Support',
    });
    // Exactly one of them, and it is inside the card — two independent senders
    // on one turn meant whichever the teacher touched first threw the other
    // answer away.
    await expect(option).toHaveCount(1);
    await expect(
      card.getByRole('button', { name: /evidence\/support/i })
    ).toBeVisible();

    await option.click();
    await page
      .getByRole('slider', { name: /lesson length in minutes/i })
      .fill('45');

    const sent = page.waitForRequest(
      (request) =>
        request.url().includes('/api/domain/lesson-planner') &&
        request.method() === 'POST'
    );
    await page.getByTestId('lesson-ask-send').click();
    const request = await sent;

    // One message, carrying the subject and then its length.
    expect(request.postData()).toContain('Build+it+around+Evidence%2FSupport.');
    expect(request.postData()).toContain('45+minutes.');
  });

  test('turns a warm-up it wrote into a Daily Pages exercise', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedWrittenWarmUp(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The prompt is shown as students would read it, never as a fence.
    await expect(page.locator('main')).not.toContainText('yawp-daily-pages');
    const card = page.getByTestId('daily-pages-card');
    await expect(card).toContainText(
      'Think of the last time you tried to convince someone'
    );

    // And it is one click from being a real assignment, prompt already in it.
    await card.getByTestId('daily-pages-create').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
      )
    );
    await expect(page.locator('#assignment-create-prompt')).toHaveValue(
      /Think of the last time you tried to convince someone/
    );
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

  test('always offers the data-driven option on the opening reply', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const prisma = createE2EPrismaClient();
    let conversationId: string;
    try {
      const conversation = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: 'Opening turn',
          messages: {
            create: [
              {
                role: 'user',
                content: 'Help me plan a lesson.',
                createdAt: new Date('2026-08-04T10:00:00.000Z'),
              },
              {
                // The model offered only room-personality options, and none of
                // them hands the choice back to the data.
                role: 'assistant',
                content:
                  'Which class, and what is the room like?\n\n```suggestions\n10th grade, 50 min, talkative\n11th grade, 45 min, quiet\n```',
                createdAt: new Date('2026-08-04T10:00:01.000Z'),
              },
            ],
          },
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Pinned by the app, first, whatever the model happened to suggest.
    const chips = page.getByRole('button', { name: /^↳?\s*(10th|11th|Look)/ });
    await expect(
      page.getByRole('button', {
        name: /look at my classes and tell me what they need work on/i,
      })
    ).toBeVisible();
    await expect(chips.first()).toContainText(/look at my classes/i);

    // The teacher never said a word about the room, so the app does not offer
    // "talkative" and "quiet" versions of the same question.
    await expect(
      page.getByRole('button', { name: /10th grade, 50 min$/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /11th grade, 45 min$/ })
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText('talkative');
  });

  test('keeps the room in the options once the teacher raises it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const prisma = createE2EPrismaClient();
    let conversationId: string;
    try {
      const conversation = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: 'Room raised',
          messages: {
            create: [
              {
                role: 'user',
                content:
                  'My second period is really talkative but third is like pulling teeth.',
                createdAt: new Date('2026-08-04T10:00:00.000Z'),
              },
              {
                role: 'assistant',
                content:
                  'Got it.\n\n```suggestions\n10th grade, 50 min, talkative\n11th grade, 45 min, quiet\n```',
                createdAt: new Date('2026-08-04T10:00:01.000Z'),
              },
            ],
          },
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    await expect(
      page.getByRole('button', { name: /10th grade, 50 min, talkative/ })
    ).toBeVisible();
  });
});
