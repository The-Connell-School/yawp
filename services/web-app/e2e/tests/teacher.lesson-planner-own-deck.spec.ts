/**
 * The teacher's own deck (Nov 1): an uploaded PowerPoint kept whole with its
 * pictures, taught as it is ("Teach with these slides"), or refreshed into a
 * Yawp! deck that keeps the teacher's pictures ("Refresh into a Yawp! deck").
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
    await expect(page.getByRole('button', { name: 'Teach with these slides' })).toHaveCount(0);

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

  test('kept whole: the deck and its pictures are saved, the teacher chooses, and gets their file back', async ({
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

    const teach = page.getByRole('button', { name: 'Teach with these slides' });
    const refresh = page.getByRole('button', { name: 'Refresh into a Yawp! deck' });
    await expect(teach).toHaveAttribute('aria-pressed', 'false');
    await teach.click();
    await expect(teach).toHaveAttribute('aria-pressed', 'true');

    const prisma = createE2EPrismaClient();
    try {
      const row = () =>
        prisma.lessonPlanUpload.findFirstOrThrow({
          where: { membershipId: e2eContext.teacherMembershipId },
          select: { id: true, mode: true, text: true },
        });
      await expect.poll(async () => (await row()).mode).toBe('teach');
      const saved = await row();
      expect(saved.text).toContain('[Picture 1: An elephant in a city street & its crowd]');

      // Switching to refresh, then pressing it again, takes the choice back.
      await refresh.click();
      await expect(refresh).toHaveAttribute('aria-pressed', 'true');
      await expect(teach).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(async () => (await row()).mode).toBe('refresh');
      await refresh.click();
      await expect.poll(async () => (await row()).mode).toBeNull();

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

  test('teach: Print it for class hands the teacher their own deck', async ({ page, signIn, e2eContext }) => {
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
    const own = page.getByTestId('print-for-class').getByTestId('own-deck');
    await expect(own).toContainText('Your slides');
    await expect(own).toContainText('Thesis deck.pptx');
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
});
