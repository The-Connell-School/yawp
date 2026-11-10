/**
 * Records the overview video at the top of each How It Works page (Kevin,
 * Nov 10): Class Starter, Pre-Writing, Thesis Statement and Exit Ticket. Each
 * is a short tour of the real app with demo data and no sound: the type's
 * page, making an assignment, a student writing it, and the teacher's side,
 * with a caption for each step. They stand in until Brian records his own.
 *
 * Not part of any test run. With the e2e dev server up on :5173:
 *   bunx playwright test -c playwright.how-it-works-overviews.config.ts
 * It writes public/img/<type>-guide/overview.mp4 and overview.jpg (needs
 * ffmpeg). Look at each video before committing it, and keep each guide's
 * label in overview-videos.ts true to what its video shows.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContextOptions, Locator, Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag } from '../feature-flags';
import { ensureWritingStepType } from '../fixtures/writing-step-types';
import { submitUnifiedLogin } from '../helpers/unified-login';
import type { E2EContext } from '../seed-e2e';

const PUBLIC_IMG = join(process.cwd(), 'public/img');
const SIZE = { width: 1280, height: 800 };
const BASE_URL = 'http://127.0.0.1:5173';
const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';
const CLASS_NAME = /Grade 9th/;
/** HOW_IT_WORKS_ONLY=exit-ticket,prewriting re-records just those. */
const ONLY = process.env.HOW_IT_WORKS_ONLY?.split(',') ?? null;
const want = (key: string) => !ONLY || ONLY.includes(key);

type StorageState = Awaited<ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>>;

// ---------------------------------------------------------------- the stage

/** Hide the dev-only controls, and draw a cursor: recordings don't show one. */
function stage() {
  const style = document.createElement('style');
  style.textContent =
    '.local-dev-environment-control,.demo-feedback-dock,.demo-feedback-trigger{display:none!important}';
  const cursor = document.createElement('div');
  cursor.id = '__rec_cursor';
  Object.assign(cursor.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '20px',
    height: '20px',
    marginLeft: '-10px',
    marginTop: '-10px',
    borderRadius: '50%',
    background: 'rgba(26,31,46,.28)',
    border: '2px solid rgba(26,31,46,.85)',
    zIndex: '2147483647',
    pointerEvents: 'none',
    transform: 'translate(-40px,-40px)',
  });
  // React owns the document and drops nodes it didn't render on hydration,
  // so put them back whenever they go.
  const mount = () => {
    if (!style.isConnected) document.head.append(style);
    if (!cursor.isConnected) document.body?.append(cursor);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  setInterval(mount, 250);
  window.addEventListener(
    'mousemove',
    (e) => {
      cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    },
    true
  );
  window.addEventListener('mousedown', () => (cursor.style.background = 'rgba(26,31,46,.7)'), true);
  window.addEventListener('mouseup', () => (cursor.style.background = 'rgba(26,31,46,.28)'), true);
}

const pause = (page: Page, ms = 1200) => page.waitForTimeout(ms);

/** The caption for this step, in the guide's accent, along the bottom. */
async function say(page: Page, accent: string, text: string, hold = 2600) {
  await page.evaluate(
    ([t, color]) => {
      let el = document.getElementById('__rec_caption');
      if (!el) {
        el = document.createElement('div');
        el.id = '__rec_caption';
        Object.assign(el.style, {
          position: 'fixed',
          left: '50%',
          bottom: '28px',
          transform: 'translateX(-50%)',
          width: 'max-content',
          maxWidth: '980px',
          padding: '14px 24px',
          borderRadius: '14px',
          color: '#fff',
          font: '600 23px/1.35 Inter, ui-sans-serif, system-ui, sans-serif',
          textAlign: 'center',
          zIndex: '2147483646',
          pointerEvents: 'none',
          boxShadow: '0 10px 28px rgba(0,0,0,.28)',
        });
        document.body.appendChild(el);
      }
      el.style.background = color;
      el.textContent = t;
    },
    [text, accent] as const
  );
  await pause(page, hold);
}

