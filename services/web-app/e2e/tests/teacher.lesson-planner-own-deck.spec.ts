/**
 * The teacher's own deck (Nov 1): an uploaded PowerPoint kept whole with its
 * pictures. On upload the page asks what to do with it: "Add my existing
 * slide deck to the stack as is" (the lesson's slide deck is their file), or
 * "Make me a new slide deck (your original won't be affected)" (a Yawp! deck
 * that keeps the teacher's pictures).
 *
 * Every reply is seeded: the model is never called. Each test turns on the
 * flags it needs and the afterEach turns every flag back off.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const DECK_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/lesson-planner/deck-pictures.pptx');
const DECK_BYTES = readFileSync(DECK_FILE);
const QUESTION = 'Do you want me to rework this slide deck for this lesson (your original won’t be lost), or keep it as is?';
const deckUpload = { name: 'Thesis deck.pptx', mimeType: 'application/octet-stream', buffer: DECK_BYTES };

const OWN_DECK_FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_uploads',
  'lesson_planner_upload_pictures',
  'lesson_planner_teach_my_slides',
  'lesson_planner_refresh_my_deck',
];
const STACK_FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_deck_v2',
  'lesson_planner_teach_notes',
];
const ALL_FLAGS: LessonPlannerReviewFlag[] = [...OWN_DECK_FLAGS, ...STACK_FLAGS, 'lesson_planner_deck_gallery'];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(e2eContext: Ctx, turns: Turn[], title = 'Thesis statements') {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        periodMinutes: 50,
        lessonClassLabel: 'English 10 · Period 3',
        messages: {
          create: turns.map((turn, index) => ({ ...turn, createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, index)) })),
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, orderBy: { createdAt: 'asc' }, select: { id: true } } },
    });
    return { conversationId: conversation.id, assistantIds: conversation.messages.map((message) => message.id) };
  } finally {
    await prisma.$disconnect();
  }
}

async function uploadDeck(page: import('@playwright/test').Page, conversationId?: string) {
  const response = await page.request.post('/api/domain/lesson-planner/uploads', {
    multipart: { intent: 'upload', file: deckUpload, ...(conversationId ? { conversationId } : {}) },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).upload as { id: string; deck?: { pictures: number; mode: string | null } };
}

async function picturesOf(uploadId: string) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.lessonPlanUploadPicture.findMany({
      where: { uploadId },
      orderBy: { position: 'asc' },
      select: { id: true, position: true, altText: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** A refreshed deck whose second slide is the teacher's own photograph. */
function refreshedDeckReply(pictureId: string) {
  const deck = {
    title: 'Develop your thesis statement',
    slides: [
      { layout: 'title', title: 'Develop your thesis statement', subtitle: 'The focal point of your essay', speakerNotes: 'Welcome them in.' },
      {
        layout: 'picture',
        title: 'Observe and analyze',
        question: 'What is happening in this picture?',
        image: pictureId,
        speakerNotes: 'Two minutes of silent looking, then share details.',
      },
      { layout: 'closing', title: 'Write one sentence', body: 'What does the picture lead you to believe?', speakerNotes: 'Collect a few.' },
    ],
  };
  return ['# Thesis statements, refreshed', '', '```yawp-slides', JSON.stringify(deck, null, 2), '```'].join('\n');
}

