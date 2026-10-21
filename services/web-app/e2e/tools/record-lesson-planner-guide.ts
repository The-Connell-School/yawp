/**
 * Records the clips and stills for "See how it works" (the Lesson Planner
 * guide) from the real planner, with demo data and every review flag on, so
 * the guide can follow the planner as it changes (Kevin: "we need to update
 * the see how it works page as we make changes").
 *
 * Not part of any test run. With the e2e dev server up on :5173:
 *   bunx playwright test -c playwright.lesson-planner-guide.config.ts
 * It writes public/img/lesson-planner-guide/<name>.mp4 and <name>.jpg (needs
 * ffmpeg). Look at each clip before committing it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const MEDIA = join(process.cwd(), 'public/img/lesson-planner-guide');
const SIZE = { width: 1120, height: 700 };
const HIDE_DEV = '.local-dev-environment-control{display:none!important}';

const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_run_show',
  'lesson_planner_templates',
  'lesson_planner_share',
  'lesson_planner_deck_v2',
  'lesson_planner_deck_gallery',
  'lesson_planner_plan_export_v2',
];

const notes = { speakerNotes: 'Let it land, then move on.' };
const GALLERY_DECK = {
  title: 'What we carry',
  unit: 'The Things They Carried',
  accent: 'ember',
  art: 'turner-temeraire',
  slides: [
    { layout: 'title', title: 'What we carry', subtitle: 'Day one', ...notes },
    {
      layout: 'agenda',
      title: 'The things they carried',
      agenda: [
        { title: 'Class starter', minutes: 5 },
        { title: 'What’s in your bag?', minutes: 15 },
        { title: 'Framing', minutes: 10 },
        { title: 'Read aloud', minutes: 12 },
        { title: 'Daily Pages', minutes: 5 },
        { title: 'Closing', minutes: 3 },
      ],
      ...notes,
    },
    { layout: 'write', title: 'Write', body: 'What is one thing you carry every day that nobody else can see?', seconds: 240, step: 1, ...notes },
    { layout: 'discuss', title: 'Talk', question: 'Which one object would tell a stranger something true about you?', grouping: 'Pairs · 4 min', step: 2, ...notes },
    {
      layout: 'notes',
      title: 'The war, and the writer',
      timeline: [
        { year: '1965', caption: 'U.S. ground troops arrive' },
        { year: '1968', caption: 'O’Brien is drafted', mark: 'ink' },
        { year: '1973', caption: 'The last troops leave' },
        { year: '1990', caption: 'The book', mark: 'open' },
      ],
      step: 3,
      ...notes,
    },
    { layout: 'look', title: 'Look', question: 'What is being carried away here, and by whom?', step: 3, ...notes },
    {
      layout: 'read',
      title: 'The opening pages',
      work: 'The Things They Carried',
      page: 'pp. 1–7',
      tasks: [
        { verb: 'Underline', text: 'every weight, in ounces or pounds' },
        { verb: 'Circle', text: 'one thing that is not a thing' },
      ],
      step: 4,
      ...notes,
    },
    { layout: 'exit', title: 'Before you go', body: 'One object, one sentence: why it matters.', nextLesson: 'Love', step: 6, ...notes },
  ],
};

const pace = (page: Page, ms = 900) => page.waitForTimeout(ms);
async function wheel(page: Page, dy: number, steps = 6) {
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(140);
  }
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
}

test('record the Lesson Planner guide', async ({ page, signIn, e2eContext, browser }) => {
  test.setTimeout(600_000);
  const raw = mkdtempSync(join(tmpdir(), 'lesson-planner-guide-'));
  mkdirSync(MEDIA, { recursive: true });
  for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);

  const prisma = createE2EPrismaClient();
  await prisma.lessonPlanTemplate.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
  await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
  const lessonNamed = (title: string) =>
    prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        periodMinutes: 50,
        lessonClassLabel: 'English 10 · Period 3',
        messages: {
          create: [
            { role: 'user', content: 'Day one of The Things They Carried, English 10, 50 minutes.', createdAt: new Date(Date.UTC(2026, 9, 19, 10, 0, 0)) },
            { role: 'assistant', content: DAY_ONE_REPLY, createdAt: new Date(Date.UTC(2026, 9, 19, 10, 0, 1)) },
          ],
        },
      },
      include: { messages: { where: { role: 'assistant' } } },
    });
  // One lesson still in the chat, one already in its stack.
  const chat = await lessonNamed('Day One: What We Carry');
  const lesson = await lessonNamed('Day One: What We Carry');
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  const filed = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId: lesson.id, messageId: lesson.messages[0]!.id },
  });
  expect(filed.ok()).toBe(true);
  const deck = await prisma.lessonPlanMaterial.create({
    data: {
      conversationId: lesson.id,
      sourceMessageId: lesson.messages[0]!.id,
      sourceCreatedAt: new Date(Date.UTC(2026, 9, 19, 10, 0, 2)),
      blockKey: 'deck',
      slot: 'deck',
      kind: 'slides',
      title: 'What we carry',
      audience: 'teacher',
      content: '```yawp-slides\n' + JSON.stringify(GALLERY_DECK) + '\n```',
    },
  });
  await prisma.lessonPlanConversation.update({ where: { id: lesson.id }, data: { lessonDate: new Date('2026-10-26T12:00:00Z') } });
  await prisma.$disconnect();
  const storageState = await page.context().storageState();

  async function clip(name: string, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext({ storageState, viewport: SIZE, recordVideo: { dir: raw, size: SIZE } });
    await context.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      });
    }, HIDE_DEV);
    const recorded = await context.newPage();
    await run(recorded);
    await recorded.waitForTimeout(1200);
    const video = recorded.video()!;
    await context.close();
    const webm = await video.path();
    ffmpeg(['-i', webm, '-vf', 'scale=1120:700,fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', '-an', join(MEDIA, `${name}.mp4`)]);
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString());
    ffmpeg(['-ss', (seconds * 0.45).toFixed(2), '-i', webm, '-frames:v', '1', '-vf', 'scale=1120:700', '-q:v', '4', join(MEDIA, `${name}.jpg`)]);
  }

  // The plan, step by step, with options side by side.
  await clip('plan-steps', async (p) => {
    await p.goto(`/app/lesson-planner?c=${chat.id}`);
    await p.waitForLoadState('networkidle');
    await p.mouse.move(640, 380);
    await wheel(p, -6000, 2);
    await pace(p, 1500);
    await wheel(p, 520);
    await pace(p, 1400);
    await p.getByTestId('plan-segment').filter({ hasText: 'Hook activity' }).getByTestId('segment-toggle').click();
    await pace(p, 1400);
    const row = p.getByTestId('option-row').first();
    await row.scrollIntoViewIfNeeded();
    await wheel(p, 120, 2);
    await pace(p);
    await row.getByTestId('option-next').click();
    await pace(p, 1300);
    await row.getByTestId('option-next').click();
    await pace(p, 1500);
    await wheel(p, 700);
    await pace(p, 1600);
  });

  // The run of show: running long, a fix, and the stack chat.
  await clip('run-of-show', async (p) => {
    await p.goto(`/app/lesson-planner/${lesson.id}/packet`);
    await p.waitForLoadState('networkidle');
    await p.mouse.move(400, 420);
    await pace(p, 1800);
    await wheel(p, 380);
    await pace(p, 900);
    const more = p.getByRole('button', { name: /More minutes for Hook activity/ });
    // Click until the lesson runs 5 over: a click landing mid-save is dropped.
    for (let i = 0; i < 10 && (await p.getByTestId('time-status').textContent()) !== '5 min over'; i += 1) {
      await more.click();
      await p.waitForTimeout(450);
    }
    await expect(p.getByTestId('time-status')).toHaveText('5 min over');
    await pace(p, 900);
    await wheel(p, -380);
    await pace(p, 1800);
    await p.getByTestId('time-fix').first().getByRole('button', { name: 'Apply' }).click();
    await expect(p.getByTestId('time-status')).toHaveText('Right on time');
    await pace(p, 1600);
    await p.getByTestId('open-ask').click();
    await pace(p, 700);
    await p.getByTestId('stack-ask-input').pressSequentially('shorten the hook to 12 minutes', { delay: 45 });
    await p.getByTestId('add-panel').getByRole('button', { name: 'Send' }).click();
    await pace(p, 2200);
    await p.getByTestId('add-panel').getByTestId('ask-undo').click();
    await pace(p, 1500);
    await p.keyboard.press('Escape');
    await pace(p, 600);
  });

  // Set it, then run the show.
  await clip('run-the-show', async (p) => {
    await p.goto(`/app/lesson-planner/${lesson.id}/packet`);
    await p.waitForLoadState('networkidle');
    await p.getByTestId('finish-line').scrollIntoViewIfNeeded();
    await pace(p, 1200);
    await p.getByTestId('set-lesson').click();
    await pace(p, 1800);
    await p.getByTestId('run-the-show').click();
    await p.waitForLoadState('networkidle');
    await pace(p, 1800);
    await p.getByTestId('show-next').click();
    await pace(p, 1800);
    await p.getByTestId('clock-countdown').click();
    await pace(p, 2200);
    await p.getByTestId('show-next').click();
    await pace(p, 2000);
  });

  // Save the shape; start the next lesson from it.
  await clip('templates', async (p) => {
    await p.goto(`/app/lesson-planner/${lesson.id}/packet`);
    await p.waitForLoadState('networkidle');
    await p.getByTestId('lesson-set').scrollIntoViewIfNeeded();
    await pace(p, 1000);
    await p.getByTestId('save-template').click();
    await p.getByTestId('template-name').fill('');
    await p.getByTestId('template-name').pressSequentially('Read & write day', { delay: 55 });
    const saved = p.waitForResponse((r) => r.url().includes('/api/domain/lesson-planner/stack') && r.request().method() === 'POST');
    await p.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
    await pace(p, 1400);
    await p.goto('/app/lesson-planner');
    await p.waitForLoadState('networkidle');
    await pace(p, 1000);
    await p.getByTestId('template-tile').click();
    await pace(p, 1500);
    await p.getByTestId('template-row').first().click();
    await pace(p, 900);
    await p.getByLabel('Message the Lesson Planner').pressSequentially('Chapter 2, “Love”', { delay: 55 });
    await pace(p, 1600);
  });

  // The gallery deck, presented.
  await clip('gallery-deck', async (p) => {
    await p.goto(`/present/${lesson.id}/${deck.id}`);
    await p.waitForLoadState('networkidle');
    await p.evaluate(() => document.fonts.ready);
    await pace(p, 1600);
    for (let i = 0; i < 7; i += 1) {
      await p.keyboard.press('ArrowRight');
      await pace(p, 1500);
    }
  });

  // Stills: Take it to class (cut above Post to your class), Send this lesson.
  const context = await browser.newContext({ storageState, viewport: { width: 1120, height: 820 }, deviceScaleFactor: 2 });
  const still = await context.newPage();
  await still.goto(`/app/lesson-planner/${lesson.id}/packet`);
  await still.waitForLoadState('networkidle');
  await still.addStyleTag({ content: HIDE_DEV });
  await still.getByTestId('take-to-class').screenshot({ path: join(raw, 'take-to-class.png') });
  await still.getByTestId('send-lesson').screenshot({ path: join(raw, 'send-lesson.png') });
  await context.close();
  ffmpeg(['-i', join(raw, 'take-to-class.png'), '-vf', 'crop=iw:min(ih\\,1005):0:0', '-q:v', '3', join(MEDIA, 'take-to-class.jpg')]);
  ffmpeg(['-i', join(raw, 'send-lesson.png'), '-q:v', '3', join(MEDIA, 'send-lesson.jpg')]);
});