/** The opening card: the type's name on the cream page, in its accent. */
async function titleCard(page: Page, accent: string, title: string) {
  await page.evaluate(
    ([t, color]) => {
      const card = document.createElement('div');
      card.id = '__rec_title';
      Object.assign(card.style, {
        position: 'fixed',
        inset: '0',
        background: '#F7F4EE',
        zIndex: '2147483645',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        font: '700 72px/1.1 Inter, ui-sans-serif, system-ui, sans-serif',
        color: '#1A1F2E',
      });
      const bar = document.createElement('div');
      Object.assign(bar.style, { width: '96px', height: '8px', borderRadius: '4px', background: color });
      const name = document.createElement('div');
      name.textContent = t;
      const sub = document.createElement('div');
      sub.textContent = 'A quick tour';
      Object.assign(sub.style, { font: '500 30px/1.3 Inter, ui-sans-serif, system-ui, sans-serif', color: '#3A3F4B' });
      card.append(bar, name, sub);
      document.body.appendChild(card);
    },
    [title, accent] as const
  );
  await pause(page, 2600);
  await page.evaluate(() => document.getElementById('__rec_title')?.remove());
}

/** Move the drawn cursor to an element the way a person would, then click it. */
async function point(page: Page, target: Locator, click = true) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('nothing to point at');
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 18), { steps: 18 });
  await pause(page, 350);
  if (click) await target.click();
}

async function wheel(page: Page, dy: number, steps = 8) {
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(110);
  }
}

// ------------------------------------------------------------ the recording

async function signedIn(browser: Browser, email: string, password: string): Promise<StorageState> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: SIZE });
  const page = await context.newPage();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await submitUnifiedLogin(page, email, password);
  await page.waitForURL((url) => url.pathname.startsWith('/app') || url.pathname === '/enter-code');
  const state = await context.storageState();
  await context.close();
  return state;
}

type Segment = { path: string; from: number };

/**
 * One take, in its own browser so the sign-in never shows. `act` returns
 * once the first page is up; the blank frames before it are trimmed.
 */
async function take(
  browser: Browser,
  dir: string,
  state: StorageState,
  act: (page: Page, ready: () => void) => Promise<void>
): Promise<Segment> {
  const options: BrowserContextOptions = {
    baseURL: BASE_URL,
    viewport: SIZE,
    storageState: state,
    recordVideo: { dir, size: SIZE },
  };
  const context = await browser.newContext(options);
  await context.addInitScript(stage);
  const page = await context.newPage();
  const started = Date.now();
  let from = 0;
  await act(page, () => {
    from = (Date.now() - started) / 1000;
  });
  const video = page.video()!;
  await context.close();
  return { path: await video.path(), from };
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.mouse.move(SIZE.width / 2, SIZE.height / 2);
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
}

