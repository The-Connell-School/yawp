/**
 * Records short (20–30 second) marketing demos of Yawp! features from the
 * real app with demo data: no sound, a title card, a caption for each beat
 * and an end card. They are for Brian's marketing, not for any page in the
 * app, so they are written outside public/.
 *
 *   tutor             The student Tutor on a real essay step: it gives
 *                     feedback and asks questions, and never writes for them.
 *   grading-assistant The Grading Assistant on a full essay: rubric scores,
 *                     feedback, and the purple grammar highlights.
 *   reporter          Yawp Reporter: who needs attention, and why.
 *
 * Not part of any test run. With the e2e dev server up on :5173:
 *   bunx playwright test -c playwright.marketing-demos.config.ts
 * MARKETING_DEMOS_ONLY=tutor,reporter records just those. It writes
 * docs/marketing/demo-videos/<name>.mp4 and <name>.jpg (needs ffmpeg).
 *
 * The app is set up the way production is: the original document editor
 * (document-editor-v2 off) and the production Thesis-Driven Essay Tutor steps
 * (packages/prisma/fixtures/prod-fidelity), not the e2e stubs.
 *
 * Video is captured with the DevTools screencast at 1.5x device scale, so the
 * 1280x720 page comes out as sharp 1920x1080 frames (Playwright's own video
 * recorder is low bitrate and soft at this size).
 *
 * What the AI says is scripted: the e2e server has no model key, so the
 * Tutor's reply, the Grading Assistant's comments and grammar issues, and
 * Reporter's report are set by the recording. Keep them to what the product
 * actually does (the Tutor never writes for the student; the teacher reviews
 * and releases every grade; Reporter reads released grades and comments).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import { setFeatureFlag } from '../feature-flags';
import { submitUnifiedLogin } from '../helpers/unified-login';
import type { E2EContext } from '../seed-e2e';
import { buildDemoWorld, discardTakeAssignments } from './marketing-demo-world';

const OUT = resolve(process.cwd(), '../../docs/marketing/demo-videos');
const PROD_FIDELITY = resolve(
  process.cwd(),
  '../../packages/prisma/fixtures/prod-fidelity'
);
const VIEWPORT = { width: 1280, height: 720 };
const SCALE = 1.5; // 1920x1080 frames
const BASE_URL = 'http://127.0.0.1:5173';
const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';
const ALL = [
  // The demo class's own pages first, before any take adds an assignment.
  'class-summary',
  'grading-workflow',
  'margin-comments',
  'tutor',
  'grading-assistant',
  'reporter',
  'student-feedback',
  'pre-writing',
  'thesis-builder',
  'class-starter',
  'prompt-library',
  'exit-ticket',
  'writing-practice',
];
const ONLY = process.env.MARKETING_DEMOS_ONLY?.split(',') ?? ALL;
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

/** Where captions centre: the middle, unless a take's controls sit under it. */
let captionCentre = '50%';

