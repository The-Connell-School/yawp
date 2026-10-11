/**
 * Lesson Planner changes from Brian's review session
 * (docs/plans/2026-10-11-lesson-planner-brian-review.md).
 *
 * Every reply here is seeded: the model is never called. Each change sits
 * behind its own flag, so most tests turn their flag on and the afterEach
 * turns every review flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  setLessonPlannerReviewFlag,
  type LessonPlannerReviewFlag,
} from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const REVIEW_FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_intake_v2',
  'lesson_planner_stack_v2',
  'lesson_planner_deck_v2',
];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(e2eContext: Ctx, turns: Turn[], title = 'Review lesson') {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 9, 11, 10, 0, index)),
          })),
        },
      },
      select: { id: true },
    });
    return conversation.id;
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

const PLAN =
  '# The Things They Carried — Day 1\n\n## Objective\n\nEnter the book through weight and burden.\n\n' +
  '## Class starter (8 min)\n\nWrite about something you carry.\n\n' +
  '## Reading (40 min)\n\nRead the first story together.';

const INTAKE_QUESTION = 'Which class is this for, and how long is the period?';

test.describe("Lesson Planner — Brian's review", () => {
  test.afterEach(async ({ e2eContext }) => {
    await clearLessonPlans(e2eContext.teacherMembershipId);
    for (const flag of REVIEW_FLAGS) {
      await setLessonPlannerReviewFlag(flag, false);
    }
  });

  test.describe('whole-reply stack controls (B4)', () => {
    test('flag off: every reply keeps the original two buttons', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan a lesson on The Things They Carried.' },
        { role: 'assistant', content: INTAKE_QUESTION },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      await expect(page.getByRole('button', { name: 'Add all of this' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Add all as a handout' })
      ).toBeVisible();
    });

    test('flag on: an intake question offers nothing to stack', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan a lesson on The Things They Carried.' },
        { role: 'assistant', content: INTAKE_QUESTION },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      await expect(page.getByText(INTAKE_QUESTION)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add all of this' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /add the whole lesson/i })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Add all as a handout' })
      ).toHaveCount(0);
    });

    test('flag on: a plan invites a stack and keeps the next-step chips', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan day one of The Things They Carried.' },
        { role: 'assistant', content: PLAN },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      await expect(page.getByTestId('plan-stack-invite')).toContainText(
        "You don't have to use all of these"
      );
      await expect(
        page.getByRole('button', { name: 'Add the whole lesson to the stack' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Add all as a handout' })
      ).toHaveCount(0);
      // The chips stay where they are.
      await expect(
        page.getByRole('button', { name: /build the slide deck/i })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Add the whole lesson to the stack' }).click();
      await expect(page.getByText('In the stack', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Remove from stack' }).click();
      await expect(
        page.getByRole('button', { name: 'Add the whole lesson to the stack' })
      ).toBeVisible();
    });
  });

  test.describe('the stack is the lesson (B1, B2, B5)', () => {
    const STARTERS =
      '## Class starter (8 min)\n\nPick one:\n\n' +
      '```yawp-daily-pages\nkind: class-starter\nWrite about something you carry every day.\n```\n\n' +
      '```yawp-daily-pages\nkind: class-starter\nWhat is the heaviest thing you have ever carried?\n```\n\n' +
      '## Reading (40 min)\n\nRead the first story together.';

    test('flag off: a class starter has no stack button', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan day one of The Things They Carried.' },
        { role: 'assistant', content: STARTERS },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);
      await expect(page.getByTestId('daily-pages-card')).toHaveCount(2);
      await expect(page.getByTestId('daily-pages-stack-toggle')).toHaveCount(0);
    });

    test('flag on: stack one starter, then remove it from the stack screen with Undo', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const id = await seedConversation(
        e2eContext,
        [
          {
            role: 'user',
            content:
              "I'm teaching 'the things they carried' for the first time and I don't really know how to begin.",
          },
          { role: 'assistant', content: STARTERS },
        ],
        "I'm teaching 'the things they carried' for the first time…"
      );
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      const toggles = page.getByTestId('daily-pages-stack-toggle');
      await expect(toggles).toHaveCount(2);
      const filed = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await toggles.nth(1).click();
      expect((await filed).ok()).toBe(true);
      await expect(toggles.nth(1)).toHaveText(/in the stack/i);
      await expect(toggles.nth(1)).toHaveAttribute('title', 'Click to remove from stack');
      await expect(toggles.nth(0)).toHaveText(/add to stack/i);

      await page.goto(`/app/lesson-planner/${id}/packet`);
      // B5: the raw first message is not presented as the lesson's name.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled lesson');
      await expect(page.getByLabel('Lesson name')).toHaveAttribute(
        'placeholder',
        'Name this lesson'
      );
      await expect(page.getByText("We'll name it from your plan, or type one.")).toBeVisible();

      const sections = page.getByTestId('packet-section');
      await expect(sections).toHaveCount(1);
      await expect(sections.first()).toContainText('heaviest thing');

      // Remove, then Undo.
      await page.getByTestId('section-remove').click();
      await expect(sections).toHaveCount(0);
      await page.getByTestId('remove-undo').getByRole('button', { name: 'Undo' }).click();
      await expect(sections).toHaveCount(1);

      // Remove for real: it is gone after a reload.
      await page.getByTestId('section-remove').click();
      await expect(page.getByTestId('remove-undo')).toBeHidden({ timeout: 10_000 });
      await page.reload();
      await expect(page.getByTestId('packet-section')).toHaveCount(0);

      // And the chat agrees.
      await page.goto(`/app/lesson-planner?c=${id}`);
      await expect(page.getByTestId('daily-pages-stack-toggle').nth(1)).toHaveText(
        /add to stack/i
      );
    });
  });

  test('builds a deck from the stack, from the stack screen (B6)', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    const id = await seedConversation(e2eContext, [
      { role: 'user', content: 'Plan day one of The Things They Carried.' },
      {
        role: 'assistant',
        content:
          PLAN +
          '\n\n```yawp-daily-pages\nkind: class-starter\nWrite about something you carry every day.\n```',
      },
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${id}`);

    // An empty stack keeps the original wording on the chip.
    await expect(
      page.getByRole('button', { name: 'Build the slide deck for this lesson' })
    ).toBeVisible();

    const filed = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('daily-pages-stack-toggle').click();
    expect((await filed).ok()).toBe(true);
    // Once something is filed, the chip says where the deck comes from.
    await expect(
      page.getByRole('button', { name: 'Build the slide deck from my stack' })
    ).toBeVisible();

    await page.goto(`/app/lesson-planner/${id}/packet`);
    await expect(page.getByTestId('build-from-stack')).toBeVisible();

    // The turn is held open: what matters is what was asked for.
    const asked: string[] = [];
    await page.route('**/api/domain/lesson-planner', (route) => {
      asked.push(route.request().postData() ?? '');
    });
    await page.getByRole('link', { name: 'Slide deck from this stack' }).click();
    await expect(page).toHaveURL(new RegExp(`c=${id}`));
    await expect
      .poll(() => asked.join('\n'))
      .toContain(encodeURIComponent('Build the slide deck from my stack').replace(/%20/g, '+'));
    // The one-shot parameter is gone, so a reload does not ask twice.
    await expect(page).not.toHaveURL(/build=/);
  });

  test.describe('intake: one decision per step, from real classes (A1–A3)', () => {
    const ASK =
      'Which class is this for, how long does it meet, and how do you want to fill the time?\n\n' +
      '```yawp-ask\nclasses\nminutes\n' +
      'choose: Read the whole first story together\n' +
      'choose: Just the opening pages, enough to hook them\n' +
      'choose: As much as we can, assign the rest for homework\n```\n\n' +
      // A model that still writes grade-and-scope chips must not be heard.
      '```suggestions\n10th grade, full unit, 50-minute periods\n```';

    async function seedAsk(e2eContext: Ctx) {
      return seedConversation(e2eContext, [
        { role: 'user', content: "I'm teaching The Things They Carried for the first time." },
        { role: 'assistant', content: 'A great war book. What do you want day one to do?' },
        { role: 'user', content: 'Introduce the book and start reading the first story.' },
        { role: 'assistant', content: ASK },
      ]);
    }

    async function teacherClasses(membershipId: string) {
      const prisma = createE2EPrismaClient();
      try {
        return await prisma.class.findMany({
          where: { isArchived: false, teachers: { some: { id: membershipId } } },
          select: { id: true, schoolId: true, periodMinutes: true },
        });
      } finally {
        await prisma.$disconnect();
      }
    }

    test.afterEach(async ({ e2eContext }) => {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.class.deleteMany({ where: { code: 'E2E-REVIEW-2' } });
        await prisma.class.updateMany({
          where: { teachers: { some: { id: e2eContext.teacherMembershipId } } },
          data: { periodMinutes: null },
        });
      } finally {
        await prisma.$disconnect();
      }
    });

    test('one class: no question about it, an unset length, and a single choice for the time', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_intake_v2', true);
      const id = await seedAsk(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const asked: string[] = [];
      await page.route('**/api/domain/lesson-planner', (route) => {
        asked.push(route.request().postData() ?? '');
      });
      await page.goto(`/app/lesson-planner?c=${id}`);
      await page.waitForLoadState('networkidle');

      const card = page.getByTestId('lesson-intake-card');
      await expect(card).toBeVisible();
      // The guessed chip never shows.
      await expect(page.getByText('10th grade, full unit, 50-minute periods')).toHaveCount(0);

      // The only class is not a question.
      const only = card.getByTestId('intake-only-class');
      await expect(only).toBeVisible();
      const className = ((await only.textContent()) ?? '').replace(/^For\s+/, '').trim();

      await card.getByTestId('lesson-ask-next').click();
      // No 50 the teacher never said.
      await expect(card.getByTestId('intake-length-value').first()).toHaveText('Set the length');
      await expect(card.getByTestId('lesson-ask-next')).toBeDisabled();
      await card.getByRole('slider').first().fill('90');
      await expect(card.getByTestId('intake-length-value').first()).toHaveText('1 hr 30 min');
      await card.getByTestId('lesson-ask-next').click();

      await card.getByRole('radio', { name: 'Read the whole first story together' }).check();
      await expect(card.getByTestId('intake-summary')).toHaveText(
        `For ${className}, 90 minutes. Read the whole first story together.`
      );
      const saved = page.waitForResponse((response) =>
        response.url().includes('/api/domain/lesson-planner/class-length')
      );
      await card.getByTestId('lesson-ask-send').click();
      expect((await saved).ok()).toBe(true);
      await expect.poll(() => asked.join('\n')).toContain('Read+the+whole+first+story+together');

      // Remembered: real data now, so the next intake starts there.
      const [klass] = await teacherClasses(e2eContext.teacherMembershipId);
      expect(klass.periodMinutes).toBe(90);
    });

    test('two classes: pick both, a length for each, any combination of scope', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_intake_v2', true);
      const [existing] = await teacherClasses(e2eContext.teacherMembershipId);
      const prisma = createE2EPrismaClient();
      try {
        await prisma.class.update({ where: { id: existing.id }, data: { periodMinutes: 50 } });
        await prisma.class.create({
          data: {
            code: 'E2E-REVIEW-2',
            title: 'English 11 · Period 3',
            schoolId: existing.schoolId,
            teachers: { connect: { id: e2eContext.teacherMembershipId } },
          },
        });
      } finally {
        await prisma.$disconnect();
      }
      const id = await seedAsk(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.route('**/api/domain/lesson-planner', () => {});
      await page.goto(`/app/lesson-planner?c=${id}`);
      await page.waitForLoadState('networkidle');

      const card = page.getByTestId('lesson-intake-card');
      const boxes = card.getByRole('checkbox');
      await expect(boxes).toHaveCount(2);
      await expect(card.getByTestId('lesson-ask-next')).toBeDisabled();
      await card.getByRole('checkbox', { name: 'English 11 · Period 3' }).check();
      await card.getByTestId('lesson-ask-next').click();

      // One class checked, one slider, unset.
      await expect(card.getByRole('slider')).toHaveCount(1);
      await card.getByRole('slider', { name: /English 11 · Period 3/ }).fill('90');
      await card.getByTestId('lesson-ask-next').click();
      // 11th grade and the whole story: a combination no chip offered.
      await card.getByRole('radio', { name: 'Read the whole first story together' }).check();
      await expect(card.getByTestId('intake-summary')).toHaveText(
        'For English 11 · Period 3, 90 minutes. Read the whole first story together.'
      );
    });

    test('a class with a remembered length starts there', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_intake_v2', true);
      const [existing] = await teacherClasses(e2eContext.teacherMembershipId);
      const prisma = createE2EPrismaClient();
      try {
        await prisma.class.update({ where: { id: existing.id }, data: { periodMinutes: 45 } });
      } finally {
        await prisma.$disconnect();
      }
      const id = await seedAsk(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);
      const card = page.getByTestId('lesson-intake-card');
      await card.getByTestId('lesson-ask-next').click();
      await expect(card.getByTestId('intake-length-value').first()).toHaveText('45 min');
    });

    test('flag off: the original slider card, unchanged', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const id = await seedAsk(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);
      await expect(page.getByTestId('lesson-ask-card')).toBeVisible();
      await expect(page.getByTestId('lesson-intake-card')).toHaveCount(0);
    });
  });

  test.describe('decks: the YAWP! template and editing (E1, E2)', () => {
    const DECK = {
      title: 'The Things They Carried — Day 1',
      subtitle: 'English 11 · Period 3',
      slides: [
        { layout: 'title', title: 'The Things They Carried', subtitle: 'Day 1', speakerNotes: 'Let it sit.', minutes: 1 },
        { layout: 'prompt', title: 'Class starter', body: 'Write about something you carry every day.', speakerNotes: 'Eight minutes.', minutes: 8 },
        { layout: 'statement', title: 'Hold this question', body: 'Why does a list feel like the right form?', speakerNotes: 'Leave it up.', minutes: 5 },
        { layout: 'closing', title: 'Before you go', body: 'Exit ticket: open it in Yawp.', speakerNotes: 'Seven minutes.', minutes: 7 },
      ],
    };

    async function seedDeck(e2eContext: Ctx) {
      const prisma = createE2EPrismaClient();
      try {
        const conversation = await prisma.lessonPlanConversation.create({
          data: {
            membershipId: e2eContext.teacherMembershipId,
            organizationId: e2eContext.organizationId,
            title: 'Deck lesson',
            messages: {
              create: [
                { role: 'user', content: 'Build the slide deck for this lesson', createdAt: new Date('2026-10-11T10:00:00Z') },
                {
                  role: 'assistant',
                  content: `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(DECK)}\n\`\`\``,
                  createdAt: new Date('2026-10-11T10:00:01Z'),
                },
              ],
            },
          },
          select: { id: true, messages: { where: { role: 'assistant' }, select: { id: true } } },
        });
        return { conversationId: conversation.id, messageId: conversation.messages[0]!.id };
      } finally {
        await prisma.$disconnect();
      }
    }

    test('flag off: the original card and presenter', async ({ page, signIn, e2eContext }) => {
      const { conversationId, messageId } = await seedDeck(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const card = page.getByTestId('slide-deck-card');
      await expect(card.getByTestId('deck-download-pptx')).toHaveText('PowerPoint');
      await expect(card.getByTestId('deck-edit')).toHaveCount(0);
      await page.goto(`/present/${conversationId}/${messageId}`);
      await expect(page.getByTestId('slide-stage')).toBeVisible();
      await expect(page.locator('[data-theme="tile"]')).toHaveCount(0);
    });

    test('flag on: Save to PowerPoint, Edit, Present; presented in the tile template', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      const { conversationId, messageId } = await seedDeck(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const card = page.getByTestId('slide-deck-card');
      await expect(card.getByTestId('deck-download-pptx')).toHaveText('Save to PowerPoint');
      await expect(card.getByTestId('deck-edit')).toHaveText('Edit');
      await expect(card.getByRole('link', { name: 'Present' })).toBeVisible();

      const download = await page.request.get(`/present/${conversationId}/${messageId}.pptx`);
      expect(download.ok()).toBe(true);
      expect((await download.body()).subarray(0, 2).toString()).toBe('PK');

      await page.goto(`/present/${conversationId}/${messageId}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage.locator('[data-theme="tile"]')).toBeVisible();
      await expect(stage).toContainText('TODAY · 1 MIN');
      await expect(stage).toContainText('The Things They Carried');
    });

    test('edit: delete a slide (with Undo), rename one, save — the chat shows the edit', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      const { conversationId } = await seedDeck(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await page.getByTestId('deck-edit').click();

      const slides = page.getByTestId('deck-editor-slide');
      await expect(slides).toHaveCount(4);
      await page.getByRole('button', { name: 'Delete slide 3' }).click();
      await expect(slides).toHaveCount(3);
      await page.getByTestId('deck-editor-undo').getByRole('button', { name: 'Undo' }).click();
      await expect(slides).toHaveCount(4);
      await page.getByRole('button', { name: 'Delete slide 3' }).click();
      await expect(slides).toHaveCount(3);

      await page.getByRole('button', { name: /^Slide 2:/ }).click();
      await page.getByLabel('Title', { exact: true }).fill('Warm-up: what you carry');
      await page.getByTestId('deck-editor-save').click();

      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));
      const card = page.getByTestId('slide-deck-card');
      await expect(card).toContainText('3 slides');
      await expect(card.getByTestId('deck-edited-badge')).toBeVisible();
      await expect(card.getByTestId('deck-toggle')).toHaveText(/in the stack/i);

      await card.getByRole('link', { name: 'Present' }).click();
      await expect(page.getByTestId('slide-counter')).toHaveText('1 / 3');
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('slide-counter')).toHaveText('2 / 3');
      await expect(page.getByTestId('slide-stage')).toContainText('Warm-up: what you carry');
    });

    test('flag off: the editor is not there', async ({ page, signIn, e2eContext }) => {
      const { conversationId, messageId } = await seedDeck(e2eContext);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const response = await page.goto(`/app/lesson-planner/${conversationId}/deck/${messageId}`);
      expect(response?.status()).toBe(404);
    });
  });

  test('"In the stack" says what clicking it does (B3)', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const id = await seedConversation(e2eContext, [
      { role: 'user', content: 'Plan a lesson on weathering and erosion.' },
      {
        role: 'assistant',
        content:
          '## Closing (4 min)\n\nThe last four minutes.\n\n' +
          '```yawp-exit-ticket\n' +
          'kind: check\n' +
          'focus: explain-concept\n' +
          'topic: the difference between weathering and erosion\n' +
          'answer: objective\n' +
          'mustMention: Whether the material moves.\n' +
          '```',
      },
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${id}`);

    const toggle = page.getByTestId('exit-ticket-stack-toggle');
    await toggle.click();
    await expect(toggle).toHaveText(/in the stack/i);
    await expect(toggle).toHaveAttribute('title', 'Click to remove from stack');
  });
});
