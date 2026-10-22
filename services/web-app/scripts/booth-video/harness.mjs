/**
 * Browser, recorder and on-screen helpers for the booth video.
 *
 * Chromium runs headful in a 1920×1080 X display (Xvfb) as a borderless app
 * window: 1536×864 CSS px at a 1.25 device scale, so the app's text is a
 * quarter larger than on a laptop. ffmpeg records the display (x11grab) into
 * one H.264 clip per shot.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BASE_URL = process.env.BOOTH_BASE_URL ?? 'http://localhost:5190';
const CHROMIUM = process.env.BOOTH_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Time a viewer needs to read a line: about 3.3 words a second, never under 2.4s. */
export const readingMs = (text) => Math.max(2400, (String(text).split(/\s+/).length / 3.3) * 1000 + 700);

export async function launch(profileDir) {
  fs.rmSync(profileDir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: CHROMIUM,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--app=data:text/html,<body style="background:%2327251A">',
      '--window-position=0,0',
      '--window-size=1536,864',
      '--force-device-scale-factor=1.25',
      '--hide-scrollbars',
      '--test-type',
      '--no-first-run',
      '--disable-infobars',
      '--disable-features=Translate,AutofillServerCommunication',
      '--font-render-hinting=none',
    ],
  });
  await context.addInitScript({ path: path.join(here, 'overlay.js') });
  // The dev-only persona menu has no place in a product video.
  await context.addInitScript(() => {
    const css = 'button[aria-label$="Open dev login menu."] { display: none !important; }';
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.documentElement.appendChild(s); };
    if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export class Recorder {
  constructor(outDir) {
    this.outDir = outDir;
    this.count = 0;
    this.clips = [];
    fs.mkdirSync(outDir, { recursive: true });
  }

  /** Starts a clip; resolves once ffmpeg is capturing frames. */
  async start(name) {
    const file = path.join(this.outDir, `${String(++this.count).padStart(2, '0')}-${name}.mp4`);
    this.proc = spawn('ffmpeg', [
      '-y', '-loglevel', 'error', '-nostdin',
      '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', '1920x1080',
      '-i', process.env.DISPLAY,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p',
      file,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    this.file = file;
    this.exited = new Promise((r) => this.proc.on('exit', r));
    await sleep(600);
    return file;
  }

  async stop() {
    if (!this.proc) return;
    this.proc.kill('SIGINT');
    await this.exited;
    this.clips.push(this.file);
    this.proc = undefined;
  }
}

/** On-screen voiceover and choreography, bound to one page. */
export function stage(page) {
  const booth = (fn, ...args) => page.evaluate(([name, a]) => window.__booth?.[name](...a), [fn, args]);

  async function rectOf(target) {
    const locator = typeof target === 'string' ? page.locator(target).first() : target;
    await locator.waitFor({ state: 'visible', timeout: 20000 });
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    return { locator, rect: box };
  }

  const s = {
    page,
    booth,
    async caption(text, { hold = true } = {}) {
      await booth('caption', text);
      if (hold && text) await sleep(readingMs(text));
    },
    async chapter(section, total) {
      await booth('chapter', section.n, total, section.title);
    },
    clearCaption: () => booth('caption', ''),
    /** Docks the caption under a column (e.g. the editor) so it never covers controls. */
    async dockCaption(target, opts = {}) {
      if (!target) return booth('captionDock', null);
      const { rect } = await rectOf(target);
      return booth('captionDock', { left: rect.x + 20, width: rect.width - 40, ...opts });
    },
    /** A tour-style callout on a target (or centred), held long enough to read. */
    async callout(target, { title, body, eyebrow, side, step, steps, dim = true, holdMs } = {}) {
      const rect = target ? (await rectOf(target)).rect : undefined;
      await booth('callout', { rect, title, body, eyebrow, side, step, steps, dim });
      await sleep(holdMs ?? readingMs(`${title} ${body ?? ''}`));
    },
    clearCallout: () => booth('clearCallout'),
    badge: (text) => booth('badge', text),
    async moveTo(target, ms = 650) {
      const { rect } = await rectOf(target);
      await booth('cursorTo', rect.x + rect.width / 2, rect.y + rect.height / 2, ms);
      await sleep(ms + 120);
    },
    /** Glides the visible cursor to the target, pulses, then really clicks it. */
    async click(target, { ms = 650, after = 500 } = {}) {
      const { locator, rect } = await rectOf(target);
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      await booth('cursorTo', x, y, ms);
      await sleep(ms + 100);
      await booth('ripple', x, y);
      await locator.click();
      await sleep(after);
    },
    /** Types like a person: real key events, so the editor's input tracking sees a student typing. */
    async type(target, text, { delay = 38 } = {}) {
      if (target) await s.click(target, { after: 250 });
      await page.keyboard.type(text, { delay });
    },
    /** Smoothly scrolls the target to the middle of its scroll container. */
    async scrollTo(target, { block = 'center', ms = 1100 } = {}) {
      const locator = typeof target === 'string' ? page.locator(target).first() : target;
      await locator.waitFor({ state: 'attached', timeout: 20000 });
      await locator.evaluate((node, b) => node.scrollIntoView({ behavior: 'smooth', block: b }), block);
      await sleep(ms);
    },
    hold: (ms) => sleep(ms),
  };
  return s;
}

export async function loginAs(context, email) {
  const response = await context.request.post(`${BASE_URL}/auth/dev-login`, { form: { email }, maxRedirects: 0 });
  if (response.status() !== 302) throw new Error(`dev-login for ${email} failed: ${response.status()}`);
}

/** Navigates and waits for the app to settle (no spinners, fonts loaded). */
export async function go(page, url) {
  await page.goto(url.startsWith('http') ? url : `${BASE_URL}${url}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
}

export async function showCard(page, html) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => { window.__booth?.hideCursor(true); window.__booth?.chapter(0); });
}
