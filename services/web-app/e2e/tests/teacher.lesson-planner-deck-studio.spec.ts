/**
 * The deck studio (Nov 19; Brian, Nov 18: "teachers edit a deck directly on
 * the slide"), behind `lesson_planner_deck_studio` with Lesson Deck Kit v4.
 * Every reply is seeded and the chat's request is answered in the browser:
 * the model is never called. Each test turns on the flags it needs and the
 * afterEach turns them off.
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { fenceSlideDeck, parseSlideDeck, type SlideDeck } from '../../app/domain/lesson-planner/slide-deck';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const KIT_FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_deck_v2',
  'lesson_planner_deck_gallery',
  'lesson_planner_deck_kit_v4',
  'lesson_planner_deck_kit_v41',
];
const STUDIO_FLAGS: LessonPlannerReviewFlag[] = [...KIT_FLAGS, 'lesson_planner_deck_studio'];
const CHAT_FLAGS: LessonPlannerReviewFlag[] = [...STUDIO_FLAGS, 'lesson_planner_deck_chat'];

const DECK: SlideDeck = {
  title: 'Body Paragraphs',
  unit: 'The Critical Essay',
  slides: [
    { layout: 'title', title: 'Body Paragraphs', subtitle: 'Build on your thesis', speakerNotes: 'Open.' },
    { layout: 'steps', title: 'Draft your topic sentence', bullets: ['Reread your thesis', 'Pick one reason'], minutes: 6, speakerNotes: 'Go.' },
    { layout: 'discuss', title: 'Class discussion', question: 'Which reason is strongest?', stem: 'I think…', minutes: 4, speakerNotes: 'Listen.' },
    { layout: 'exit', title: 'Before you go', body: 'Bring your draft tomorrow.', button: 'Exit ticket', speakerNotes: 'Close.' },
  ],
};
const REPLY = `Here is the deck.\n\n${fenceSlideDeck(DECK)}`;

type Ctx = { teacherMembershipId: string; organizationId: string };

async function seedConversation(e2eContext: Ctx) {
  const prisma = createE2EPrismaClient();
  try {
    const turns = [
      { role: 'user', content: 'Build the slide deck for this lesson' },
      { role: 'assistant', content: REPLY },
    ];
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Body Paragraphs',
        periodMinutes: 50,
        messages: {
          create: turns.map((turn, index) => ({ ...turn, createdAt: new Date(Date.UTC(2026, 10, 15, 10, 0, index)) })),
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, orderBy: { createdAt: 'asc' }, select: { id: true } } },
    });
    return { conversationId: conversation.id, assistantId: conversation.messages[0]!.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function savedDeck(conversationId: string): Promise<SlideDeck | null> {
  const prisma = createE2EPrismaClient();
  try {
    const material = await prisma.lessonPlanMaterial.findFirst({ where: { conversationId, slot: 'deck' }, select: { content: true } });
    return material ? (parseSlideDeck(material.content)?.deck ?? null) : null;
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

/** Select everything in the box and type over it, as a teacher would. */
async function retype(page: Page, box: ReturnType<Page['getByRole']>, words: string) {
  await box.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(words);
}