test.describe('Lesson Planner — the teacher’s own deck (Nov 1)', () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanUpload.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('flag off: a deck is read for its text only and offers no choice', async ({ page, signIn, e2eContext }) => {
    await setLessonPlannerReviewFlag('lesson_planner_uploads', true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('source-file-input').setInputFiles(DECK_FILE);
    await expect(page.getByTestId('source-document')).toContainText('deck-pictures.pptx');
    await expect(page.getByTestId('source-deck-pictures')).toHaveCount(0);

    const prisma = createE2EPrismaClient();
    try {
      const row = await prisma.lessonPlanUpload.findFirstOrThrow({
        where: { membershipId: e2eContext.teacherMembershipId },
        select: { keptDeck: true, file: true, _count: { select: { pictures: true } } },
      });
      expect(row).toEqual({ keptDeck: false, file: null, _count: { pictures: 0 } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('kept whole: the deck and its pictures are saved, and the teacher gets their file back', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of OWN_DECK_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('source-file-input').setInputFiles(DECK_FILE);
    const chip = page.getByTestId('source-document');
    await expect(chip).toContainText('deck-pictures.pptx');
    // Four of its six pictures can be shown: an EMF and a web link cannot.
    await expect(page.getByTestId('source-deck-pictures')).toHaveText('4 pictures kept');

    const prisma = createE2EPrismaClient();
    try {
      const row = () =>
        prisma.lessonPlanUpload.findFirstOrThrow({
          where: { membershipId: e2eContext.teacherMembershipId },
          select: { id: true, mode: true, text: true },
        });
      const saved = await row();
      expect(saved.text).toContain('[Picture 1: An elephant in a city street & its crowd]');

      // The file, exactly as uploaded.
      const file = await page.request.get(`/api/lesson-planner-deck/${saved.id}`);
      expect(file.ok()).toBe(true);
      expect(Buffer.compare(await file.body(), DECK_BYTES)).toBe(0);

      // A kept picture, served as the image it is.
      const [first] = await picturesOf(saved.id);
      const picture = await page.request.get(`/api/image/lesson-picture/${first!.id}`);
      expect(picture.ok()).toBe(true);
      expect(picture.headers()['content-type']).toBe('image/png');

      // Removing the document deletes the file and its pictures with it.
      await page.getByRole('button', { name: 'Remove deck-pictures.pptx' }).click();
      await expect.poll(() => picturesOf(saved.id)).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('the planner asks in the conversation, and a button answers it', async ({ page, signIn, e2eContext }) => {
    for (const flag of OWN_DECK_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Pre-writing, ninth grade, 48 minutes. Here is my deck.' },
      { role: 'assistant', content: 'Here is how the lesson could go.\n\n## Hook (5 min)\n\nLook at the picture.' },
    ]);
    const upload = await uploadDeck(page, conversationId);

    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await page.waitForLoadState('networkidle');
    // In the conversation, under the reply; nothing pinned above the message bar.
    const card = page.getByTestId('deck-ask-card');
    await expect(card).toContainText(QUESTION);
    await expect(card).toContainText('Thesis deck.pptx');
    await expect(card.getByRole('button')).toHaveText(['Rework it', 'Keep it as is']);
    await expect(page.getByTestId('source-document')).toHaveCount(0);

    // The answer goes to the planner as the teacher's message.
    const asked: string[] = [];
    await page.route('**/api/domain/lesson-planner', async (route) => {
      asked.push(route.request().postData() ?? '');
      await route.abort();
    });
    await card.getByRole('button', { name: 'Keep it as is' }).click();
    await expect.poll(() => decodeURIComponent(asked.join('\n').replace(/\+/g, ' '))).toContain('Keep my slide deck “Thesis deck.pptx” as is.');
    await expect(page.getByTestId('deck-ask-card')).toHaveCount(0);

    const prisma = createE2EPrismaClient();
    try {
      const row = await prisma.lessonPlanUpload.findUniqueOrThrow({ where: { id: upload.id }, select: { mode: true } });
      expect(row.mode).toBe('teach');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('attachment chips clear once their message is sent', async ({ page, signIn, e2eContext }) => {
    for (const flag of OWN_DECK_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('source-file-input').setInputFiles(DECK_FILE);
    await expect(page.getByTestId('source-document')).toContainText('deck-pictures.pptx');
    const asked: string[] = [];
    await page.route('**/api/domain/lesson-planner', async (route) => {
      asked.push(route.request().postData() ?? '');
      await route.abort();
    });
    await page.getByLabel('Message the Lesson Planner').fill('Plan a pre-writing lesson around my deck.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => asked.join('\n')).toContain('uploadIds=');
    await expect(page.getByTestId('source-document')).toHaveCount(0);
  });

  test('as is: the lesson’s slide deck is the teacher’s own file', async ({ page, signIn, e2eContext }) => {
    for (const flag of [...OWN_DECK_FLAGS, ...STACK_FLAGS]) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId, assistantIds } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Day one, built around my thesis deck.' },
      { role: 'assistant', content: DAY_ONE_REPLY },
    ]);
    const kept = await page.request.post('/api/domain/lesson-planner/packet', {
      form: { intent: 'keep-all', conversationId, messageId: assistantIds[0]! },
    });
    expect(kept.ok()).toBe(true);
    const upload = await uploadDeck(page, conversationId);
    const chose = await page.request.post('/api/domain/lesson-planner/uploads', {
      multipart: { intent: 'mode', uploadId: upload.id, mode: 'teach' },
    });
    expect(chose.ok()).toBe(true);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const box = page.getByTestId('print-for-class');
    const own = box.getByTestId('own-deck');
    await expect(own).toContainText('Slide deck');
    await expect(own).toContainText('Your own deck, as you uploaded it: Thesis deck.pptx');
    // It is the lesson's deck: no "No deck yet", nothing to build.
    await expect(box).not.toContainText('No deck yet');
    await expect(box.getByTestId('build-deck')).toHaveCount(0);
    await expect(page.getByTestId('before-class-item').filter({ hasText: 'Slides' })).toHaveAttribute('data-done', 'true');

    // Set: Teach it opens their deck rather than building a new one.
    await page.getByTestId('set-lesson').click();
    await expect(page.getByTestId('open-own-deck')).toHaveAttribute('href', `/api/lesson-planner-deck/${upload.id}`);
    await expect(page.getByTestId('open-slideshow')).toHaveCount(0);
    await expect(own.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      `/api/lesson-planner-deck/${upload.id}`
    );
  });

  test('refresh: the teacher’s photograph is on the slide in Present, and nobody else can load it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of [...OWN_DECK_FLAGS, 'lesson_planner_deck_v2' as const]) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const upload = await uploadDeck(page);
    const [elephant] = await picturesOf(upload.id);
    const { conversationId, assistantIds } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Refresh my thesis deck.' },
      { role: 'assistant', content: refreshedDeckReply(elephant!.id) },
    ]);

    await page.goto(`/present/${conversationId}/${assistantIds[0]}`);
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('ArrowRight');
    // Present also draws every slide for printing; the one on screen is the visible one.
    const picture = page.getByTestId('slide-picture').locator('img').filter({ visible: true });
    await expect(picture).toHaveAttribute('src', `/api/image/lesson-picture/${elephant!.id}`);
    await expect(picture).toHaveAttribute('alt', 'An elephant in a city street & its crowd');
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // The PowerPoint carries the picture itself.
    const pptx = await page.request.get(`/present/${conversationId}/${assistantIds[0]}.pptx`);
    expect(pptx.ok()).toBe(true);
    expect((await pptx.body()).includes(Buffer.from('ppt/media/'))).toBe(true);

    // A picture that is not this teacher's is not found.
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanUploadPicture.updateMany({ where: { id: elephant!.id }, data: { membershipId: 'someone-else' } });
    } finally {
      await prisma.$disconnect();
    }
    const theirs = await page.request.get(`/api/image/lesson-picture/${elephant!.id}`);
    expect(theirs.status()).toBe(404);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-picture-missing').filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId('slide-picture')).toHaveCount(0);
  });

  test('the slide editor: every piece of text has a field, and a slide’s picture can be added and removed', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of [...OWN_DECK_FLAGS, 'lesson_planner_deck_v2' as const]) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const deck = {
      title: 'Observe and analyze',
      slides: [
        {
          layout: 'look',
          title: 'Look closely',
          question: 'What is happening here?',
          followUp: 'What makes you say that?',
          routine: 'See-think-wonder',
          speakerNotes: 'Two minutes of silence.',
        },
        { layout: 'bullets', title: 'What we noticed', bullets: ['The crowd', 'The cart'], speakerNotes: 'Collect a few.' },
      ],
    };
    const { conversationId, assistantIds } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Slides for observing.' },
      { role: 'assistant', content: ['Here are the slides.', '', '```yawp-slides', JSON.stringify(deck), '```'].join('\n') },
    ]);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantIds[0]}`);
    await page.waitForLoadState('networkidle');

    // Words the layout's old fields never showed.
    await expect(page.getByTestId('deck-field-followUp')).toHaveValue('What makes you say that?');
    await expect(page.getByTestId('deck-field-routine')).toHaveValue('See-think-wonder');
    await page.getByTestId('deck-field-followUp').fill('Why do you think so?');

    // A picture from the computer on the second slide: it becomes a picture slide and keeps its words.
    await page.getByRole('button', { name: /^Slide 2:/ }).click();
    await page.getByTestId('slide-picture-input').setInputFiles({
      name: 'crowd.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DwnwEIAA/+Av7a4c0mAAAAAElFTkSuQmCC', 'base64'),
    });
    await expect(page.getByTestId('slide-picture-remove')).toBeVisible();
    await expect(page.getByTestId('deck-field-body')).toHaveValue('The crowd; The cart');
    await expect(page.getByTestId('slide-picture').first().locator('img')).toHaveAttribute('alt', 'crowd');

    // Not a picture: refused, and the slide keeps its picture.
    await page.getByTestId('slide-picture-input').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
    await expect(page.getByRole('alert')).toContainText('PNG, JPEG, GIF and WebP');
    await expect(page.getByTestId('slide-picture-remove')).toBeVisible();

    await page.getByTestId('deck-editor-save').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));

    const prisma = createE2EPrismaClient();
    try {
      const picture = await prisma.lessonPlanUploadPicture.findFirstOrThrow({
        where: { conversationId, membershipId: e2eContext.teacherMembershipId },
        select: { id: true, uploadId: true },
      });
      expect(picture.uploadId).toBeNull();
      const saved = await prisma.lessonPlanMaterial.findFirstOrThrow({ where: { conversationId, kind: 'slides' }, select: { id: true, content: true } });
      expect(saved.content).toContain(`"image": "${picture.id}"`);
      expect(saved.content).toContain('Why do you think so?');

      // Removed again: a text slide with its words.
      await page.goto(`/app/lesson-planner/${conversationId}/deck/${saved.id}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /^Slide 2:/ }).click();
      await page.getByTestId('slide-picture-remove').click();
      await expect(page.getByTestId('slide-picture-choose')).toHaveText('Add a picture');
      await expect(page.getByTestId('deck-field-body')).toHaveValue('The crowd; The cart');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('writing steps: only where students write is there an assignment, and its minutes count as writing', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of ['lesson_planner_stack_v2', 'lesson_planner_stack_v3'] as const) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    // Brian's Pre-Writing lesson (Nov 4).
    const reply = [
      '# Pre-Writing',
      '',
      '## What pre-writing is and why (10 min)',
      '',
      'Walk through slides 3–8: what pre-writing is, and why we do it before we draft. Students take notes as you go.',
      '',
      '## Pre-write in Yawp! (20 min)',
      '',
      'Students pre-write for 20 minutes on the prompt from slide 9.',
      '',
      '## Find the diamonds + close (8 min)',
      '',
      'Pairs trade pre-writes and circle the best idea in each. Close by sharing two out loud.',
    ].join('\n');
    const { conversationId, assistantIds } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Pre-writing, 48 minutes.' },
      { role: 'assistant', content: reply },
    ]);
    const kept = await page.request.post('/api/domain/lesson-planner/packet', {
      form: { intent: 'keep-all', conversationId, messageId: assistantIds[0]! },
    });
    expect(kept.ok()).toBe(true);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const card = (title: string) => page.getByTestId('run-card').filter({ hasText: title });
    await expect(card('Pre-write in Yawp!').getByTestId('writing-badge')).toBeVisible();
    for (const teaching of ['What pre-writing is and why', 'Find the diamonds + close']) {
      await expect(card(teaching)).toBeVisible();
      await expect(card(teaching).getByTestId('writing-badge')).toHaveCount(0);
      await expect(card(teaching).getByTestId('not-in-yawp')).toHaveCount(0);
    }
    // The pre-write's 20 minutes are writing time.
    await expect(page.getByTestId('finish-status')).toContainText('% writing.');
  });
});