/** Join the takes into the guide's overview.mp4, and its poster from the title card. */
function cut(folder: string, segments: Segment[]) {
  const out = join(PUBLIC_IMG, folder);
  mkdirSync(out, { recursive: true });
  const inputs = segments.flatMap((s) => ['-ss', s.from.toFixed(2), '-i', s.path]);
  const chains = segments
    .map((_, i) => `[${i}:v]fps=25,scale=${SIZE.width}:${SIZE.height},setsar=1[v${i}]`)
    .join(';');
  const joined = `${segments.map((_, i) => `[v${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[out]`;
  const mp4 = join(out, 'overview.mp4');
  ffmpeg([
    ...inputs,
    '-filter_complex',
    `${chains};${joined}`,
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4,
  ]);
  ffmpeg(['-ss', '1.4', '-i', mp4, '-frames:v', '1', '-q:v', '4', join(out, 'overview.jpg')]);
}

// ---------------------------------------------------------------- the data

/** The Lounge course, so How to Teach It shows "Watch tutorial" as in production. */
async function ensureLoungeCourse() {
  const prisma = createE2EPrismaClient();
  try {
    const existing = await prisma.teacherTraining.findFirst({
      where: { title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return;
    await prisma.teacherTraining.create({
      data: {
        title: 'The Thesis-Driven Essay',
        position: 90,
        teacherTrainingModules: {
          create: [
            { title: 'Lesson 2: Pre-writing', position: 7, videoS3Key: 'recording/lesson-2.mp4' },
            { title: 'Lesson 3: Developing a Thesis Statement', position: 8, videoS3Key: 'recording/lesson-3.mp4' },
          ],
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** The student's document for the assignment the teacher just made. */
async function studentDocument(ctx: E2EContext, typeId: string, title: string): Promise<string> {
  const prisma = createE2EPrismaClient();
  try {
    const assignment = await prisma.assignment.findFirstOrThrow({
      where: { title, assignmentTypeId: typeId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, classAssignments: { select: { id: true }, take: 1 } },
    });
    const document = await prisma.document.create({
      data: {
        title,
        text: '',
        html: '',
        membershipId: ctx.membershipId,
        assignmentTypeId: typeId,
        assignmentId: assignment.id,
        classAssignmentId: assignment.classAssignments[0]!.id,
      },
      select: { id: true },
    });
    return document.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function submissionFor(documentId: string): Promise<string> {
  const prisma = createE2EPrismaClient();
  try {
    for (let i = 0; i < 20; i += 1) {
      const submission = await prisma.submission.findFirst({
        where: { documentId },
        orderBy: { submittedAt: 'desc' },
        select: { id: true },
      });
      if (submission) return submission.id;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('the student’s submission never landed');
  } finally {
    await prisma.$disconnect();
  }
}

// ----------------------------------------------------------- shared beats

async function openNewAssignment(page: Page) {
  await point(page, page.getByRole('button', { name: /^New/ }));
  await pause(page, 500);
  await point(page, page.getByRole('menuitem', { name: 'Assignment' }));
  await expect(page.getByRole('heading', { name: 'New Assignment' })).toBeVisible();
  await pause(page, 700);
}

async function assignToClass(page: Page, title: string) {
  await point(page, page.getByRole('checkbox', { name: CLASS_NAME }));
  await pause(page, 400);
  const field = page.getByLabel('Title (optional)');
  await point(page, field);
  await field.pressSequentially(title, { delay: 35 });
  await pause(page, 500);
}

async function typePrompt(page: Page, prompt: string) {
  const box = page.getByRole('textbox', { name: 'Prompt' });
  await point(page, box);
  await box.pressSequentially(prompt, { delay: 22 });
  await pause(page, 600);
}

/** Bring the Tutor checkbox into view and point at it, without changing it. */
async function showTutorChoice(page: Page) {
  const tutor = page.getByText('Tutor enabled', { exact: true });
  if (await tutor.count()) await point(page, tutor, false);
  await pause(page, 900);
}

async function create(page: Page) {
  await point(page, page.getByRole('button', { name: /Create Assignment/i }));
  await expect(page.getByRole('heading', { name: 'New Assignment' })).toHaveCount(0, { timeout: 20_000 });
  await pause(page, 600);
}

/** The student writes in their document, then submits. */
async function studentWrites(
  page: Page,
  ready: () => void,
  documentId: string,
  accent: string,
  beats: { caption: string; text: string }[],
  submitCaption: string
) {
  await open(page, `/app/documents/${documentId}`);
  ready();
  const editor = page.locator('.ProseMirror').first();
  await expect(editor).toBeVisible();
  await say(page, accent, beats[0]!.caption, 400);
  await point(page, editor);
  for (const [i, beat] of beats.entries()) {
    if (i > 0) await say(page, accent, beat.caption, 300);
    await page.keyboard.type(beat.text, { delay: 18 });
    await pause(page, 900);
  }
  await say(page, accent, submitCaption, 600);
  await point(page, page.getByRole('button', { name: 'Submit', exact: true }));
  await pause(page, 700);
  await point(page, page.getByRole('button', { name: /^Submit Version/ }));
  await pause(page, 1600);
}

/**
 * The e2e server's Grading Assistant is a fixture whose comment reads like a
 * test ("these legacy grading assistant suggestions still apply"). The
 * recording swaps in a comment a teacher would recognize; the guide's caption
 * under the video says the suggestion was scripted.
 */
async function scriptGradingComment(page: Page, comment: string) {
  await page.route('**/api/domain/grade-essay-ai**', async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/[A-Z][a-z]+, these legacy grading assistant suggestions still apply\./g, comment)
      .replace(/Deterministic E2E feedback for [^".]+\./g, '')
      .replace(/Legacy [a-z]+ feedback from deterministic E2E\./g, '');
    await route.fulfill({ response, body });
  });
}

/** The teacher opens the submission and asks the Grading Assistant. */
async function teacherGrades(
  page: Page,
  ready: () => void,
  submissionId: string,
  accent: string,
  captions: [string, string],
  comment: string
) {
  await scriptGradingComment(page, comment);
  await open(page, `/app/submissions/${submissionId}`);
  ready();
  await say(page, accent, captions[0], 900);
  const generate = page.getByTestId('grading-assistant-generate');
  await point(page, generate);
  const replace = page.getByRole('button', { name: 'Replace', exact: true });
  if (await replace.isVisible({ timeout: 1000 }).catch(() => false)) await replace.click();
  await expect(page.getByTestId('grading-overall-comment')).not.toHaveValue('', { timeout: 60_000 });
  await pause(page, 1500);
  await say(page, accent, captions[1], 3200);
}

// ----------------------------------------------------------------- the four

test('record the four How It Works overview videos', async ({ browser, e2eContext }) => {
  test.setTimeout(900_000);
  await setFeatureFlag('assignment-type-landing-v2', true);
  await ensureLoungeCourse();
  const prewritingId = await ensureWritingStepType(e2eContext.organizationId, 'prewriting');
  const thesisId = await ensureWritingStepType(e2eContext.organizationId, 'thesis_statement');
  const teacher = await signedIn(browser, e2eContext.teacherEmail, TEACHER_PASSWORD);
  const student = await signedIn(browser, e2eContext.userEmail, STUDENT_PASSWORD);
  const raw = mkdtempSync(join(tmpdir(), 'how-it-works-overviews-'));
  const stamp = new Date().toISOString().slice(11, 16);

  // ------------------------------------------------------------ Class Starter
  if (want('class-starter')) {
    const accent = '#6E1A26';
    const typeId = e2eContext.classStarterAssignmentTypeId;
    const title = `Promises (${stamp})`;
    const takes: Segment[] = [];
    takes.push(
      await take(browser, raw, teacher, async (page, ready) => {
        await open(page, `/app/assignment-types/${typeId}`);
        ready();
        await titleCard(page, accent, 'Class Starter');
        await say(page, accent, 'Class Starter: one open prompt, 5–10 minutes at the start of class.', 3000);
        await point(page, page.getByRole('button', { name: 'How it works' }));
        await say(page, accent, 'The Tutor is your call, and grading is about effort.', 3000);
        await point(page, page.getByRole('button', { name: /Prompt Library/i }));
        await pause(page, 800);
        await say(page, accent, 'Pick a prompt from the library of 200…', 600);
        await wheel(page, 420);
        await pause(page, 1600);
        await wheel(page, -420);
        await say(page, accent, '…or write your own, and assign it to a class.', 600);
        await openNewAssignment(page);
        await assignToClass(page, title);
        await typePrompt(page, 'Is it ever right to break a promise? Write about a time it mattered.');
        await showTutorChoice(page);
        await create(page);
      })
    );
    const documentId = await studentDocument(e2eContext, typeId, title);
    takes.push(
      await take(browser, raw, student, (page, ready) =>
        studentWrites(
          page,
          ready,
          documentId,
          accent,
          [
            {
              caption: 'Students write freely: no pressure about grammar or polish.',
              text: 'Last summer I promised my little brother I would teach him to swim. Then I got a job and kept putting it off. ',
            },
            {
              caption: 'Any real attempt counts.',
              text: 'I think breaking it was wrong, but keeping it would have meant quitting, so maybe the promise was the mistake.',
            },
          ],
          'Then they submit.'
        )
      )
    );
    const submissionId = await submissionFor(documentId);
    takes.push(
      await take(browser, raw, teacher, (page, ready) =>
        teacherGrades(page, ready, submissionId, accent, [
          'The Grading Assistant suggests an engagement level and a comment.',
          'You review it, change anything, and release it.',
        ], 'John, you kept going past the easy answer and ended up questioning the promise itself. That is exactly what this warm-up is for.')
      )
    );
    cut('class-starter-guide', takes);
  }

  // --------------------------------------------------- Pre-Writing and Thesis
  for (const step of [
    {
      key: 'prewriting',
      folder: 'prewriting-guide',
      typeId: prewritingId,
      accent: '#1E3A5F',
      name: 'Pre-Writing',
      intro: 'Pre-Writing: Step 1 of the Yawp! writing process.',
      library: 'Pick an essay prompt from the library, or write your own.',
      assign: 'Assign it to your class.',
      prompt: 'Is it ever right to break a promise?',
      beats: [
        {
          caption: 'Students write nonstop about the prompt, to find out what they think.',
          text: 'Promises are how people trust each other, but my grandmother broke one to protect my mom and nobody thinks she was wrong. ',
        },
        {
          caption: 'It’s supposed to be messy. The Tutor is there to push their thinking.',
          text: 'Maybe it depends on who gets hurt. Maybe a promise is only as good as the reason you made it. ',
        },
        {
          caption: 'When they find a focus, they label it at the bottom.',
          text: 'Focus: a promise can be broken when keeping it would hurt the person it was made to.',
        },
      ],
      grade: [
        'The Grading Assistant looks at the focus and the thinking behind it.',
        'You see everything they wrote. You review it and release it.',
      ] as [string, string],
      comment:
        'John, you moved from a family story to a real question about who a promise is for, and your focus says it clearly. Take that question into your thesis.',
    },
    {
      key: 'thesis-statement',
      folder: 'thesis-statement-guide',
      typeId: thesisId,
      accent: '#1F4E5F',
      name: 'Thesis Statement',
      intro: 'Thesis Statement: Step 2 of the Yawp! writing process.',
      library: null,
      assign: 'Use the same prompt students pre-wrote on.',
      prompt: 'Is it ever right to break a promise?',
      beats: [
        {
          caption: 'Students turn their focus into one clear, arguable sentence.',
          text: 'A promise can be broken when keeping it would hurt the person it was made to, ',
        },
        {
          caption: 'The Tutor says what’s working and what’s missing. It never writes the thesis.',
          text: 'because the point of a promise is that person’s good, not the keeper’s pride.',
        },
      ],
      grade: [
        'The Grading Assistant judges the thesis alone.',
        'You review the suggestion, change anything, and release it.',
      ] as [string, string],
      comment:
        'John, this is one clear sentence with a position someone could argue with. Next, pin down what “hurt” means so the essay has something specific to prove.',
    },
  ].filter((s) => want(s.key))) {
    const title = `Promises: ${step.name} (${stamp})`;
    const takes: Segment[] = [];
    takes.push(
      await take(browser, raw, teacher, async (page, ready) => {
        await open(page, `/app/assignment-types/${step.typeId}`);
        ready();
        await titleCard(page, step.accent, step.name);
        await say(page, step.accent, step.intro, 3000);
        const howTo = page.getByTestId('how-to-teach-spotlight');
        await point(page, howTo.getByRole('link', { name: /slide deck/i }).first(), false);
        await say(page, step.accent, 'Teach the lesson first: download the slide deck…', 1400);
        const tutorial = howTo.getByRole('link', { name: /tutorial/i }).first();
        if (await tutorial.isVisible().catch(() => false)) await point(page, tutorial, false);
        await say(page, step.accent, '…and watch the short tutorial before class.', 2200);
        if (step.library) {
          await point(page, page.getByRole('button', { name: /Prompt Library/i }));
          await pause(page, 800);
          await say(page, step.accent, step.library, 600);
          await wheel(page, 420);
          await pause(page, 1600);
          await wheel(page, -420);
        }
        await say(page, step.accent, step.assign, 600);
        await openNewAssignment(page);
        await assignToClass(page, title);
        await typePrompt(page, step.prompt);
        await showTutorChoice(page);
        await create(page);
      })
    );
    const documentId = await studentDocument(e2eContext, step.typeId, title);
    takes.push(
      await take(browser, raw, student, (page, ready) =>
        studentWrites(page, ready, documentId, step.accent, step.beats, 'Then they submit.')
      )
    );
    const submissionId = await submissionFor(documentId);
    takes.push(
      await take(browser, raw, teacher, (page, ready) =>
        teacherGrades(page, ready, submissionId, step.accent, step.grade, step.comment)
      )
    );
    cut(step.folder, takes);
  }

  // -------------------------------------------------------------- Exit Ticket
  if (want('exit-ticket')) {
    const accent = '#14213D';
    const typeId = e2eContext.exitTicketAssignmentTypeId;
    const title = `Weathering and erosion (${stamp})`;
    const takes: Segment[] = [];
    takes.push(
      await take(browser, raw, teacher, async (page, ready) => {
        await open(page, `/app/assignment-types/${typeId}`);
        ready();
        await titleCard(page, accent, 'Exit Ticket');
        await say(page, accent, 'Exit Ticket: find out if today’s lesson landed.', 3000);
        await openNewAssignment(page);
        await say(page, accent, 'Ask for a reflection, or check one idea you taught.', 600);
        await point(page, page.getByRole('radio', { name: /^Check for understanding/ }));
        await pause(page, 600);
        await point(page, page.getByLabel('What are you checking for?'));
        await point(page, page.getByRole('option', { name: 'Explain a concept' }));
        const topic = page.getByLabel('What specifically?');
        await point(page, topic);
        await topic.pressSequentially('the difference between weathering and erosion', { delay: 30 });
        await pause(page, 400);
        // "Is there a correct answer?" is never guessed for the teacher.
        await point(page, page.getByRole('radio', { name: /^Yes/ }));
        await say(page, accent, 'Name the idea. Yawp! writes the question students will read.', 1200);
        await page.getByText('the difference between weathering and erosion').last().scrollIntoViewIfNeeded();
        await pause(page, 1600);
        await assignToClass(page, title);
        await showTutorChoice(page);
        await say(page, accent, 'The Tutor starts off, and the ticket stays ungraded unless you grade it.', 2200);
        await create(page);
      })
    );
    const documentId = await studentDocument(e2eContext, typeId, title);
    takes.push(
      await take(browser, raw, student, (page, ready) =>
        studentWrites(
          page,
          ready,
          documentId,
          accent,
          [
            {
              caption: 'In the last few minutes of class, students explain it in their own words.',
              text: 'Weathering is when rock gets broken down where it is, like ice cracking it. Erosion is when the pieces get carried away by water or wind.',
            },
          ],
          'Then they submit.'
        )
      )
    );
    const submissionId = await submissionFor(documentId);
    takes.push(
      await take(browser, raw, teacher, async (page, ready) => {
        await open(page, `/app/submissions/${submissionId}`);
        ready();
        await say(page, accent, 'You read their answers…', 2600);
        await say(page, accent, '…before you plan tomorrow’s lesson.', 3200);
      })
    );
    cut('exit-ticket-guide', takes);
  }
});
