/**
 * Brian's Oct 24 handoff: stack page v2 and the library redesign
 * (docs/plans/2026-10-24-stack-v2-and-library-redesign.md).
 *
 * Every reply is seeded: the model is never called. Each test turns on the
 * flags it needs and the afterEach turns every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';
import { extractText, getDocumentProxy } from 'unpdf';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_deck_v2',
  'lesson_planner_teach_notes',
  'lesson_planner_library_v2',
  'lesson_planner_share',
  'lesson_planner_run_show',
  'lesson_planner_plan_export_v2',
];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(e2eContext: Ctx, turns: Turn[], title = 'Exit tickets') {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        periodMinutes: 50,
        messages: {
          create: turns.map((turn, index) => ({ ...turn, createdAt: new Date(Date.UTC(2026, 9, 24, 10, 0, index)) })),
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, orderBy: { createdAt: 'asc' }, select: { id: true } } },
    });
    return { conversationId: conversation.id, assistantIds: conversation.messages.map((message) => message.id) };
  } finally {
    await prisma.$disconnect();
  }
}

const DECK = {
  title: 'The Things They Carried — Day 1',
  slides: [
    { layout: 'title', title: 'The Things They Carried', subtitle: 'Day 1', speakerNotes: 'Let it sit.', minutes: 1 },
    { layout: 'statement', title: 'Hold this question', body: 'Why does a list feel like the right form?', speakerNotes: 'Leave it up.', minutes: 5 },
    { layout: 'closing', title: 'Before you go', body: 'Exit ticket: open it in Yawp!', speakerNotes: 'Seven minutes.', minutes: 7 },
  ],
};
const DECK_REPLY = `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(DECK)}\n\`\`\``;

/** Day one in the stack, and a deck built after it (not added). */
async function seedDayOneWithDeck(page: import('@playwright/test').Page, e2eContext: Ctx) {
  const seeded = await seedConversation(
    e2eContext,
    [
      { role: 'user', content: 'Day one of The Things They Carried, English 11, 50 minutes.' },
      { role: 'assistant', content: DAY_ONE_REPLY },
      { role: 'user', content: 'Build the slide deck from my stack' },
      { role: 'assistant', content: DECK_REPLY },
    ],
    'Day One'
  );
  const kept = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId: seeded.conversationId, messageId: seeded.assistantIds[0]! },
  });
  expect(kept.ok()).toBe(true);
  return seeded;
}

async function pdfText(page: import('@playwright/test').Page, url: string) {
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  const doc = await getDocumentProxy(new Uint8Array(await response.body()));
  return (await extractText(doc, { mergePages: true })).text.replace(/\s+/g, ' ');
}

const TICKET_REPLY =
  '## Closing (4 min)\n\nThe last four minutes.\n\n' +
  '```yawp-exit-ticket\n' +
  'kind: check\n' +
  'focus: explain-concept\n' +
  'topic: the difference between weathering and erosion\n' +
  'answer: objective\n' +
  'mustMention: Whether the material moves.\n' +
  '```';

