/**
 * Records short (20–30 second) marketing demos of Yawp! features from the
 * real app with demo data: no sound, a title card, a caption for each beat
 * and an end card. They are for Brian's marketing, not for any page in the
 * app, so they are written outside public/.
 *
 *   tutor             The student Tutor: coaching, not ghostwriting.
 *   grading-assistant The Grading Assistant: rubric scores and feedback.
 *   lesson-planner    The Lesson Planner: a timed plan and a deck to present.
 *
 * Not part of any test run. With the e2e dev server up on :5173:
 *   bunx playwright test -c playwright.marketing-demos.config.ts
 * MARKETING_DEMOS_ONLY=tutor,lesson-planner records just those. It writes
 * docs/marketing/demo-videos/<name>.mp4 and <name>.jpg (needs ffmpeg).
 *
 * Video is captured with the DevTools screencast at 1.5x device scale, so the
 * 1280x720 page comes out as sharp 1920x1080 frames (Playwright's own video
 * recorder is low bitrate and soft at this size).
 *
 * What the AI says is scripted: the e2e server has no model key, so the
 * Tutor's reply and the Grading Assistant's comments are set by the
 * recording. Keep them to what the product actually does (the Tutor asks
 * questions and never writes for the student; the teacher reviews and
 * releases every grade).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import {
  setLessonPlannerReviewFlag,
  type LessonPlannerReviewFlag,
} from '../feature-flags';
import { submitUnifiedLogin } from '../helpers/unified-login';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';
import type { E2EContext } from '../seed-e2e';

const OUT = resolve(process.cwd(), '../../docs/marketing/demo-videos');
const VIEWPORT = { width: 1280, height: 720 };
const SCALE = 1.5; // 1920x1080 frames
const BASE_URL = 'http://127.0.0.1:5173';
const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';
const ONLY = process.env.MARKETING_DEMOS_ONLY?.split(',') ?? [
  'tutor',
  'grading-assistant',
  'lesson-planner',
];
const want = (key: string) => ONLY.includes(key);

const INK = '#1A1F2E';
const CREAM = '#F7F4EE';
const GREEN = '#1F4D3A';

const STUDENT = 'Maya Torres';
const TEACHER = 'Ms. Rivera';

type StorageState = Awaited<
  ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>
>;

// ---------------------------------------------------------------- the stage

/** Hide the dev-only controls, and draw a cursor: screencasts don't show one. */
function stage() {
  const style = document.createElement('style');
  style.textContent =
    '.local-dev-environment-control,.demo-feedback-dock,.demo-feedback-trigger{display:none!important}' +
    '#__rec_cursor{transition:background .12s}';
  const cursor = document.createElement('div');
  cursor.id = '__rec_cursor';
  Object.assign(cursor.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '22px',
    height: '22px',
    marginLeft: '-11px',
    marginTop: '-11px',
    borderRadius: '50%',
    background: 'rgba(26,31,46,.22)',
    border: '2px solid rgba(26,31,46,.85)',
    zIndex: '2147483647',
    pointerEvents: 'none',
    transform: 'translate(-60px,-60px)',
  });
  const mount = () => {
    if (!style.isConnected) document.head?.append(style);
    if (!cursor.isConnected) document.body?.append(cursor);
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount);
  else mount();
  setInterval(mount, 250);
  window.addEventListener(
    'mousemove',
    (e) => {
      cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    },
    true
  );
  window.addEventListener(
    'mousedown',
    () => (cursor.style.background = 'rgba(26,31,46,.65)'),
    true
  );
  window.addEventListener(
    'mouseup',
    () => (cursor.style.background = 'rgba(26,31,46,.22)'),
    true
  );
}

const pause = (page: Page, ms = 1000) => page.waitForTimeout(ms);

/** The caption for this beat, along the bottom. */
async function say(page: Page, text: string, hold = 2200) {
  await page.evaluate(
    ([t, ink]) => {
      let el = document.getElementById('__rec_caption');
      if (!el) {
        el = document.createElement('div');
        el.id = '__rec_caption';
        Object.assign(el.style, {
          position: 'fixed',
          left: '50%',
          bottom: '30px',
          transform: 'translateX(-50%)',
          width: 'max-content',
          maxWidth: '1040px',
          padding: '14px 26px',
          borderRadius: '16px',
          background: ink,
          color: '#fff',
          font: '600 24px/1.35 Inter, ui-sans-serif, system-ui, sans-serif',
          letterSpacing: '-0.01em',
          textAlign: 'center',
          zIndex: '2147483646',
          pointerEvents: 'none',
          boxShadow: '0 12px 32px rgba(0,0,0,.28)',
          transition: 'opacity .25s',
        });
        document.body.appendChild(el);
      }
      el.style.opacity = '1';
      el.textContent = t;
    },
    [text, INK] as const
  );
  await pause(page, hold);
}