/** The caption for this beat, along the bottom. */
async function say(page: Page, text: string, hold = 2200) {
  await page.evaluate(
    ([t, ink, centre]) => {
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
      el.style.left = centre;
      el.textContent = t;
    },
    [text, INK, captionCentre] as const
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

/** Maya's essay, mistakes and all: a real draft for the Grading Assistant to read. */
const ESSAY = [
  'In F. Scott Fitzgerald’s The Great Gatsby, Jay Gatsby throws the biggest parties on Long Island, buys a mansion across the bay from the woman he loves, and reinvents his entire past. Many readers see him as a romantic hero. But Gatsby is not great; he is a man who mistakes money for meaning, and his belief that wealth can buy back the past is exactly what destroys him.',
  'First, Gatsby’s parties show that his wealth attracts crowds but not friends. Nick describes how guests “came and went like moths among the whisperings and the champagne and the stars.” Most of the guests has never even met Gatsby, they just show up for the free champagne. The parties are enormous but they are empty, and when Gatsby needs someone at the end, none of them are there.',
  'Second, Gatsby believes money can buy back the past. When Nick tells him “you can’t repeat the past” Gatsby answers, “Why of course you can!” He gives Daisy a tour of his mansion and throws his shirts in front of her like their proof that he is finally good enough. Its as if he thinks love is something you can earn with a bank account.',
  'Finally, the green light shows that Gatsby’s dream was always out of reach. Every night he reaches toward the light at the end of Daisy’s dock, but the closer he gets to Daisy the more the dream fades. Once they are together again, Nick realizes that “the colossal significance of that light had now vanished forever.” The real Daisy could never live up to the one Gatsby imagined.',
  'In the end, Gatsby dies alone in his pool, and almost no one comes to his funeral. Fitzgerald shows that a life built on money and image is a life without meaning. Gatsby is not great, he is a warning about what happens when we confuse having things with being someone.',
];
const html = (paragraphs: string[]) =>
  paragraphs.map((p) => `<p>${p}</p>`).join('');

/** Names a teacher would recognize, and the app as production runs it. */
async function dressTheSet(ctx: E2EContext) {
  await setFeatureFlag('document-editor-v2', false);
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
    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { reporterEnabled: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

type FixtureRow = Record<string, unknown> & { id: string };
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(PROD_FIDELITY, `${name}.json`), 'utf8')
  ) as FixtureRow[];

/**
 * The e2e Thesis-Driven Essay has one stub step ("Draft"). Give it the
 * production steps (Welcome, Pre-writing, Thesis Statement, Introduction,
 * Body Paragraphs, …) with their instructions and buttons, from the
 * prod-fidelity export. The stub is soft-deleted, not removed.
 */
async function useProductionThesisEssay(ctx: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const typeId = ctx.thesisEssayAssignmentTypeId;
    const live = await prisma.assignmentModule.findMany({
      where: { assignmentTypeId: typeId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (live.some((m) => m.title.trim() === 'Body Paragraphs')) return;
    await prisma.assignmentModule.updateMany({
      where: { assignmentTypeId: typeId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    const prodType = fixture('assignment-types').find(
      (t) => t.title === 'The Thesis-Driven Essay'
    )!;
    const modules = fixture('assignment-modules')
      .filter((m) => m.assignmentTypeId === prodType.id && !m.deletedAt)
      .sort((a, b) => (a.position as number) - (b.position as number));
    const instructions = fixture('assignment-module-instructions');
    const buttons = fixture('assignment-module-instruction-buttons');
    for (const m of modules) {
      await prisma.assignmentModule.create({
        data: {
          assignmentTypeId: typeId,
          title: m.title as string,
          position: m.position as number,
          description: (m.description as string | null) ?? null,
          tutorInstructions: (m.tutorInstructions as string | null) ?? null,
          isSelfGuided: Boolean(m.isSelfGuided),
          instructions: {
            create: instructions
              .filter((i) => i.assignmentModuleId === m.id)
              .map((i) => ({
                title: i.title as string,
                position: i.position as number,
                prompt: i.prompt as string,
                showChatButton: i.showChatButton as boolean,
                showNextButton: i.showNextButton as boolean,
                tutorInstructions:
                  (i.tutorInstructions as string | null) ?? null,
                buttons: {
                  create: buttons
                    .filter((b) => b.assignmentModuleInstructionId === i.id)
                    .map((b) => ({
                      label: b.label as string,
                      action: b.action as string,
                      position: b.position as number,
                    })),
                },
              })),
          },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** The Gatsby essay assignment, and Maya's document for it (optionally submitted). */
async function gatsbyEssay(
  ctx: E2EContext,
  paragraphs: string[],
  submitted: boolean
) {
  const prisma = createE2EPrismaClient();
  try {
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: ctx.classId,
      assignmentTypeId: ctx.thesisEssayAssignmentTypeId,
      title: TITLE,
      prompt: PROMPT,
    });
    const text = paragraphs.join('\n\n');
    const document = await prisma.document.create({
      data: {
        title: TITLE,
        text,
        html: html(paragraphs),
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
        html: html(paragraphs),
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

// ------------------------------------------------------ React Router's wire

/**
 * Fetcher responses are React Router's turbo-stream: one flat array where an
 * object is {"_<key index>": <value index>}. Rewrite a top-level field of the
 * action's data by appending the new value to the array.
 */
function setTurboField(body: string, field: string, value: unknown): string {
  const [first, ...rest] = body.split('\n');
  const arr = JSON.parse(first!) as unknown[];
  const encode = (v: unknown): number => {
    if (Array.isArray(v)) {
      const at = arr.push(null) - 1;
      arr[at] = v.map(encode);
      return at;
    }
    if (v && typeof v === 'object') {
      const at = arr.push(null) - 1;
      const out: Record<string, number> = {};
      for (const [k, val] of Object.entries(v))
        out[`_${encode(k)}`] = encode(val);
      arr[at] = out;
      return at;
    }
    return arr.push(v) - 1;
  };
  const keyAt = arr.indexOf(field);
  if (keyAt < 0) throw new Error(`no ${field} in the response`);
  const holder = arr.find(
    (x): x is Record<string, number> =>
      !!x && typeof x === 'object' && !Array.isArray(x) && `_${keyAt}` in x
  );
  if (!holder) throw new Error(`no object holds ${field}`);
  holder[`_${keyAt}`] = encode(value);
  return [JSON.stringify(arr), ...rest].join('\n');
}

/** A fetcher response that is just `data`, in turbo-stream form. */
function turboData(data: Record<string, unknown>): string {
  const arr: unknown[] = [{ _1: 2 }, 'data', null];
  const encode = (v: unknown): number => {
    if (Array.isArray(v)) {
      const at = arr.push(null) - 1;
      arr[at] = v.map(encode);
      return at;
    }
    if (v && typeof v === 'object') {
      const at = arr.push(null) - 1;
      const out: Record<string, number> = {};
      for (const [k, val] of Object.entries(v))
        out[`_${encode(k)}`] = encode(val);
      arr[at] = out;
      return at;
    }
    return arr.push(v) - 1;
  };
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(data))
    out[`_${encode(k)}`] = encode(val);
  arr[2] = out;
  return `${JSON.stringify(arr)}\n`;
}

// ------------------------------------------------------------- the scripts

const TUTOR_REPLY = [
  'Nice work! Your thesis is clear, and your first body paragraph backs it up with a strong quotation about the guests.',
  'One thing to push on: in your second body paragraph you quote “Why of course you can!” and then move right on. What does that line reveal about how Gatsby thinks money works? Add a sentence or two of your own analysis right after the quote.',
].join('\n\n');

/**
 * The Tutor's reply, scripted: the student's message and the reply are saved
 * to the session the way the real route saves them, then returned.
 */
async function scriptTutor(page: Page, reply: string) {
  const prisma = createE2EPrismaClient();
  await page.route('**/api/domain/tutor-response', async (route) => {
    const body = route.request().postData() ?? '';
    const cmsId = /name="cmsId"\r\n\r\n([^\r]+)/.exec(body)?.[1];
    const said =
      /name="response"\r\n\r\n([\s\S]*?)\r\n--/.exec(body)?.[1] ?? '';
    if (!cmsId) return route.continue();
    await new Promise((r) => setTimeout(r, 1600));
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
    const list = session.assignmentModule.instructions;
    const instructionId = (list[session.instructionsCompleted] ?? list.at(-1)!)
      .id;
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

const GRADING_COMMENTS = {
  overall:
    'Maya, this is a strong, arguable thesis, and every body paragraph supports it. Your next step is evidence: after each quotation, explain how it proves that Gatsby mistakes money for meaning. Then proofread for comma splices. The highlighted sentences show you where.',
  thesis: 'A clear, arguable thesis that takes a real position on the prompt.',
  organization:
    'Three body paragraphs, each with one job, and strong topic sentences.',
  evidence:
    'Well-chosen quotations. Explain how each one proves your claim, not just what it says.',
  voice: 'Confident and readable. “Enormous but empty” is a sharp contrast.',
  grammar:
    'Several comma splices and a few its/they’re slips. See the highlighted sentences.',
};

/** What the Grading Assistant's grammar pass flags in Maya's essay. */
const GRAMMAR_ISSUES = [
  {
    excerpt: 'Most of the guests has',
    kind: 'error',
    rule: 'Subject–verb agreement',
    message: '“Most of the guests” is plural, so the verb should be “have.”',
  },
  {
    excerpt: 'met Gatsby, they just show up',
    kind: 'error',
    rule: 'Comma splice',
    message:
      'Two complete sentences are joined with only a comma. Use a period or a semicolon.',
  },
  {
    excerpt: 'The parties are enormous but they are empty',
    kind: 'style',
    rule: 'Comma before a conjunction',
    message: 'Add a comma before “but” when it joins two complete sentences.',
  },
  {
    excerpt: 'the past” Gatsby answers',
    kind: 'error',
    rule: 'Punctuating quotations',
    message:
      'Add a comma inside the quotation marks: “…the past,” Gatsby answers.',
  },
  {
    excerpt: 'like their proof',
    kind: 'error',
    rule: 'their / they’re',
    message: 'Use “they’re” (they are) here, not the possessive “their.”',
  },
  {
    excerpt: 'Its as if',
    kind: 'error',
    rule: 'its / it’s',
    message: 'Use “It’s,” the contraction of “it is.”',
  },
  {
    excerpt: 'the closer he gets to Daisy the more the dream fades',
    kind: 'style',
    rule: 'Comma in a comparison',
    message:
      'Add a comma between the two halves: “the closer he gets to Daisy, the more the dream fades.”',
  },
  {
    excerpt: 'Gatsby is not great, he is a warning',
    kind: 'error',
    rule: 'Comma splice',
    message:
      'This joins two complete sentences with only a comma. Try a semicolon: “Gatsby is not great; he is a warning.”',
  },
].map((issue, i) => ({ id: `demo-grammar-${i + 1}`, occurrence: 1, ...issue }));

/** The e2e Grading Assistant is a fixture with test wording: swap in a teacher's, and Maya's grammar. */
async function scriptGrading(page: Page, submissionId: string) {
  await page.route('**/api/domain/grade-essay-ai**', async (route) => {
    const response = await route.fetch();
    // The route saved the fixture's grammar pass; save Maya's, so the page
    // still shows them after it reloads its data.
    const prisma = createE2EPrismaClient();
    await prisma.submission.update({
      where: { id: submissionId },
      data: { grammarIssues: { version: 1, issues: GRAMMAR_ISSUES } },
    });
    await prisma.$disconnect();
    let body = (await response.text())
      .replace(
        /[A-Z][a-z]+, these legacy grading assistant suggestions still apply\./g,
        GRADING_COMMENTS.overall
      )
      .replace(
        /Legacy thesis feedback from deterministic E2E\./g,
        GRADING_COMMENTS.thesis
      )
      .replace(
        /Legacy organization feedback from deterministic E2E\./g,
        GRADING_COMMENTS.organization
      )
      .replace(
        /Legacy evidence feedback from deterministic E2E\./g,
        GRADING_COMMENTS.evidence
      )
      .replace(
        /Legacy voice feedback from deterministic E2E\./g,
        GRADING_COMMENTS.voice
      )
      .replace(
        /Legacy grammar feedback from deterministic E2E\./g,
        GRADING_COMMENTS.grammar
      )
      .replace(/Deterministic E2E feedback for [^".]+\./g, '');
    if (body.includes('"grammarIssues"')) {
      body = setTurboField(body, 'grammarIssues', {
        version: 1,
        issues: GRAMMAR_ISSUES,
      });
    }
    await route.fulfill({ response, body });
  });
}

const REPORTER_QUESTION = 'Who needs attention?';
const REPORTER_REPLY = `**Three students in English 10 need your attention this week.**

| Student | Average | Trend | Slipping skill |
| --- | --- | --- | --- |
| Jordan Ellis | 61% | 78% → 52% | Evidence/Support |
| Priya Shah | 68% | 74% → 63% | Thesis/Content |
| Marcus Webb | 70% | steady | Grammar/Syntax |

### Jordan Ellis
Jordan's last four essays fell from 78% to 52%. Your own comments name the same pattern each time: *"the quotations are there, but you never explain them."* Jordan scores about the same with the Tutor on or off, so this is a skill gap, not a support gap.

**Try:** a five-minute conference on one body paragraph: the quotation, then two sentences that start "This shows…"

### Priya Shah
Priya's theses have gotten broader since October. Two of your last three comments ask her to "pick a side." A Thesis Builder warm-up before the next essay would target exactly that.

### Marcus Webb
Marcus's ideas are strong (4/5 on Thesis/Content every time), but comma splices cost him points on every essay.

\`\`\`suggestions
Draft a growth plan for Jordan
Compare cold and warm writes for English 10
\`\`\``;

/**
 * Reporter's answer, scripted: the conversation is saved the way the real
 * route saves it, then the action's data goes back to the page.
 */
async function scriptReporter(page: Page, ctx: E2EContext) {
  const prisma = createE2EPrismaClient();
  await page.route('**/api/domain/reporter.data**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const asked =
      new URLSearchParams(route.request().postData() ?? '').get('message') ??
      REPORTER_QUESTION;
    await new Promise((r) => setTimeout(r, 2200));
    const askedAt = new Date();
    const conversation = await prisma.reporterConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: REPORTER_QUESTION,
        messages: {
          create: [
            { role: 'user', content: asked, createdAt: askedAt },
            {
              role: 'assistant',
              content: REPORTER_REPLY,
              createdAt: new Date(askedAt.getTime() + 1),
            },
          ],
        },
      },
      select: { id: true },
    });
    await route.fulfill({
      status: 200,
      contentType: 'text/x-script',
      body: turboData({
        conversationId: conversation.id,
        reply: REPORTER_REPLY,
        isNewConversation: true,
        growthPlanProposals: [],
      }),
    });
  });
  return () => prisma.$disconnect();
}

/** The caret, placed just after `needle` in the editor (the way a click would). */
async function caretAfter(page: Page, needle: string) {
  const [x, y] = await page.evaluate((text) => {
    const root = document.querySelector('.ProseMirror')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf(text);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + text.length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const last = rects.at(-1)!;
      return [last.right, last.top + last.height / 2];
    }
    throw new Error(`"${text}" is not in the editor`);
  }, needle);
  await page.mouse.move(x! - 1, y!, { steps: 16 });
  await pause(page, 200);
  await page.mouse.click(x! - 1, y!);
  // Out of the way of the words being typed.
  await page.mouse.move(x! + 40, y! + 70, { steps: 8 });
}

// --------------------------------------------- the newer takes' content

/** Maya's pre-write: messy on purpose, the way the Pre-writing step asks for. */
const PREWRITE = [
  'Gatsby is rich and throws giant parties but nobody actually knows him. Why do people come? For the champagne. He wants Daisy back, he wants the past back, five whole years. The green light across the bay. Is that great or just sad? Maybe great means big, like impressive, not good. Nick kind of admires him at the end even though he disapproves of everything else. Money can’t buy the past but Gatsby thinks it can.',
];
const PREWRITE_REPLY = [
  'This is a great pre-write: messy in the best way! You keep circling back to one idea: money, the parties, and buying back the past. That might be your focus.',
  'A couple of questions to push it further:\n1. Why do you think Gatsby believes money can bring back the past?\n2. Is Nick’s admiration at the end a sign that Gatsby is great, or a sign of something else?',
].join('\n\n');

/** Maya's notes for the Thesis Builder: an observation and her analysis of it. */
const THESIS_NOTES = [
  'Focus/Observation: Gatsby believes money can buy back the past.',
  'Analysis: His parties attract crowds but not friends.',
  'Analysis: He shows Daisy his house and his shirts as if they prove he deserves her.',
  'Analysis: The green light shows his dream was always out of reach.',
];
const THESIS_REPLY = [
  'These are strong pieces of analysis, and each one could become a body paragraph.',
  'Now pull them into one sentence that takes a clear position. Start with your observation, then add what it means: what does Gatsby’s belief about money finally do to him?',
].join('\n\n');

/** Ms. Rivera's margin comments on Maya's released essay. */
const MAYA_COMMENTS = [
  {
    excerpt: 'Gatsby is not great; he is a man who mistakes money for meaning',
    content:
      'This is a strong, arguable thesis. Make every paragraph prove it.',
  },
  {
    excerpt:
      'came and went like moths among the whisperings and the champagne and the stars.',
    content:
      'Beautiful quotation. Now tell me what the moths say about the guests.',
  },
  {
    excerpt:
      'the colossal significance of that light had now vanished forever.',
    content:
      'Great find. Why does the light lose its meaning once he has Daisy?',
  },
];

/** Grades, comments and grammar notes on Maya's essay, released to her. */
async function releaseMayasGrade(ctx: E2EContext, submissionId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        gradedByMembershipId: ctx.teacherMembershipId,
        gradedAt: new Date(),
        numericPercentage: 88,
        letterGrade: 'B+',
        score: '88% (B+)',
        overallScore: 4,
        overallComment: GRADING_COMMENTS.overall,
        rubricScores: {
          thesis_and_content: 5,
          organization_and_structure: 4,
          evidence_and_support: 3,
          voice_and_style: 4,
          grammar_and_mechanics: 2,
        },
        grammarIssues: { version: 1, issues: GRAMMAR_ISSUES },
        releasedAt: new Date(),
      },
    });
    for (const c of MAYA_COMMENTS) {
      await prisma.submissionComment.create({
        data: {
          submissionId,
          membershipId: ctx.teacherMembershipId,
          content: c.content,
          excerpt: c.excerpt,
          occurrence: 1,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** A take that summarizes the class starts from no summary. */
async function resetInsights(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** A take that comments on an essay starts from no comments. */
async function clearComments(submissionId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.submissionComment.deleteMany({ where: { submissionId } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Drag across `needle` on the page the way a teacher selects a sentence. */
async function dragSelect(page: Page, needle: string, root?: string) {
  const [x0, y0, x1, y1] = await page.evaluate(
    ([text, rootSelector]) => {
      const roots = rootSelector
        ? [...document.querySelectorAll(rootSelector)]
        : [document.body];
      const walker = document.createTreeWalker(
        roots.at(-1) ?? document.body,
        NodeFilter.SHOW_TEXT
      );
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent!.indexOf(text);
        if (at < 0) continue;
        const el = n.parentElement!;
        if (el.closest('textarea,script,style,[id^="__rec"]')) continue;
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + text.length);
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
      throw new Error(`"${text}" is not on the page`);
    },
    [needle, root ?? ''] as const
  );
  await page.mouse.move(x0!, y0!, { steps: 16 });
  await page.mouse.down();
  await page.mouse.move(x1!, y1!, { steps: 18 });
  await page.mouse.up();
}

const END = { heading: 'Yawp! Writing that stays human.', sub: 'yawp.school' };

// ----------------------------------------------------------------- the three

test('record the marketing demos', async ({ browser, e2eContext }) => {
  test.setTimeout(900_000);
  await dressTheSet(e2eContext);
  await useProductionThesisEssay(e2eContext);
  const world = await buildDemoWorld(e2eContext, ESSAY);
  await discardTakeAssignments(e2eContext, [world.essayAssignmentId]);
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
    // Maya is on Body Paragraphs: her intro and two body paragraphs are in.
    const { documentId } = await gatsbyEssay(
      e2eContext,
      ESSAY.slice(0, 3),
      false
    );
    const frames = await take(browser, raw, student, async (page, roll) => {
      const done = await scriptTutor(page, TUTOR_REPLY);
      await open(page, `/app/documents/${documentId}?cmsIdx=3`);
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible();
      const header = page.getByTestId('tutor-module-header');
      await expect(header).toContainText('Body Paragraphs');
      const feedback = page.getByRole('button', { name: 'Give me feedback!' });
      await expect(feedback).toBeVisible();
      await roll();
      // Keep captions over the essay, clear of the Tutor's buttons.
      captionCentre = '63%';
      await card(
        page,
        'title',
        'A writing tutor that never writes it for them.',
        'The Yawp! Tutor',
        2600
      );
      await say(
        page,
        'The Tutor walks students through every step of the essay.',
        300
      );
      await point(page, header, false);
      await pause(page, 2200);
      await say(page, 'When they want feedback, they ask for it.', 300);
      await point(page, feedback);
      await expect(page.getByText(TUTOR_REPLY.slice(0, 40))).toBeVisible({
        timeout: 15_000,
      });
      await pause(page, 600);
      await say(
        page,
        'It points out what’s working, and asks the questions a great teacher would.',
        4200
      );
      await say(page, 'The thinking, and the writing, stay theirs.', 300);
      await caretAfter(page, 'Why of course you can!”');
      await pause(page, 300);
      await page.keyboard.type(
        ' Gatsby truly believes that with enough money, even time will bend for him.',
        {
          delay: 34,
        }
      );
      await pause(page, 1600);
      await card(page, 'end', END.heading, END.sub, 2600);
      await done();
    });
    captionCentre = '50%';
    cut('tutor', raw, frames, 1.4);
  }

  // ------------------------------------------------------ Grading Assistant
  if (want('grading-assistant')) {
    const { submissionId } = await gatsbyEssay(e2eContext, ESSAY, true);
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await scriptGrading(page, submissionId!);
      await open(page, `/app/submissions/${submissionId}`);
      await roll();
      await card(
        page,
        'title',
        'Feedback on every essay, in seconds.',
        'The Yawp! Grading Assistant',
        2600
      );
      await say(
        page,
        'Open a student’s essay. One click on the Grading Assistant…',
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
      const marks = page.locator('[data-grammar-issue-id]');
      await expect(marks.first()).toBeVisible({ timeout: 10_000 });
      await say(
        page,
        '…scores it against your rubric, drafts feedback, and marks every grammar slip.',
        2600
      );
      await say(page, 'Hover any highlight to see what’s wrong, and why.', 300);
      const agreement = marks
        .filter({ hasText: 'Most of the guests has' })
        .first();
      await point(page, agreement, false);
      await pause(page, 2600);
      const splice = marks
        .filter({ hasText: 'Gatsby is not great, he is a warning' })
        .first();
      await point(page, splice, false);
      await pause(page, 2400);
      await page.mouse.move(VIEWPORT.width * 0.2, VIEWPORT.height * 0.75, {
        steps: 12,
      });
      await say(page, 'Every rubric score comes with a reason.', 300);
      const evidence = page
        .getByRole('button', { name: /Evidence\/Support/ })
        .first();
      await point(page, evidence);
      await pause(page, 700);
      await wheel(page, 260, 8);
      await pause(page, 2400);
      await wheel(page, -260, 8);
      await say(
        page,
        'You stay in charge: edit anything, then release it.',
        300
      );
      const overall = page.getByTestId('grading-overall-comment');
      await point(page, overall);
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' Great progress, Maya!', { delay: 40 });
      await pause(page, 500);
      await point(
        page,
        page.getByRole('button', { name: 'Save', exact: true }),
        false
      );
      await pause(page, 1400);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('grading-assistant', raw, frames, 1.4);
  }

  // --------------------------------------------------------------- Reporter
  if (want('reporter')) {
    const prisma = createE2EPrismaClient();
    await prisma.reporterConversation.deleteMany({
      where: { membershipId: e2eContext.teacherMembershipId },
    });
    await prisma.$disconnect();
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      const done = await scriptReporter(page, e2eContext);
      await open(page, '/app/reporter');
      const starter = page
        .getByRole('button', { name: /who needs attention/i })
        .first();
      await expect(starter).toBeVisible();
      await roll();
      await card(
        page,
        'title',
        'Know who needs you, before report cards do.',
        'Yawp! Reporter',
        2600
      );
      await say(page, 'Ask about your classes in plain language.', 1200);
      await say(
        page,
        'Reporter reads every grade and comment you’ve released…',
        300
      );
      await point(page, starter);
      await expect(page.getByText('Three students in English 10')).toBeVisible({
        timeout: 15_000,
      });
      // The page lands at the end of the answer: start from its top.
      await page.mouse.move(VIEWPORT.width * 0.6, VIEWPORT.height * 0.5, {
        steps: 10,
      });
      await page
        .getByText('Three students in English 10')
        .scrollIntoViewIfNeeded();
      await page
        .getByText('Three students in English 10')
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await pause(page, 500);
      await say(page, '…and tells you who’s slipping, and why.', 3000);
      await wheel(page, 300, 18);
      await pause(page, 2400);
      await say(page, 'With a next step you can use tomorrow.', 300);
      await wheel(page, 400, 18);
      await pause(page, 600);
      await point(
        page,
        page
          .getByRole('button', { name: /Draft a growth plan for Jordan/ })
          .first(),
        false
      );
      await pause(page, 1800);
      await card(page, 'end', END.heading, END.sub, 2600);
      await done();
    });
    cut('reporter', raw, frames, 1.4);
  }

  // ---------------------------------------------------- Class summary
  if (want('class-summary')) {
    await resetInsights(world.essayClassAssignmentId);
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(
        page,
        `/app/my-classes/${e2eContext.classId}/assignments/${world.essayAssignmentId}`
      );
      const summarize = page.getByRole('button', {
        name: /Summarize class performance/,
      });
      await expect(summarize).toBeVisible();
      await roll();
      await card(
        page,
        'title',
        'See how the whole class did, in one click.',
        'Class performance summary',
        2600
      );
      await say(
        page,
        'Every graded essay in the class, summarized for you.',
        300
      );
      await point(page, summarize);
      await expect(page.getByText(/Across \d+ submissions/)).toBeVisible({
        timeout: 30_000,
      });
      await pause(page, 1600);
      await say(
        page,
        'Strengths and gaps, skill by skill on your rubric.',
        300
      );
      await page.mouse.move(VIEWPORT.width * 0.6, VIEWPORT.height * 0.5, {
        steps: 8,
      });
      await wheel(page, 300, 16);
      await pause(page, 1800);
      // The weakest skill: which students it is.
      const examples = page
        .getByText(/out of 5 on evidence\/support/)
        .locator(
          'xpath=following::*[normalize-space()="Show student examples"][1]'
        );
      if (await examples.isVisible().catch(() => false)) {
        await say(page, 'See exactly which students need help with what.', 300);
        await point(page, examples);
        await pause(page, 2600);
      }
      await say(
        page,
        'A next step for tomorrow’s lesson, and who’s ready for more.',
        300
      );
      await page.mouse.move(VIEWPORT.width * 0.6, VIEWPORT.height * 0.5, {
        steps: 8,
      });
      await wheel(page, 380, 16);
      await pause(page, 3400);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('class-summary', raw, frames, 1.4);
  }

  // ------------------------------------------------- Grading workflow
  if (want('grading-workflow')) {
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(
        page,
        `/app/my-classes/${e2eContext.classId}/assignments/${world.essayAssignmentId}`
      );
      const tab = (name: RegExp) => page.getByRole('button', { name });
      await expect(tab(/^Needs Grading$/)).toBeVisible();
      await tab(/^Needs Grading$/).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 220));
      await roll();
      await card(
        page,
        'title',
        'A whole class of essays, one at a time.',
        'Grading in Yawp!',
        2600
      );
      await say(
        page,
        'Every essay is sorted for you: needs grading, graded, released.',
        300
      );
      for (const name of [
        /^Graded$/,
        /^Released$/,
        /^In Progress$/,
        /^Needs Grading$/,
      ]) {
        await point(page, tab(name));
        await pause(page, 900);
      }
      await say(page, 'Open one…', 300);
      await point(
        page,
        page
          .getByRole('row', { name: /Isabella Reyes/ })
          .getByRole('link')
          .first()
      );
      await page.waitForURL(/\/app\/submissions\//);
      await page.waitForLoadState('networkidle');
      await pause(page, 1400);
      await say(page, '…then go straight to the next student’s.', 300);
      const next = page
        .getByRole('button', { name: /next/i })
        .or(page.getByRole('link', { name: /next/i }))
        .first();
      for (let i = 0; i < 2; i += 1) {
        await point(page, next);
        await page.waitForLoadState('networkidle');
        await pause(page, 1800);
      }
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('grading-workflow', raw, frames, 1.4);
  }

  // -------------------------------------------------- Margin comments
  if (want('margin-comments')) {
    const submissionId = world.submissions['Marcus Webb']!;
    await clearComments(submissionId);
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(page, `/app/submissions/${submissionId}`);
      await expect(page.getByText('Tom and Daisy are the real')).toBeVisible();
      await roll();
      await card(
        page,
        'title',
        'Comments right where the writing is.',
        'Feedback in the margin',
        2600
      );
      await say(page, 'Highlight any sentence…', 300);
      await dragSelect(
        page,
        'Tom and Daisy are the real villans of the story.',
        '[data-testid="essay-panel"], main'
      );
      await pause(page, 500);
      await say(
        page,
        '…and leave a comment the student will see beside it.',
        300
      );
      await point(
        page,
        page.getByRole('button', { name: 'Comment', exact: true })
      );
      const box = page
        .getByRole('textbox')
        .filter({
          hasNot: page.locator('[data-testid="grading-overall-comment"]'),
        })
        .last();
      await expect(box).toBeVisible();
      await box.pressSequentially(
        'Strong claim! Check the spelling of “villains,” then show us one careless thing Daisy does.',
        { delay: 26 }
      );
      await pause(page, 400);
      await point(
        page,
        page.getByRole('button', { name: 'Save', exact: true }).last()
      );
      await pause(page, 1400);
      await say(
        page,
        'Point to the exact words, so they know what’s working and what to fix.',
        300
      );
      await dragSelect(
        page,
        'smashed up things and creatures and then retreated back into their money'
      );
      await pause(page, 400);
      await point(
        page,
        page.getByRole('button', { name: 'Comment', exact: true })
      );
      const second = page
        .getByRole('textbox')
        .filter({
          hasNot: page.locator('[data-testid="grading-overall-comment"]'),
        })
        .last();
      await expect(second).toBeVisible();
      await second.pressSequentially(
        'Great evidence. What does “retreated back into their money” say about them?',
        { delay: 26 }
      );
      await pause(page, 300);
      await point(
        page,
        page.getByRole('button', { name: 'Save', exact: true }).last()
      );
      await pause(page, 2200);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('margin-comments', raw, frames, 1.4);
  }

  // ------------------------------------------------- Student feedback
  if (want('student-feedback')) {
    const { submissionId } = await gatsbyEssay(e2eContext, ESSAY, true);
    await releaseMayasGrade(e2eContext, submissionId!);
    const frames = await take(browser, raw, student, async (page, roll) => {
      await open(page, `/app/submissions/${submissionId}`);
      await expect(page.getByText(/88/).first()).toBeVisible();
      await roll();
      await card(
        page,
        'title',
        'Feedback students can actually use.',
        'What students see',
        2600
      );
      await say(page, 'Students see their grade and your feedback…', 2400);
      await say(page, '…your comments, right beside their own words…', 300);
      const comment = page.getByText(MAYA_COMMENTS[1]!.content).first();
      await point(page, comment, false);
      await pause(page, 2400);
      await say(page, '…and every grammar note, with the rule behind it.', 300);
      const mark = page
        .locator('[data-grammar-issue-id]')
        .filter({ hasText: 'Its as if' })
        .first();
      await point(page, mark, false);
      await pause(page, 2600);
      await say(page, 'Then they revise, with your feedback in hand.', 300);
      await point(page, page.getByTestId('submission-revise-essay'));
      await page.waitForLoadState('networkidle');
      await pause(page, 1600);
      // Maya fixes the it's the grammar note flagged, in her revision.
      await dragSelect(
        page,
        'Its as if',
        '.ProseMirror[contenteditable="true"]'
      );
      await pause(page, 300);
      await page.keyboard.type('It’s as if', { delay: 60 });
      await pause(page, 2000);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('student-feedback', raw, frames, 1.4);
  }

  // ----------------------------------------------------- Pre-writing
  if (want('pre-writing')) {
    const { documentId } = await gatsbyEssay(e2eContext, PREWRITE, false);
    const frames = await take(browser, raw, student, async (page, roll) => {
      const done = await scriptTutor(page, PREWRITE_REPLY);
      await open(page, `/app/documents/${documentId}?cmsIdx=0`);
      const header = page.getByTestId('tutor-module-header');
      await expect(header).toContainText('Pre-writing');
      const feedback = page.getByRole('button', { name: 'Give me feedback!' });
      await expect(feedback).toBeVisible();
      await roll();
      captionCentre = '63%';
      await card(
        page,
        'title',
        'Every essay starts with thinking.',
        'Pre-writing with the Yawp! Tutor',
        2600
      );
      await say(
        page,
        'Students pre-write: messy, fast, and all their own.',
        2400
      );
      await say(
        page,
        'The Tutor reads it and pushes their thinking further.',
        300
      );
      await point(page, feedback);
      await expect(page.getByText(PREWRITE_REPLY.slice(0, 40))).toBeVisible({
        timeout: 15_000,
      });
      await pause(page, 3600);
      await say(page, 'Until they find the focus for their essay.', 300);
      await caretAfter(page, 'but Gatsby thinks it can.');
      await page.keyboard.press('Enter');
      await page.keyboard.type(
        'Focus: Gatsby thinks money can buy back the past, and that is what ruins him.',
        { delay: 32 }
      );
      await pause(page, 1600);
      await card(page, 'end', END.heading, END.sub, 2600);
      await done();
    });
    captionCentre = '50%';
    cut('pre-writing', raw, frames, 1.4);
  }

  // ---------------------------------------------------- Thesis Builder
  if (want('thesis-builder')) {
    const { documentId } = await gatsbyEssay(e2eContext, THESIS_NOTES, false);
    const frames = await take(browser, raw, student, async (page, roll) => {
      const done = await scriptTutor(page, THESIS_REPLY);
      await open(page, `/app/documents/${documentId}?cmsIdx=1`);
      const header = page.getByTestId('tutor-module-header');
      await expect(header).toContainText('Thesis Statement');
      const ready = page.getByRole('button', { name: 'Ready!' });
      await expect(ready).toBeVisible();
      await roll();
      captionCentre = '63%';
      await card(
        page,
        'title',
        'From a focus to a real thesis.',
        'The Yawp! Thesis Builder',
        2600
      );
      await say(page, 'The Tutor teaches what makes a thesis great…', 1800);
      await point(page, ready);
      const feedback = page.getByRole('button', { name: 'Give me feedback!' });
      await expect(feedback).toBeVisible();
      await say(
        page,
        '…students build theirs from an observation and their analysis…',
        2200
      );
      await say(
        page,
        '…and the Tutor tells them how to make it stronger.',
        300
      );
      await point(page, feedback);
      await expect(page.getByText(THESIS_REPLY.slice(0, 40))).toBeVisible({
        timeout: 15_000,
      });
      await pause(page, 3400);
      await say(page, 'The thesis is still theirs to write.', 300);
      await caretAfter(page, 'was always out of reach.');
      await page.keyboard.press('Enter');
      await page.keyboard.type(
        'Thesis: Gatsby is not great; his belief that money can buy back the past is what destroys him.',
        { delay: 30 }
      );
      await pause(page, 1500);
      await card(page, 'end', END.heading, END.sub, 2600);
      await done();
    });
    captionCentre = '50%';
    cut('thesis-builder', raw, frames, 1.4);
  }

  // ----------------------------------------------------- Class Starter
  if (want('class-starter')) {
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(
        page,
        `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
      );
      await roll();
      await card(
        page,
        'title',
        'Get every student writing in the first five minutes.',
        'Class Starter',
        2600
      );
      await say(
        page,
        'One open prompt to start class. Graded on effort, not polish.',
        2600
      );
      await say(page, 'Pick one from a library of 200 prompts…', 300);
      await point(
        page,
        page.getByRole('button', { name: /Prompt Library/i }).first()
      );
      await pause(page, 700);
      await page.mouse.move(VIEWPORT.width * 0.45, VIEWPORT.height * 0.6, {
        steps: 8,
      });
      await wheel(page, 380, 14);
      await pause(page, 1600);
      await wheel(page, -380, 10);
      await say(page, '…or write your own, and send it to your class.', 300);
      await point(page, page.getByRole('button', { name: /^New/ }));
      await pause(page, 400);
      await point(page, page.getByRole('menuitem', { name: 'Assignment' }));
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toBeVisible();
      await pause(page, 500);
      await point(page, page.getByRole('checkbox', { name: /English 10/ }));
      const starterTitle = page.getByLabel('Title (optional)');
      await point(page, starterTitle);
      await starterTitle.pressSequentially('Breaking a promise', { delay: 35 });
      const prompt = page.getByRole('textbox', { name: 'Prompt' });
      await point(page, prompt);
      await prompt.pressSequentially(
        'Is it ever right to break a promise? Write about a time it mattered.',
        { delay: 22 }
      );
      await pause(page, 500);
      await point(
        page,
        page.getByRole('button', { name: /Create Assignment/i })
      );
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toHaveCount(0, { timeout: 20_000 });
      await pause(page, 1200);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('class-starter', raw, frames, 1.4);
  }

  // ----------------------------------------------- Essay prompt library
  if (want('prompt-library')) {
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(
        page,
        `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
      );
      const library = page
        .getByRole('button', { name: /Prompt Library/i })
        .first();
      await library.scrollIntoViewIfNeeded();
      await roll();
      await card(
        page,
        'title',
        'An essay prompt for every class you teach.',
        'The Thesis-Driven Essay prompt library',
        2600
      );
      await say(page, 'Open the prompt library…', 300);
      await point(page, library);
      await pause(page, 900);
      await say(
        page,
        '…search it, or filter by subject, text, and grade band…',
        300
      );
      const search = page.getByPlaceholder(/Search prompts/i).first();
      await point(page, search);
      await search.pressSequentially('hope', { delay: 70 });
      await pause(page, 2400);
      await say(page, '…then pick one, and it’s ready to assign.', 300);
      const first = page.getByText(/What Gives You Hope/).first();
      await point(page, first);
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toBeVisible({ timeout: 10_000 });
      await pause(page, 800);
      await point(page, page.getByRole('checkbox', { name: /English 10/ }));
      const title = page.getByRole('textbox', { name: 'Title' });
      await point(page, title);
      await title.pressSequentially('What Gives You Hope', { delay: 40 });
      await say(
        page,
        'The full prompt, grading, and the Tutor come set up.',
        300
      );
      const sheet = page.getByRole('dialog');
      await page.mouse.move(VIEWPORT.width * 0.85, VIEWPORT.height * 0.6, {
        steps: 8,
      });
      await sheet.evaluate((el) => {
        const scroller = [...el.querySelectorAll('*')].find(
          (n) =>
            n.scrollHeight > n.clientHeight + 40 &&
            getComputedStyle(n).overflowY !== 'visible'
        );
        (scroller ?? el).scrollBy({ top: 420, behavior: 'smooth' });
      });
      await pause(page, 2600);
      await point(
        page,
        page.getByRole('button', { name: /Create Assignment/i })
      );
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toHaveCount(0, { timeout: 20_000 });
      await pause(page, 1200);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('prompt-library', raw, frames, 1.4);
  }

  // ------------------------------------------------------- Exit Ticket
  if (want('exit-ticket')) {
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(
        page,
        `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
      );
      await roll();
      await card(
        page,
        'title',
        'Find out if today’s lesson landed.',
        'Exit Ticket',
        2600
      );
      await point(page, page.getByRole('button', { name: /^New/ }));
      await pause(page, 400);
      await point(page, page.getByRole('menuitem', { name: 'Assignment' }));
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toBeVisible();
      await say(page, 'Check one idea you taught today…', 300);
      await point(
        page,
        page.getByRole('radio', { name: /^Check for understanding/ })
      );
      await pause(page, 500);
      await point(page, page.getByLabel('What are you checking for?'));
      await point(
        page,
        page.getByRole('option', { name: 'Explain a concept' })
      );
      const topic = page.getByLabel('What specifically?');
      await point(page, topic);
      await topic.pressSequentially(
        'the difference between a claim and evidence',
        { delay: 30 }
      );
      await pause(page, 300);
      await point(page, page.getByRole('radio', { name: /^Yes/ }));
      await say(
        page,
        '…and Yawp! writes the question your students will answer.',
        1200
      );
      await page
        .getByText('the difference between a claim and evidence')
        .last()
        .scrollIntoViewIfNeeded();
      await pause(page, 2200);
      await say(page, 'Send it in the last five minutes of class.', 300);
      await point(page, page.getByRole('checkbox', { name: /English 10/ }));
      const title = page.getByLabel('Title (optional)');
      await point(page, title);
      await title.pressSequentially('Claims and evidence', { delay: 35 });
      await pause(page, 400);
      await point(
        page,
        page.getByRole('button', { name: /Create Assignment/i })
      );
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toHaveCount(0, { timeout: 20_000 });
      await pause(page, 1200);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('exit-ticket', raw, frames, 1.4);
  }

  // -------------------------------------------------- Writing Practice
  if (want('writing-practice')) {
    const frames = await take(browser, raw, teacher, async (page, roll) => {
      await open(page, '/app/writing-lessons');
      await roll();
      await card(
        page,
        'title',
        'Grammar practice that sticks.',
        'Yawp! Writing Practice',
        2600
      );
      await say(
        page,
        'Short lessons on grammar, sentence structure, and style.',
        300
      );
      const group = page.getByText('Grammar & Mechanics').first();
      if (
        !(await page
          .getByText('Fixing Comma Splices')
          .first()
          .isVisible()
          .catch(() => false))
      )
        await point(page, group);
      await pause(page, 1200);
      await say(
        page,
        'Each one explains the rule and shows it in action.',
        300
      );
      await point(page, page.getByText('Fixing Comma Splices').first());
      await page.waitForURL(/writing-lessons\/fixing-comma-splices/);
      await page.waitForLoadState('networkidle');
      await pause(page, 1200);
      await page.mouse.move(VIEWPORT.width * 0.45, VIEWPORT.height * 0.6, {
        steps: 8,
      });
      await wheel(page, 420, 16);
      await pause(page, 1600);
      await say(
        page,
        'Then mix the skills your class needs into one set.',
        300
      );
      await open(page, '/app/writing-lessons');
      await point(
        page,
        page.getByRole('button', { name: 'Create assignment' })
      );
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      for (const skill of [
        'Fixing Comma Splices',
        'Commas: Introductory Phrases',
        'Subject-Verb Agreement',
      ]) {
        const box = sheet.getByRole('checkbox', { name: skill });
        if (await box.count()) await point(page, box);
        await pause(page, 250);
      }
      await point(page, sheet.getByRole('checkbox', { name: /English 10/ }));
      await pause(page, 1600);
      await card(page, 'end', END.heading, END.sub, 2600);
    });
    cut('writing-practice', raw, frames, 1.4);
  }
});
