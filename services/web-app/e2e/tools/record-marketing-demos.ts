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
const ONLY = process.env.MARKETING_DEMOS_ONLY?.split(',') ?? [
  'tutor',
  'grading-assistant',
  'reporter',
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

const END = { heading: 'Yawp! Writing that stays human.', sub: 'yawp.school' };

// ----------------------------------------------------------------- the three

test('record the marketing demos', async ({ browser, e2eContext }) => {
  test.setTimeout(900_000);
  await dressTheSet(e2eContext);
  await useProductionThesisEssay(e2eContext);
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
});