async function unsay(page: Page) {
  await page.evaluate(() => {
    const el = document.getElementById('__rec_caption');
    if (el) el.style.opacity = '0';
  });
}

/** A full-screen card on the cream page: the opening title, or the end card. */
async function card(
  page: Page,
  kind: 'title' | 'end',
  heading: string,
  sub: string,
  hold: number
) {
  await page.evaluate(
    ([k, h, s, ink, cream, green]) => {
      const el = document.createElement('div');
      el.id = '__rec_card';
      Object.assign(el.style, {
        position: 'fixed',
        inset: '0',
        background: cream,
        zIndex: '2147483645',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '22px',
        color: ink,
        textAlign: 'center',
        opacity: '0',
        transition: 'opacity .35s',
      });
      const logo = document.createElement('img');
      logo.src = '/img/logo_for_light_mode.png';
      Object.assign(logo.style, {
        width: k === 'end' ? '150px' : '96px',
        height: 'auto',
      });
      const name = document.createElement('div');
      name.textContent = h;
      Object.assign(name.style, {
        font: `700 ${k === 'end' ? 54 : 68}px/1.08 Inter, ui-sans-serif, system-ui, sans-serif`,
        letterSpacing: '-0.025em',
        maxWidth: '1000px',
      });
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        width: '84px',
        height: '7px',
        borderRadius: '4px',
        background: green,
      });
      const line = document.createElement('div');
      line.textContent = s;
      Object.assign(line.style, {
        font: '500 30px/1.35 Inter, ui-sans-serif, system-ui, sans-serif',
        color: '#3A3F4B',
        maxWidth: '900px',
      });
      if (k === 'title') el.append(logo, name, bar, line);
      else el.append(logo, name, line);
      document.body.appendChild(el);
      const cursor = document.getElementById('__rec_cursor');
      if (cursor) cursor.style.visibility = 'hidden';
      const caption = document.getElementById('__rec_caption');
      if (caption) caption.style.opacity = '0';
      requestAnimationFrame(() =>
        requestAnimationFrame(() => (el.style.opacity = '1'))
      );
    },
    [kind, heading, sub, INK, CREAM, GREEN] as const
  );
  await page
    .locator('#__rec_card img')
    .evaluate((img: HTMLImageElement) =>
      img.complete ? null : new Promise((r) => (img.onload = r))
    );
  await pause(page, hold);
  if (kind === 'title') {
    await page.evaluate(() => {
      const el = document.getElementById('__rec_card');
      if (el) el.style.opacity = '0';
    });
    await pause(page, 380);
    await page.evaluate(() => {
      document.getElementById('__rec_card')?.remove();
      const cursor = document.getElementById('__rec_cursor');
      if (cursor) cursor.style.visibility = 'visible';
    });
  }
}

/** Move the drawn cursor to an element the way a person would, then click it. */
async function point(page: Page, target: Locator, click = true) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('nothing to point at');
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + Math.min(box.height / 2, 18),
    { steps: 16 }
  );
  await pause(page, 260);
  if (click) await target.click();
}

async function wheel(page: Page, dy: number, steps = 10) {
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(60);
  }
}

// ------------------------------------------------------------ the recording

async function signedIn(
  browser: Browser,
  email: string,
  password: string
): Promise<StorageState> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
  });
  const page = await context.newPage();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await submitUnifiedLogin(page, email, password);
  await page.waitForURL(
    (url) => url.pathname.startsWith('/app') || url.pathname === '/enter-code'
  );
  const state = await context.storageState();
  await context.close();
  return state;
}

type Frame = { file: string; t: number };

/**
 * One take in its own browser context, so sign-in never shows. `act` calls
 * `roll()` once the first page is ready: frames start there.
 */