test.describe("Stack page v2 (Brian's Oct 24 handoff)", () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('task 1: an exit ticket made in the planner chat shows as created on the stack, once', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId, assistantIds } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Plan a lesson on weathering and erosion.' },
      { role: 'assistant', content: TICKET_REPLY },
    ]);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Made in the chat before it is in the stack: the link names its block.
    const create = page.getByTestId('exit-ticket-create');
    const href = (await create.getAttribute('href'))!;
    const piece = new URL(href, 'http://x').searchParams.get('fromPiece');
    expect(piece).toBe(`b:${assistantIds[0]}:ticket`);
    // What the assignment page sends once the assignment exists.
    for (let i = 0; i < 2; i++) {
      const marked = await page.request.post('/api/domain/lesson-planner/packet', {
        form: { intent: 'mark-created', conversationId, piece: piece!, yawpHref: new URL(href, 'http://x').pathname },
      });
      expect(marked.ok()).toBe(true);
    }

    await page.reload();
    await expect(page.getByTestId('exit-ticket-create')).toHaveCount(0);
    const toggle = page.getByTestId('exit-ticket-stack-toggle');
    const filed = page.waitForResponse(
      (response) => response.url().includes('/api/domain/lesson-planner/packet') && response.request().method() === 'POST'
    );
    await toggle.click();
    await expect(toggle).toHaveText(/in the stack/i);
    expect((await filed).ok()).toBe(true);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const card = page.getByTestId('run-card').filter({ hasText: 'Closing' });
    await expect(card.getByTestId('in-yawp')).toHaveText('Assignment created');
    await expect(card.getByTestId('in-yawp-where')).toHaveText('in the planner chat');
    await expect(card.getByTestId('not-in-yawp')).toHaveCount(0);

    const prisma = createE2EPrismaClient();
    try {
      expect(await prisma.lessonPlanAssignmentLink.count({ where: { conversationId } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('task 2: the one packet has every slide, after the lesson plan, even a deck never added', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedDayOneWithDeck(page, e2eContext);
    const text = await pdfText(page, `/app/lesson-planner/${conversationId}/packet.pdf`);
    for (const slide of DECK.slides) expect(text).toContain(slide.title);
    // The plan first, then the slides.
    expect(text.indexOf('Hook activity')).toBeGreaterThan(-1);
    expect(text.indexOf('Hook activity')).toBeLessThan(text.indexOf('Hold this question'));
  });

  test('task 8: rename the lesson on the stack page, and it started as its first name', async ({ page, signIn, e2eContext }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedDayOneWithDeck(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lesson-rename').click();
    await expect(page.getByTestId('lesson-rename-hint')).toHaveText(
      'Started as “Day One.” Renaming here renames it on the stack page too.'
    );
    await page.getByTestId('lesson-rename-input').fill('Carrying: the first day');
    await page.getByTestId('lesson-rename-save').click();
    await expect(page.getByTestId('stack-title')).toHaveText('Carrying: the first day');
    await page.reload();
    await expect(page.getByTestId('stack-title')).toHaveText('Carrying: the first day');
    // The name it started as is kept.
    await page.getByTestId('lesson-rename').click();
    await expect(page.getByTestId('lesson-rename-hint')).toContainText('Started as “Day One.”');
    await page.getByTestId('lesson-rename-cancel').click();
    await expect(page.getByTestId('lesson-rename-input')).toHaveCount(0);
  });

  test('tasks 4 and 5: Print it for class, and Post to your class without Teams', async ({ page, signIn, e2eContext }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId, assistantIds } = await seedDayOneWithDeck(page, e2eContext);
    const filed = await page.request.post('/api/domain/lesson-planner/packet', {
      form: { intent: 'add-material', conversationId, messageId: assistantIds[1]!, materialKey: 'deck' },
    });
    expect(filed.ok()).toBe(true);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const box = page.getByTestId('print-for-class');
    await expect(box.getByRole('heading', { name: 'Print it for class' })).toBeVisible();
    await expect(page.getByTestId('take-to-class')).toHaveCount(0);
    await expect(box).toContainText('Timed, one page, ready to file');
    await expect(box).toContainText('3 slides from your stack');
    for (const id of ['plan-word', 'plan-google', 'plan-pdf-v3', 'deck-present', 'deck-edit', 'rebuild-deck', 'deck-pdf', 'handouts-word', 'handouts-google', 'handouts-pdf', 'one-packet']) {
      await expect(box.getByTestId(id)).toBeVisible();
    }
    await expect(box.getByTestId('plan-google')).toHaveAttribute('href', `/app/lesson-planner/${conversationId}/google-doc?doc=plan`);
    await expect(box).toContainText('Lesson plan, slides and handouts, in that order.');
    await expect(box.getByTestId('google-docs-caption')).toHaveText(
      'Google Docs opens a new Doc in your Google Drive. The first time, Google asks you to allow it.'
    );

    // The new downloads.
    const slides = await pdfText(page, `/app/lesson-planner/${conversationId}/slides.pdf`);
    for (const slide of DECK.slides) expect(slides).toContain(slide.title);
    const word = await page.request.get(`/app/lesson-planner/${conversationId}/handouts.docx`);
    expect(word.ok()).toBe(true);
    expect(word.headers()['content-type']).toContain('wordprocessingml');

    // Post to your class: Copy link and Google Classroom, no Teams.
    const post = page.getByTestId('post-to-class');
    await expect(post.getByRole('button', { name: 'Copy link' })).toBeVisible();
    await expect(post.getByRole('button', { name: 'Share to Google Classroom' })).toBeVisible();
    await expect(post.getByRole('button', { name: 'Teams' })).toHaveCount(0);
    await expect(post).toContainText('Using Canvas, Schoology or Teams? Paste the link there.');
  });

  test('task 6: Teach it: Open slideshow for the smartboard, and the run of show with notes', async ({ page, signIn, e2eContext }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedDayOneWithDeck(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('set-lesson').click();
    const teach = page.getByTestId('teach-it');
    await expect(teach).toContainText('For the smartboard or projector');
    await expect(teach).toContainText('For your laptop at the podium');
    await expect(page.getByTestId('run-the-show')).toHaveCount(0);
    await expect(teach.getByTestId('run-of-show-notes')).toHaveAttribute('href', `/show/${conversationId}?from=stack`);

    // The deck built for the lesson, full screen, and Close comes back here.
    await teach.getByTestId('open-slideshow').click();
    await expect(page.getByTestId('slideshow')).toBeVisible();
    await expect(page.getByTestId('slide-stage')).toContainText('The Things They Carried');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-counter')).toHaveText('2 / 3');
    await page.getByTestId('slideshow').hover();
    await page.getByTestId('present-close').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
  });
});