test.describe.serial('The deck studio', () => {
  test.afterEach(async ({ e2eContext }) => {
    for (const flag of CHAT_FLAGS) await setLessonPlannerReviewFlag(flag, false);
    await clearLessonPlans(e2eContext.teacherMembershipId);
  });

  test('flag off: the editor with the fields under the slide, as before', async ({ page, signIn, e2eContext }) => {
    for (const flag of KIT_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);

    await expect(page.getByTestId('deck-editor-save')).toBeVisible();
    await expect(page.getByTestId('deck-studio')).toHaveCount(0);
    await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
    await expect(page.getByTestId('slide-words')).toHaveCount(0);
  });

  test('a deck that is not in the kit’s v4 look opens the editor as before, studio flag or not', async ({ page, signIn, e2eContext }) => {
    // The studio needs Lesson Deck Kit v4; without it the flag does nothing.
    for (const flag of ['lesson_planner_deck_v2', 'lesson_planner_deck_gallery', 'lesson_planner_deck_studio'] as const) {
      await setLessonPlannerReviewFlag(flag, true);
    }
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);

    await expect(page.getByTestId('deck-editor-save')).toBeVisible();
    await expect(page.getByTestId('deck-studio')).toHaveCount(0);
    await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  });

  test('type on the slide: a headline, a list line, a new line, notes and minutes; save; Present shows it', async ({ page, signIn, e2eContext }) => {
    for (const flag of STUDIO_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);

    const studio = page.getByTestId('deck-studio');
    await expect(studio).toBeVisible();
    const slide = page.getByTestId('deck-studio-slide');
    await expect(slide.locator('[data-kit="v4.1"]')).toBeVisible();
    // No list of fields: they are under "More options", closed.
    await expect(page.getByLabel('Layout')).toBeHidden();
    await expect(page.getByTestId('deck-field-body')).toHaveCount(0);

    // The headline, typed in place. Long enough to step the type down a
    // size: the words arrive in order, so the caret never moved.
    const title = slide.getByRole('textbox', { name: 'Slide title' });
    await retype(page, title, 'Body paragraphs that prove a thesis');
    await expect(title).toHaveText('Body paragraphs that prove a thesis');
    // The slide list beside it follows along.
    await expect(page.getByRole('button', { name: 'Slide 1: Body paragraphs that prove a thesis' })).toBeVisible();

    // A list line, then Enter for a new one, typed over.
    await page.getByRole('button', { name: /^Slide 2:/ }).click();
    await retype(page, slide.getByRole('textbox', { name: 'Line 2' }), 'Pick your best reason');
    await page.keyboard.press('Enter');
    const third = slide.getByRole('textbox', { name: 'Line 3' });
    await expect(third).toBeFocused();
    await page.keyboard.type('Write the sentence');
    await expect(third).toHaveText('Write the sentence');
    // One more, then taken back out with Backspace.
    await page.keyboard.press('Enter');
    await expect(slide.getByRole('textbox', { name: 'Line 4' })).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(slide.getByRole('textbox', { name: 'Line 4' })).toHaveCount(0);
    await expect(third).toBeFocused();

    // Notes and minutes sit under the slide.
    await page.getByLabel('Notes for you').fill('Model one together first.');
    await page.getByLabel('Minutes', { exact: true }).fill('8');
    await expect(page.getByTestId('deck-editor-total')).toContainText('12 of 50 min');

    await page.getByTestId('deck-editor-save').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));

    const saved = await savedDeck(conversationId);
    expect(saved?.slides[0]?.title).toBe('Body paragraphs that prove a thesis');
    expect(saved?.slides[1]?.bullets).toEqual(['Reread your thesis', 'Pick your best reason', 'Write the sentence']);
    expect(saved?.slides[1]?.speakerNotes).toBe('Model one together first.');
    expect(saved?.slides[1]?.minutes).toBe(8);

    await page.getByTestId('slide-deck-card').getByRole('link', { name: 'Present' }).click();
    await expect(page.getByTestId('slide-stage').first()).toContainText('Body paragraphs that prove a thesis');
  });

  test('a required headline emptied comes back; an optional line emptied is gone', async ({ page, signIn, e2eContext }) => {
    for (const flag of STUDIO_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);
    const slide = page.getByTestId('deck-studio-slide');

    const title = slide.getByRole('textbox', { name: 'Slide title' });
    await title.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.getByLabel('Notes for you').click();
    await expect(title).toHaveText('Body Paragraphs');

    await page.getByRole('button', { name: /^Slide 3:/ }).click();
    const stem = slide.getByRole('textbox', { name: 'Sentence stem' });
    await stem.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.getByLabel('Notes for you').click();
    await expect(stem).toHaveCount(0);

    // A label is the slide's own word for the task.
    const label = slide.getByRole('textbox', { name: 'Label' });
    await expect(label).toHaveText('Talk');
    await retype(page, label, 'Turn and talk');
    await page.getByLabel('Notes for you').click();
    await expect(slide.getByRole('textbox', { name: 'Label' })).toHaveText('Turn and talk');

    await page.getByTestId('deck-editor-save').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));
    const saved = await savedDeck(conversationId);
    expect(saved?.slides[2]?.stem).toBeUndefined();
    expect(saved?.slides[2]?.mode).toBe('Turn and talk');
    expect(saved?.slides[0]?.title).toBe('Body Paragraphs');
  });

  test('Backspace on an emptied first line: the next line takes its place, with its own words', async ({ page, signIn, e2eContext }) => {
    for (const flag of STUDIO_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);
    await page.getByRole('button', { name: /^Slide 2:/ }).click();
    const slide = page.getByTestId('deck-studio-slide');

    const first = slide.getByRole('textbox', { name: 'Line 1' });
    await first.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(first).toBeFocused();
    await expect(first).toHaveText('Pick one reason');
    await expect(slide.getByRole('textbox', { name: 'Line 2' })).toHaveCount(0);
    // The caret is at the end of that line: typing adds to it.
    await page.keyboard.type(' today');
    await expect(first).toHaveText('Pick one reason today');
    // The last step stays: a steps slide needs one.
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.getByLabel('Notes for you').click();
    await expect(first).toHaveText('Pick one reason today');

    await page.getByTestId('deck-editor-save').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));
    expect((await savedDeck(conversationId))?.slides[1]?.bullets).toEqual(['Pick one reason today']);
  });

  test('More options still holds the layout and the rest; delete a slide and undo', async ({ page, signIn, e2eContext }) => {
    for (const flag of STUDIO_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);

    await page.getByTestId('deck-studio-more').getByText('More options').click();
    await expect(page.getByLabel('Layout')).toBeVisible();

    const slides = page.getByTestId('deck-editor-slide');
    await expect(slides).toHaveCount(4);
    await page.getByRole('button', { name: 'Delete slide 3' }).click();
    await expect(slides).toHaveCount(3);
    await page.getByTestId('deck-editor-undo').getByRole('button', { name: 'Undo' }).click();
    await expect(slides).toHaveCount(4);
    // No chat without its own flag.
    await expect(page.getByTestId('deck-chat')).toHaveCount(0);
  });

  test('ask Yawp!: the deck changes, the changes are listed, Undo puts it back', async ({ page, signIn, e2eContext }) => {
    for (const flag of CHAT_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    const asked: Record<string, string>[] = [];
    await page.route('**/api/domain/lesson-planner/deck-command', async (route) => {
      const body = route.request().postDataJSON() as Record<string, string>;
      asked.push(body);
      const deck = JSON.parse(body.deck!) as SlideDeck;
      const next: SlideDeck = {
        ...deck,
        slides: deck.slides
          .filter((_, index) => index !== 3)
          .map((s, index) => (index === 2 ? { ...s, question: 'Why would the river decide who rules?' } : s)),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'Done. The talk question is about the river now, and the exit slide is gone.',
          applied: true,
          deck: next,
          changes: [
            { slide: 3, kind: 'changed', title: 'Class discussion' },
            { slide: 4, kind: 'removed', title: 'Before you go' },
          ],
        }),
      });
    });

    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);
    const chat = page.getByTestId('deck-chat');
    await expect(chat).toBeVisible();

    await chat.getByLabel('Ask about the whole deck').fill('Make the talk question about the river and cut the exit slide');
    await chat.getByRole('button', { name: 'Send' }).click();

    await expect(chat).toContainText('The talk question is about the river now');
    const changes = chat.getByTestId('deck-chat-changes');
    await expect(changes).toContainText('Slide 3');
    await expect(changes).toContainText('Removed');
    await expect(page.getByTestId('deck-editor-slide')).toHaveCount(3);
    expect(asked[0]?.line).toBe('Make the talk question about the river and cut the exit slide');
    expect(asked[0]?.selection ?? '').toBe('');

    await chat.getByRole('button', { name: 'Undo these changes' }).click();
    await expect(page.getByTestId('deck-editor-slide')).toHaveCount(4);
    await expect(chat).toContainText('Put back');
  });

  test('point at one part and ask about only that; the change saves', async ({ page, signIn, e2eContext }) => {
    for (const flag of CHAT_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    const asked: Record<string, string>[] = [];
    await page.route('**/api/domain/lesson-planner/deck-command', async (route) => {
      const body = route.request().postDataJSON() as Record<string, string>;
      asked.push(body);
      const deck = JSON.parse(body.deck!) as SlideDeck;
      const next: SlideDeck = { ...deck, slides: deck.slides.map((s, index) => (index === 2 ? { ...s, question: 'Which reason would convince a friend?' } : s)) };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Changed on the slide.', applied: true, deck: next, changes: [{ slide: 3, kind: 'changed', title: 'Class discussion' }] }),
      });
    });

    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);
    await page.getByRole('button', { name: /^Slide 3:/ }).click();
    const slide = page.getByTestId('deck-studio-slide');
    await slide.getByRole('textbox', { name: 'Question' }).click();

    const chat = page.getByTestId('deck-chat');
    await expect(chat.getByTestId('deck-chat-pointing')).toContainText('Slide 3, question');
    await chat.getByLabel('Ask about this part').fill('Make this something a ninth grader would say out loud');
    await chat.getByRole('button', { name: 'Send' }).click();

    await expect(slide.getByRole('textbox', { name: 'Question' })).toHaveText('Which reason would convince a friend?');
    expect(JSON.parse(asked[0]!.selection!)).toMatchObject({ slide: 3, field: 'question' });

    await page.getByTestId('deck-editor-save').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));
    expect((await savedDeck(conversationId))?.slides[2]?.question).toBe('Which reason would convince a friend?');
  });

  test('a request Yawp! cannot make says so and leaves the deck alone', async ({ page, signIn, e2eContext }) => {
    for (const flag of CHAT_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.route('**/api/domain/lesson-planner/deck-command', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'You have asked a lot in the last hour. Try again in a few minutes.' }) })
    );
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);
    const chat = page.getByTestId('deck-chat');
    await chat.getByLabel('Ask about the whole deck').fill('Shorten every slide');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByRole('alert')).toContainText('Try again in a few minutes');
    await expect(page.getByTestId('deck-editor-slide')).toHaveCount(4);
  });
});