async function take(
  browser: Browser,
  raw: string,
  state: StorageState,
  act: (page: Page, roll: () => Promise<void>) => Promise<void>
): Promise<Frame[]> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    storageState: state,
  });
  await context.addInitScript(stage);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const dir = mkdtempSync(join(raw, 'take-'));
  const frames: Frame[] = [];
  let rolling = false;
  cdp.on('Page.screencastFrame', (frame) => {
    const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, 'base64'));
    frames.push({ file, t: frame.metadata.timestamp ?? Date.now() / 1000 });
    void cdp
      .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
      .catch(() => {});
  });
  await act(page, async () => {
    if (rolling) return;
    rolling = true;
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: VIEWPORT.width * SCALE,
      maxHeight: VIEWPORT.height * SCALE,
      everyNthFrame: 1,
    });
  });
  // The last frame is held to the end of the take.
  await pause(page, 300);
  await cdp.send('Page.stopScreencast').catch(() => {});
  frames.push({ file: frames.at(-1)!.file, t: Date.now() / 1000 });
  await context.close();
  return frames;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(VIEWPORT.width * 0.62, VIEWPORT.height * 0.55);
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
}

/** Lay the frames out at their real times, as 30fps H.264, plus a poster. */
function cut(name: string, raw: string, frames: Frame[], posterAt: number) {
  mkdirSync(OUT, { recursive: true });
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length - 1; i += 1) {
    const duration = Math.max(0.001, frames[i + 1]!.t - frames[i]!.t);
    lines.push(`file '${frames[i]!.file}'`, `duration ${duration.toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1)!.file}'`);
  const list = join(raw, `${name}.ffconcat`);
  writeFileSync(list, `${lines.join('\n')}\n`);
  const mp4 = join(OUT, `${name}.mp4`);
  ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    mp4,
  ]);
  ffmpeg([
    '-ss',
    posterAt.toFixed(2),
    '-i',
    mp4,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    join(OUT, `${name}.jpg`),
  ]);
  const seconds = Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      mp4,
    ]).toString()
  );
  // eslint-disable-next-line no-console
  console.log(`${name}.mp4: ${seconds.toFixed(1)}s`);
}

// ---------------------------------------------------------------- the data

const PROMPT =
  'Is Jay Gatsby “great”? Take a position and defend it with evidence from the novel.';
const TITLE = 'Is Gatsby Great?';
const ESSAY = [
  'In The Great Gatsby, Jay Gatsby is not great; he is a man who mistakes money for meaning.',
  'From the first party, Fitzgerald shows us a crowd that drinks Gatsby’s champagne but never knows his name. Nick notes that guests “came and went like moths among the whisperings and the champagne and the stars.” The parties are enormous but they are empty.',
  'Gatsby believes that if he can buy the right house he can buy back the past. When Nick tells him “you can’t repeat the past” Gatsby answers, “Why of course you can!” That certainty is what ruins him.',
];
const html = (paragraphs: string[]) =>
  paragraphs.map((p) => `<p>${p}</p>`).join('<p></p>');

/** Names a teacher would recognize, in place of the e2e fixtures'. */
async function dressTheSet(ctx: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { name: STUDENT },
    });
    await prisma.user.update({
      where: { id: ctx.teacherUserId },
      data: { name: TEACHER },
    });
    await prisma.class.update({
      where: { id: ctx.classId },
      data: { title: 'English 10', period: '3rd' },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** The Gatsby essay assignment, Maya's draft of it, and (optionally) her submission. */
async function gatsbyEssay(ctx: E2EContext, submitted: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: ctx.classId,
      assignmentTypeId: ctx.thesisEssayAssignmentTypeId,
      title: TITLE,
      prompt: PROMPT,
    });
    const text = ESSAY.join('\n\n');
    const document = await prisma.document.create({
      data: {
        title: TITLE,
        text,
        html: html(ESSAY),
        membershipId: ctx.membershipId,
        assignmentTypeId: ctx.thesisEssayAssignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
      },
      select: { id: true },
    });
    if (!submitted) return { documentId: document.id, submissionId: null };
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        html: html(ESSAY),
        text,
        title: TITLE,
        submittedAt: new Date(),
      },
      select: { id: true },
    });
    return { documentId: document.id, submissionId: submission.id };
  } finally {
    await prisma.$disconnect();
  }
}

// ------------------------------------------------------------- the scripts

const TUTOR_REPLY =
  'Your thesis takes a clear side, which is a strong start. Right now “mistakes money for meaning” could describe a lot of characters. What does Gatsby think money will get him, and where in the novel do you see that most clearly?';

/**
 * The Tutor's reply, scripted: the request still goes to the real route so
 * the session and message are saved, then the reply text is swapped in.
 */
async function scriptTutor(page: Page, reply: string) {
  const prisma = createE2EPrismaClient();
  await page.route('**/api/domain/tutor-response', async (route) => {
    const body = route.request().postData() ?? '';
    const cmsId = /name="cmsId"\r\n\r\n([^\r]+)/.exec(body)?.[1];
    const said =
      /name="response"\r\n\r\n([\s\S]*?)\r\n--/.exec(body)?.[1] ?? '';
    if (!cmsId) return route.continue();
    await new Promise((r) => setTimeout(r, 1400));
    const session = await prisma.assignmentModuleSession.findUniqueOrThrow({
      where: { id: cmsId },
      select: {
        instructionsCompleted: true,
        assignmentModule: {
          select: {
            instructions: {
              select: { id: true },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });
    const instructions = session.assignmentModule.instructions;
    const instructionId = (
      instructions[session.instructionsCompleted] ?? instructions.at(-1)!
    ).id;
    await prisma.assignmentModuleSessionMessage.create({
      data: {
        assignmentModuleSessionId: cmsId,
        agent: 'user',
        content: said,
        instructionId,
      },
    });
    await prisma.assignmentModuleSessionMessage.create({
      data: {
        assignmentModuleSessionId: cmsId,
        agent: 'assistant',
        content: reply,
        instructionId,
      },
    });
    const cms = await prisma.assignmentModuleSession.findUnique({
      where: { id: cmsId },
      include: {
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        assignmentModule: {
          include: {
            instructions: {
              omit: { answerKey: true },
              orderBy: { position: 'asc' },
              include: { buttons: { orderBy: { position: 'asc' } } },
            },
            assignmentType: {
              select: {
                assignmentModules: {
                  select: { id: true, position: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cms }),
    });
  });
  return () => prisma.$disconnect();
}

const GRADING_COMMENTS: Record<string, string> = {
  overall:
    'Maya, your thesis takes a real position and your second paragraph proves it with a well-chosen quotation. Push your evidence further: tell us why the green light or the “repeat the past” line shows Gatsby mistaking money for meaning.',
  thesis: 'Clear, arguable thesis that answers the prompt directly.',
  organization:
    'Each paragraph has one job. Add a sentence that links the parties to the past.',
  evidence:
    'Good quotations. Explain how each one proves your claim, not just what it says.',
  voice:
    'Confident and readable. “The parties are enormous” sets up a sharp contrast.',
  grammar:
    'Watch your commas: several sentences run two ideas together without one. Read it aloud to catch them.',
};

/** The e2e Grading Assistant is a fixture with test wording: swap in a teacher's. */
async function scriptGrading(page: Page) {
  await page.route('**/api/domain/grade-essay-ai**', async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(
        /[A-Z][a-z]+, these legacy grading assistant suggestions still apply\./g,
        GRADING_COMMENTS.overall!
      )
      .replace(
        /Legacy thesis feedback from deterministic E2E\./g,
        GRADING_COMMENTS.thesis!
      )
      .replace(
        /Legacy organization feedback from deterministic E2E\./g,
        GRADING_COMMENTS.organization!
      )
      .replace(
        /Legacy evidence feedback from deterministic E2E\./g,
        GRADING_COMMENTS.evidence!
      )
      .replace(
        /Legacy voice feedback from deterministic E2E\./g,
        GRADING_COMMENTS.voice!
      )
      .replace(
        /Legacy grammar feedback from deterministic E2E\./g,
        GRADING_COMMENTS.grammar!
      )
      .replace(/Deterministic E2E feedback for [^".]+\./g, '');
    await route.fulfill({ response, body });
  });
}

const PLANNER_FLAGS: LessonPlannerReviewFlag[] = [
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
const DECK = {
  title: 'What we carry',
  unit: 'The Things They Carried',
  art: 'turner-temeraire',
  slides: [
    {
      layout: 'title',
      title: 'What we carry',
      subtitle: 'The weight of small things',
      course: 'English 10',
      ...notes,
    },
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
    {
      layout: 'write',
      title: 'Write',
      body: 'What is one thing you carry every day that nobody else can see?',
      seconds: 240,
      step: 1,
      ...notes,
    },
    {
      layout: 'discuss',
      title: 'Talk',
      question:
        'Which one object would tell a stranger something true about you?',
      grouping: 'Pairs · 4 min',
      step: 2,
      ...notes,
    },
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
    {
      layout: 'exit',
      title: 'Before you go',
      body: 'One object, one sentence: why it matters.',
      button: 'Exit ticket',
      nextLesson: 'Love',
      step: 6,
      ...notes,
    },
  ],
};

/** A planned lesson (Day One of The Things They Carried), filed, with its deck. */
async function plannedLesson(ctx: E2EContext, teacher: StorageState) {
  for (const flag of PLANNER_FLAGS)
    await setLessonPlannerReviewFlag(flag, true);
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanTemplate.deleteMany({
      where: { membershipId: ctx.teacherMembershipId },
    });
    await prisma.lessonPlanConversation.deleteMany({
      where: { membershipId: ctx.teacherMembershipId },
    });
    const lesson = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Day One: What We Carry',
        periodMinutes: 50,
        lessonClassLabel: 'English 10 · Period 3',
        messages: {
          create: [
            {
              role: 'user',
              content:
                'Day one of The Things They Carried, English 10, 50 minutes.',
              createdAt: new Date(Date.UTC(2026, 10, 30, 10, 0, 0)),
            },
            {
              role: 'assistant',
              content: DAY_ONE_REPLY,
              createdAt: new Date(Date.UTC(2026, 10, 30, 10, 0, 1)),
            },
          ],
        },
      },
      include: { messages: { where: { role: 'assistant' } } },
    });
    const { request } = await import('@playwright/test');
    const api = await request.newContext({
      baseURL: BASE_URL,
      storageState: teacher,
    });
    const filed = await api.post('/api/domain/lesson-planner/packet', {
      form: {
        intent: 'keep-all',
        conversationId: lesson.id,
        messageId: lesson.messages[0]!.id,
      },
    });
    expect(filed.ok()).toBe(true);
    await api.dispose();
    const deck = await prisma.lessonPlanMaterial.create({
      data: {
        conversationId: lesson.id,
        sourceMessageId: lesson.messages[0]!.id,
        sourceCreatedAt: new Date(Date.UTC(2026, 10, 30, 10, 0, 2)),
        blockKey: 'deck',
        slot: 'deck',
        kind: 'slides',
        title: 'What we carry',
        audience: 'teacher',
        content: '```yawp-slides\n' + JSON.stringify(DECK) + '\n```',
      },
    });
    await prisma.lessonPlanConversation.update({
      where: { id: lesson.id },
      data: { lessonDate: new Date('2026-12-01T12:00:00Z') },
    });
    return { lessonId: lesson.id, deckId: deck.id };
  } finally {
    await prisma.$disconnect();
  }
}

const END = { heading: 'Yawp! Writing that stays human.', sub: 'yawp.school' };

// ----------------------------------------------------------------- the three

test('record the marketing demos', async ({ browser, e2eContext }) => {
  test.setTimeout(900_000);
  await dressTheSet(e2eContext);
  const teacher = await signedIn(
    browser,
    e2eContext.teacherEmail,
    TEACHER_PASSWORD
  );
  const student = await signedIn(
    browser,
    e2eContext.userEmail,
    STUDENT_PASSWORD
  );
  const raw = mkdtempSync(join(tmpdir(), 'marketing-demos-'));

  // ------------------------------------------------------------------ Tutor
  if (want('tutor')) {
    const { documentId } = await gatsbyEssay(e2eContext, false);
    const frames = await take(browser, raw, student, async (page, roll) => {
      const done = await scriptTutor(page, TUTOR_REPLY);
      await open(page, `/app/documents/${documentId}`);
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible();
      const input = page.getByTestId('tutor-chat-input');
      if (!(await input.isVisible().catch(() => false)))
        await page.getByTestId('tutor-chat-open').click();
      await expect(input).toBeVisible();
      await roll();
      await card(
        page,
        'title',
        'A writing tutor that never writes it for them.',
        'The Yawp! Tutor',
        2600
      );
      await say(page, 'Students draft their essays in Yawp!', 1800);
      await say(page, 'Stuck? They ask the Tutor.', 300);
      await point(page, input);
      await input.pressSequentially('Is my thesis strong enough?', {
        delay: 45,
      });
      await pause(page, 350);
      await point(page, page.getByTestId('tutor-chat-send'));
      await expect(page.getByText(TUTOR_REPLY.slice(0, 40))).toBeVisible({
        timeout: 15_000,
      });
      await say(page, 'It asks the questions a great teacher would…', 3600);
      await say(page, '…so the thinking, and the writing, stay theirs.', 300);
      // Maya sharpens her thesis.
      const phrase = editor
        .getByText('mistakes money for meaning', { exact: false })
        .first();
      await phrase.scrollIntoViewIfNeeded();
      // The phrase wraps, so drag from its first line's start to its last line's end.
      const [x0, y0, x1, y1] = await page.evaluate((needle) => {
        const root = document.querySelector('.ProseMirror')!;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const at = n.textContent!.indexOf(needle);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(n, at);
          range.setEnd(n, at + needle.length);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0);
          const a = rects[0]!;
          const b = rects.at(-1)!;
          return [
            a.left + 1,
            a.top + a.height / 2,
            b.right - 1,
            b.top + b.height / 2,
          ];
        }
        throw new Error('phrase not found');
      }, 'mistakes money for meaning');
      await page.mouse.move(x0!, y0!, { steps: 16 });
      await page.mouse.down();
      await page.mouse.move(x1!, y1!, { steps: 14 });
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.getSelection()?.toString().replace(/\s+/g, ' ')
          )
        )
        .toBe('mistakes money for meaning');
      await pause(page, 500);
      await page.keyboard.type(
        'believes money can buy back the past, and that belief destroys him',
        { delay: 32 }
      );
      await pause(page, 1800);
      await card(page, 'end', END.heading, END.sub, 2600);
      await done();
    });
    cut('tutor', raw, frames, 1.4);
  }

  // ------------------------------------------------------ Grading Assistant
  if (want('grading-assistant')) {
    const { submissionId } = await gatsbyEssay(e2eContext, true);
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await scriptGrading(page);
      await open(page, `/app/submissions/${submissionId}`);
      await roll();
      await card(
        page,
        'title',
        'Feedback on every essay, in seconds.',
        'The Yawp! Grading Assistant',
        2600
      );
      await say(page, 'Open a student’s essay.', 1600);
      await say(
        page,
        'One click: the Grading Assistant scores it against your rubric…',
        300
      );
      await point(page, page.getByTestId('grading-assistant-generate'));
      const replace = page.getByRole('button', {
        name: 'Replace',
        exact: true,
      });
      if (await replace.isVisible({ timeout: 800 }).catch(() => false))
        await replace.click();
      await expect(page.getByTestId('grading-overall-comment')).not.toHaveValue(
        '',
        { timeout: 60_000 }
      );
      await pause(page, 1500);
      await say(page, '…and drafts specific, encouraging feedback.', 300);
      const evidence = page
        .getByRole('button', { name: /Evidence\/Support/ })
        .first();
      if (await evidence.isVisible().catch(() => false)) {
        await point(page, evidence);
        await pause(page, 900);
        // Bring the criterion's comment into view in the grading panel.
        await wheel(page, 260, 8);
        await pause(page, 2600);
        await wheel(page, -260, 8);
      } else {
        await pause(page, 3200);
      }
      await say(
        page,
        'You stay in charge: edit anything, then release it.',
        300
      );
      const overall = page.getByTestId('grading-overall-comment');
      await point(page, overall);
      await page.keyboard.press('End');
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' Great revision, Maya!', { delay: 40 });
      await pause(page, 600);
      await point(
        page,
        page.getByRole('button', { name: 'Save', exact: true }),
        false
      );
      await pause(page, 1600);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('grading-assistant', raw, frames, 1.4);
  }

  // --------------------------------------------------------- Lesson Planner
  if (want('lesson-planner')) {
    const { lessonId, deckId } = await plannedLesson(e2eContext, teacher);
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(page, `/app/lesson-planner?c=${lessonId}`);
      await wheel(page, -6000, 2);
      await roll();
      await card(
        page,
        'title',
        'Tomorrow’s lesson, planned in minutes.',
        'The Yawp! Lesson Planner',
        2600
      );
      await say(
        page,
        'Tell it the class, the text and the time you have.',
        1600
      );
      await say(page, 'Get a complete, timed lesson plan, step by step.', 300);
      await wheel(page, 560, 14);
      await pause(page, 2200);
      await open(page, `/app/lesson-planner/${lessonId}/packet`);
      await say(page, 'Every minute accounted for, ready to adjust.', 300);
      await wheel(page, 300, 10);
      await pause(page, 2400);
      await open(page, `/present/${lessonId}/${deckId}`);
      // Presenting is keyboard-driven: no cursor over the slides.
      await page.evaluate(() => {
        const cursor = document.getElementById('__rec_cursor');
        if (cursor) cursor.style.visibility = 'hidden';
      });
      await say(page, 'And a slide deck, ready to present.', 1200);
      await unsay(page);
      for (let i = 0; i < 4; i += 1) {
        await page.keyboard.press('ArrowRight');
        await pause(page, 1500);
      }
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('lesson-planner', raw, frames, 1.4);
  }
});
