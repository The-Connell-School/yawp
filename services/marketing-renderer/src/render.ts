import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import {
  type MarketingJobKind,
  type MarketingPersona,
  type MarketingStoryboard,
  type StoryboardScene,
  type StoryboardStep,
} from '@app/marketing-media';
import { CURSOR_INIT_SCRIPT, setCursorVisibilityScript } from './cursor';
import { HIDE_CAPTURE_CHROME_SCRIPT } from './capture-chrome';
import {
  buildStillFramingPage,
  frameClip,
  frameGeometry,
} from './frame';
import {
  buildTranscodeArgs,
  missingRecordingError,
  rawStillFileName,
  shotFileName,
} from './jobs';
import {
  fetchPreviewAccessCookies,
  parseSessionCookies,
  personaEmail,
} from './session';

export type RenderedFile = {
  path: string;
  kind: 'IMAGE' | 'VIDEO';
  label: string;
  contentType: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type RenderParams = {
  storyboard: MarketingStoryboard;
  kind: MarketingJobKind;
  baseUrl: string;
  outDir: string;
  loginPath?: string;
  chromiumPath?: string;
  ffmpegPath?: string;
  /** Seat code for a target behind the preview access gate. */
  accessCode?: string;
  /** Presentation. 'window' (default) re-shoots captures inside a gradient + browser-chrome scene; stills and clips alike. */
  frameStyle?: 'window' | 'none';
  /** Text in the framed window's address pill. */
  addressText?: string;
  /** Scenes whose optional steps failed, reported back for the job record. */
  onWarning?: (message: string) => void;
  /**
   * Called as the render moves between stages. The worker keeps the last one
   * so an abandoned attempt can say where it stopped instead of only that it
   * ran out of time — the difference between a diagnosable failure and a
   * guess.
   */
  onStage?: (stage: string) => void;
};

export type RenderResult = {
  files: RenderedFile[];
  warnings: string[];
};


const NAVIGATION_TIMEOUT_MS = 45_000;
const STEP_TIMEOUT_MS = 15_000;
/**
 * Every await in a render must be bounded. Page-level steps carry Playwright
 * timeouts, but the work around them — signing in, launching the browser,
 * encoding, tearing down — historically did not, so a single hung call could
 * silently eat the worker's entire attempt budget and be abandoned with no
 * indication of where it stopped. These bound the rest.
 */
const LOGIN_TIMEOUT_MS = 30_000;
const LAUNCH_TIMEOUT_MS = 60_000;
const TRANSCODE_TIMEOUT_MS = 120_000;
const TEARDOWN_TIMEOUT_MS = 60_000;

/** Reject if `work` outlives `ms`, naming the stage so a stall is diagnosable. */
async function bounded<T>(
  stage: string,
  ms: number,
  work: Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${stage} exceeded ${Math.round(ms / 1000)}s`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/**
 * Dev-mode targets hydrate late — and when hydration mismatches, React throws
 * the server DOM away and re-renders from scratch. A click dispatched into
 * that window lands on a detached node and silently does nothing, so the
 * step after it starves. Every navigation waits this long after networkidle
 * before steps run; recordings trim lead-in, so held frames cost nothing.
 */
const HYDRATION_SETTLE_MS = 1_500;

function resolveUrl(baseUrl: string, route: string): string {
  return new URL(route, baseUrl).toString();
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await page.waitForTimeout(HYDRATION_SETTLE_MS);
}

/**
 * The preview's dev server (Vite HMR) occasionally loses the hydration race:
 * React finds a script in <head> it didn't render server-side, bails out of
 * hydrating, and that sometimes escalates to the app's root error boundary
 * instead of recovering client-side. That boundary has no target element at
 * all, so the first wait after a nav legitimately times out — not flakily,
 * the element never arrives. A reload gets a fresh, warm SSR response and
 * almost always hydrates clean the second time, so one retry is cheap
 * insurance against failing a whole render over a dev-server-only quirk.
 */
async function waitVisibleWithHydrationRecovery(
  page: Page,
  selector: string,
  timeoutMs: number
): Promise<void> {
  try {
    await page.locator(selector).first().waitFor({
      state: 'visible',
      timeout: timeoutMs,
    });
  } catch (err) {
    await page.reload({
      waitUntil: 'networkidle',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForTimeout(HYDRATION_SETTLE_MS);
    try {
      await page.locator(selector).first().waitFor({
        state: 'visible',
        timeout: timeoutMs,
      });
    } catch {
      throw err;
    }
  }
}

/**
 * Sign in as a seeded demo persona.
 *
 * Dev login answers with a redirect and the session cookie; only the cookie
 * matters, since every scene navigates for itself. This goes through plain
 * fetch rather than the browser's request context so the worker behaves the
 * same under Bun and Node.
 */
async function login(
  context: BrowserContext,
  baseUrl: string,
  loginPath: string,
  persona: MarketingPersona,
  accessCookies: { name: string; value: string; url: string }[] = []
): Promise<void> {
  const email = personaEmail(persona);
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  // The browser carries the access cookie itself, but this fetch bypasses the
  // browser — and dev-login is behind the gate, so without the cookie here the
  // login is refused before it ever reaches the app.
  if (accessCookies.length > 0) {
    headers.cookie = accessCookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
  const response = await fetch(resolveUrl(baseUrl, loginPath), {
    method: 'POST',
    headers,
    body: new URLSearchParams({ email }).toString(),
    redirect: 'manual',
    // A dev-server target that accepts the connection and never answers would
    // otherwise hang this call — and the whole attempt — indefinitely.
    signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
  });

  if (response.status >= 400) {
    throw new Error(
      `Dev login failed for ${email} (${response.status}). The render target must have local dev auth enabled and seeded demo personas.`
    );
  }

  const cookies = parseSessionCookies(response.headers.getSetCookie(), baseUrl);
  if (cookies.length === 0) {
    throw new Error(`Dev login for ${email} returned no session cookie.`);
  }

  // Replace rather than merge, so switching personas mid-storyboard cannot
  // leave the previous session's cookies attached — but the access cookie is
  // not part of the session and has to survive, or the next navigation lands
  // on the gate instead of the app.
  await context.clearCookies();
  await context.addCookies([...accessCookies, ...cookies]);
}

/**
 * Clip renders glide the mouse to its target before acting, so the enlarged
 * cursor overlay travels visibly instead of teleporting. Stills skip this —
 * nothing is watching between frames.
 */
const GLIDE_STEPS = 16;
const GLIDE_STEP_MS = 28;

async function glideTo(
  page: Page,
  locator: ReturnType<Page['locator']>,
  from: { x: number; y: number }
): Promise<{ x: number; y: number }> {
  await locator
    .scrollIntoViewIfNeeded({ timeout: STEP_TIMEOUT_MS })
    .catch(() => {});
  // A missing target must fail as the step's own click/hover timeout, not as
  // an untimed boundingBox wait — the glide is presentation, so it declines
  // to move rather than owning the failure.
  const box = await locator
    .boundingBox({ timeout: STEP_TIMEOUT_MS })
    .catch(() => null);
  if (!box) return from;
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Timed steps rather than mouse.move's own steps: those dispatch in one
  // burst, which reads as teleporting on camera. ~450ms of travel reads as a
  // hand moving a mouse.
  for (let i = 1; i <= GLIDE_STEPS; i += 1) {
    const t = i / GLIDE_STEPS;
    // ease-in-out
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(
      from.x + (to.x - from.x) * eased,
      from.y + (to.y - from.y) * eased
    );
    await page.waitForTimeout(GLIDE_STEP_MS);
  }
  return to;
}

export type FocusRequest = {
  selector?: string;
  role?: string;
  name?: string;
  text?: string;
  scale?: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** Same targeting rules as a step, so a focus aims the way a click does. */
function locateFocus(page: Page, focus: FocusRequest) {
  if (focus.role) {
    return page
      .getByRole(focus.role as Parameters<Page['getByRole']>[0], {
        name: focus.name ? new RegExp(focus.name, 'i') : undefined,
      })
      .first();
  }
  if (focus.text) return page.getByText(focus.text).first();
  return page.locator(focus.selector as string).first();
}

function locate(
  page: Page,
  step: Extract<StoryboardStep, { action: 'click' }>
) {
  if (step.role) {
    return page
      .getByRole(step.role, {
        name: step.name ? new RegExp(step.name, 'i') : undefined,
      })
      .first();
  }
  if (step.text) return page.getByText(step.text).first();
  return page.locator(step.selector as string).first();
}

async function runStep(
  page: Page,
  step: StoryboardStep,
  ctx: {
    baseUrl: string;
    context: BrowserContext;
    loginPath: string;
    accessCookies: { name: string; value: string; url: string }[];
    cinematic: boolean;
    mouse: { x: number; y: number };
    persona: { current: MarketingPersona };
    shoot: (name: string, fullPage: boolean) => Promise<void>;
  }
): Promise<void> {
  switch (step.action) {
    case 'goto':
      await gotoAndSettle(page, resolveUrl(ctx.baseUrl, step.path));
      break;
    case 'click': {
      const target = locate(page, step);
      if (ctx.cinematic)
        Object.assign(ctx.mouse, await glideTo(page, target, ctx.mouse));
      await target.click({ timeout: STEP_TIMEOUT_MS });
      break;
    }
    case 'hover': {
      const target = locate(page, step as never);
      if (ctx.cinematic)
        Object.assign(ctx.mouse, await glideTo(page, target, ctx.mouse));
      await target.hover({ timeout: STEP_TIMEOUT_MS });
      break;
    }
    case 'scrollTo':
      await locate(page, step as never).scrollIntoViewIfNeeded({
        timeout: STEP_TIMEOUT_MS,
      });
      break;
    case 'waitFor':
      await locate(page, step as never).waitFor({
        state: 'visible',
        timeout: STEP_TIMEOUT_MS,
      });
      break;
    case 'fill':
      await locate(page, step as never).fill(step.value, {
        timeout: STEP_TIMEOUT_MS,
      });
      break;
    case 'type': {
      const field = locate(page, step as never);
      if (ctx.cinematic)
        Object.assign(ctx.mouse, await glideTo(page, field, ctx.mouse));
      await field.click({ timeout: STEP_TIMEOUT_MS });
      // Clicking a rich text editor drops the caret where the click landed;
      // demos almost always want to continue the draft, not interrupt it.
      if (step.at === 'end') await page.keyboard.press('Control+End');
      await field.pressSequentially(step.value, { delay: 45, timeout: 60_000 });
      break;
    }
    case 'press':
      if (step.selector || step.role || step.text) {
        await locate(page, step as never).press(step.key, {
          timeout: STEP_TIMEOUT_MS,
        });
      } else {
        await page.keyboard.press(step.key);
      }
      break;
    case 'scroll':
      await scrollBy(page, step.y, step.seconds);
      break;
    case 'wait':
      await page.waitForTimeout(Math.round(step.seconds * 1000));
      break;
    case 'screenshot':
      await ctx.shoot(step.name, step.fullPage);
      break;
    case 'login':
      // The render begins signed in as the storyboard persona, and generated
      // storyboards keep writing a redundant login step whose `path` then
      // navigates away from the scene's own page — the take dies waiting for
      // elements that are no longer there. A login step means "switch user",
      // so signing in again as the current persona is a no-op.
      if (step.persona === ctx.persona.current) break;
      await login(
        ctx.context,
        ctx.baseUrl,
        ctx.loginPath,
        step.persona,
        ctx.accessCookies
      );
      ctx.persona.current = step.persona;
      await gotoAndSettle(page, resolveUrl(ctx.baseUrl, step.path));
      break;
    default: {
      const exhaustive: never = step;
      throw new Error(`Unsupported step: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Wheel ticks per second while pacing a scroll. Matches capture frame rate
 * closely enough that the movement reads as continuous rather than stepped. */
const SCROLL_TICKS_PER_SECOND = 25;

/**
 * Scroll the page, optionally spreading the movement over `seconds`.
 *
 * Deliberately mouse wheel rather than window.scrollTo: the surfaces worth
 * revealing in a demo — an opened prompt library, a feedback panel, a dialog —
 * are their own scroll containers, and scrolling the window would leave them
 * exactly where they were. The wheel goes to whatever is under the cursor,
 * which the storyboard has already moved onto the thing it is showing.
 */
async function scrollBy(
  page: Page,
  y: number,
  seconds: number
): Promise<void> {
  if (seconds <= 0) {
    await page.mouse.wheel(0, y);
    return;
  }

  const ticks = Math.max(1, Math.round(seconds * SCROLL_TICKS_PER_SECOND));
  const perTick = y / ticks;
  const tickMs = (seconds * 1000) / ticks;

  for (let tick = 0; tick < ticks; tick += 1) {
    await page.mouse.wheel(0, perTick);
    await page.waitForTimeout(tickMs);
  }
}

async function transcode(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  options: { trimStartSeconds?: number } = {}
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      buildTranscodeArgs(inputPath, outputPath, options),
      {
        stdio: ['ignore', 'ignore', 'pipe'],
      }
    );
    let stderr = '';
    // ffmpeg on a truncated or malformed recording can sit forever rather than
    // exiting; kill it instead of letting it consume the attempt.
    const killTimer = setTimeout(() => {
      stderr += `\nffmpeg exceeded ${Math.round(TRANSCODE_TIMEOUT_MS / 1000)}s and was killed.`;
      child.kill('SIGKILL');
    }, TRANSCODE_TIMEOUT_MS);
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('ffmpeg produced no output file');
  }
}

const STILL_FRAME_TIMEOUT_MS = 30_000;
/** Framed stills render at 2x so they stay crisp when scaled into a deck. */
const STILL_FRAME_SCALE = 2;

/**
 * Re-shoot each raw still inside the framing page. The framed image takes the
 * still's place in the output list under its existing name; the raw capture is
 * kept beside it as "<name>-raw.png" for surfaces that want the bare UI.
 *
 * Runs in the same browser as the capture, in its own context sized to the
 * framing canvas. Full-page captures are skipped — their height is unbounded
 * and a browser-window frame around a 6000px scroll reads as a mistake.
 *
 * Only goto, evaluate, and screenshot are used here: waitForFunction and large
 * setContent payloads hang under Bun (see frame-runner.mjs).
 */
async function frameStills(params: {
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  files: RenderedFile[];
  captions: Map<string, string | undefined>;
  viewport: { width: number; height: number };
  addressText: string;
  onWarning: (message: string) => void;
}): Promise<void> {
  const geometry = frameGeometry(params.viewport.width, params.viewport.height);
  const stills = params.files.filter(
    (file) => file.kind === 'IMAGE' && file.height !== undefined
  );
  if (stills.length === 0) return;

  let context: BrowserContext | null = null;
  try {
    context = await bounded(
      'Still framing context',
      STILL_FRAME_TIMEOUT_MS,
      params.browser.newContext({
        viewport: {
          width: geometry.canvasWidth,
          height: geometry.canvasHeight,
        },
        deviceScaleFactor: STILL_FRAME_SCALE,
      })
    );
    const page = await context.newPage();

    for (const still of stills) {
      const rawPath = rawStillFileName(still.path);
      const pageHtmlPath = still.path.replace(/\.png$/, '.frame.html');
      try {
        // The raw capture moves aside first so the framed image can take the
        // plain name the job page, downloads, and tests already use.
        fs.renameSync(still.path, rawPath);
        fs.writeFileSync(
          pageHtmlPath,
          buildStillFramingPage({
            width: params.viewport.width,
            height: params.viewport.height,
            addressText: params.addressText,
            imageSrc: path.basename(rawPath),
            caption: params.captions.get(still.path),
          })
        );
        await bounded(
          'Still framing load',
          STILL_FRAME_TIMEOUT_MS,
          page.goto(`file://${pageHtmlPath}`, { waitUntil: 'load' })
        );
        // `load` covers the image on a static page; confirm it decoded before
        // shooting, polling with evaluate rather than waitForFunction.
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const decoded = await page.evaluate(() => {
            const img = document.getElementById(
              'still'
            ) as HTMLImageElement | null;
            return Boolean(img && img.complete && img.naturalWidth > 0);
          });
          if (decoded) break;
          await page.waitForTimeout(250);
        }
        await bounded(
          'Still framing shot',
          STILL_FRAME_TIMEOUT_MS,
          page.screenshot({ path: still.path, fullPage: false })
        );
        still.width = geometry.canvasWidth * STILL_FRAME_SCALE;
        still.height = geometry.canvasHeight * STILL_FRAME_SCALE;
        params.files.push({
          path: rawPath,
          kind: 'IMAGE',
          label: `${still.label} (raw)`,
          contentType: 'image/png',
          width: params.viewport.width,
          height: params.viewport.height,
        });
      } catch (err) {
        // Put the raw capture back under its own name and move on.
        if (!fs.existsSync(still.path) && fs.existsSync(rawPath)) {
          fs.renameSync(rawPath, still.path);
        }
        params.onWarning(
          `Framing "${still.label}" failed, delivering the raw capture: ${
            err instanceof Error ? err.message.split('\n')[0] : String(err)
          }`
        );
      } finally {
        fs.rmSync(pageHtmlPath, { force: true });
      }
    }
  } catch (err) {
    params.onWarning(
      `Still framing unavailable, delivering raw captures: ${
        err instanceof Error ? err.message.split('\n')[0] : String(err)
      }`
    );
  } finally {
    await context?.close().catch(() => {});
  }
}

/**
 * Film a validated storyboard against a demo environment.
 *
 * Stills are always produced. A CLIP job also records the session and
 * transcodes it to a silent MP4, because a WebM straight out of Playwright will
 * not play on an iPhone and marketing media that only plays on a laptop is not
 * finished.
 */
export async function renderStoryboard(
  params: RenderParams
): Promise<RenderResult> {
  const { storyboard, baseUrl, outDir } = params;
  const loginPath = params.loginPath ?? '/auth/dev-login';
  const wantsVideo = params.kind === 'CLIP';
  const screenshotDir = path.join(outDir, 'screenshots');
  const videoDir = path.join(outDir, 'video');

  fs.mkdirSync(screenshotDir, { recursive: true });
  if (wantsVideo) fs.mkdirSync(videoDir, { recursive: true });

  const files: RenderedFile[] = [];
  const warnings: string[] = [];
  let shotIndex = 0;

  // Chromium intermittently dies at launch on the preview host (a general
  // protection fault before the first page). One render attempt costs minutes
  // of queue time; retrying the launch in-process costs seconds.
  params.onStage?.('launching browser');
  let browser!: Awaited<ReturnType<typeof chromium.launch>>;
  for (let attempt = 1; ; attempt += 1) {
    try {
      browser = await bounded(
        'Browser launch',
        LAUNCH_TIMEOUT_MS,
        chromium.launch({
          headless: true,
          executablePath: params.chromiumPath,
        })
      );
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
    }
  }
  const context = await browser.newContext({
    viewport: storyboard.viewport,
    recordVideo: wantsVideo
      ? { dir: videoDir, size: storyboard.viewport }
      : undefined,
    // Lets page navigations through a basic-auth gate (preview environments).
  });
  // Applies to stills as well as clips — a screenshot carries the badge into
  // a deck just as readily as a video carries it into a feed.
  await context.addInitScript(HIDE_CAPTURE_CHROME_SCRIPT);
  // Headless captures show no cursor; clips get an enlarged one that follows
  // real mouse events, because "click the thing" is the entire content of a
  // short feature clip.
  if (wantsVideo) await context.addInitScript(CURSOR_INIT_SCRIPT);

  const page = await context.newPage();
  const video = page.video();
  const startedAt = Date.now();
  // Everything recorded before the first scene is ready — login, navigation,
  // first paint — is dead footage in a short-form clip, so the transcode cuts
  // it. A small margin keeps the scene's own settle in the take.
  let firstSceneReadyAt: number | null = null;
  // Set by a scene marked startsClip: the navigation before it is filmed but
  // trimmed away, so the clip opens on the screen worth showing.
  let clipOpensAt: number | null = null;
  // When filming stopped, so the delivered clip's length can be reported as
  // its actual length rather than as how long the render took.
  let capturedUntil: number | null = null;
  // When each scene's overlay should be on screen, measured from the start of
  // the recording so it lines up with the raw clip's own currentTime when the
  // framing stage replays it.
  const overlayMarks: { text: string; startMs: number; endMs: number }[] = [];
  // Where the framing stage should push in, in coordinates normalised against
  // the capture viewport so the framing canvas can scale independently.
  const zoomMarks: {
    startMs: number;
    endMs: number;
    x: number;
    y: number;
    scale: number;
  }[] = [];
  // Tracked pointer position so glides start where the last one ended rather
  // than teleporting from the origin.
  const mouse = {
    x: storyboard.viewport.width / 2,
    y: storyboard.viewport.height / 2,
  };
  const persona = { current: storyboard.persona };

  // Captions for the framed stills, by raw file path: the scene's overlay copy
  // when it has some, so a still says the same line the clip would.
  const stillCaptions = new Map<string, string | undefined>();

  const shoot = async (name: string, fullPage: boolean, caption?: string) => {
    shotIndex += 1;
    const filePath = path.join(screenshotDir, shotFileName(shotIndex, name));
    stillCaptions.set(filePath, caption);
    if (wantsVideo)
      await page.evaluate(setCursorVisibilityScript(false)).catch(() => {});
    await page.screenshot({ path: filePath, fullPage });
    if (wantsVideo)
      await page.evaluate(setCursorVisibilityScript(true)).catch(() => {});
    files.push({
      path: filePath,
      kind: 'IMAGE',
      label: name,
      contentType: 'image/png',
      width: storyboard.viewport.width,
      height: fullPage ? undefined : storyboard.viewport.height,
    });
  };

  try {
    // Ahead of anything else: the gate refuses even the dev-login POST, so
    // without this the render fails at its first step on any gated target.
    let accessCookies: { name: string; value: string; url: string }[] = [];
    if (params.accessCode) {
      params.onStage?.('clearing the preview access gate');
      accessCookies = await bounded(
        'Preview access',
        LOGIN_TIMEOUT_MS,
        fetchPreviewAccessCookies(baseUrl, params.accessCode)
      );
      await context.addCookies(accessCookies);
    }

    params.onStage?.(`signing in as ${storyboard.persona}`);
    await login(
      context,
      baseUrl,
      loginPath,
      storyboard.persona,
      accessCookies
    );

    for (const scene of storyboard.scenes as StoryboardScene[]) {
      params.onStage?.(`scene "${scene.id}"`);
      if (scene.goto) {
        await gotoAndSettle(page, resolveUrl(baseUrl, scene.goto));
      }
      if (scene.waitFor) {
        await waitVisibleWithHydrationRecovery(page, scene.waitFor, 20_000);
      }
      if (scene.settle > 0)
        await page.waitForTimeout(Math.round(scene.settle * 1000));
      if (firstSceneReadyAt === null) firstSceneReadyAt = Date.now();
      const sceneStartedAt = Date.now();
      if ((scene as { startsClip?: boolean }).startsClip && !clipOpensAt) {
        clipOpensAt = sceneStartedAt;
      }

      for (const step of scene.steps) {
        try {
          await runStep(page, step, {
            baseUrl,
            context,
            loginPath,
            accessCookies,
            cinematic: wantsVideo,
            mouse,
            persona,
            shoot,
          });
        } catch (err) {
          const optional = (step as { optional?: boolean }).optional === true;
          if (!optional) {
            throw new Error(
              `Scene "${scene.id}" step "${step.action}" failed: ${
                err instanceof Error ? err.message.split('\n')[0] : String(err)
              }`
            );
          }
          const warning = `Scene "${scene.id}": optional ${step.action} skipped`;
          warnings.push(warning);
          params.onWarning?.(warning);
        }
      }

      // Measured after the steps, because the thing worth showing often does
      // not exist until they have run — a menu that opened, a panel that
      // expanded. Zooming for the hold also reads better than zooming through
      // the interaction: the action plays at full width, then it pushes in on
      // the result.
      const focus = (scene as { focus?: FocusRequest }).focus;
      const zoomStartedAt = Date.now();
      if (wantsVideo && focus) {
        const box = await locateFocus(page, focus)
          .boundingBox({ timeout: STEP_TIMEOUT_MS })
          .catch(() => null);
        if (box) {
          zoomMarks.push({
            startMs: zoomStartedAt - startedAt,
            // Filled in once the scene is over; a zoom lasts to the end of it.
            endMs: 0,
            x: clamp01(
              (box.x + box.width / 2) / storyboard.viewport.width
            ),
            y: clamp01(
              (box.y + box.height / 2) / storyboard.viewport.height
            ),
            scale: focus.scale ?? 1.5,
          });
        } else {
          const warning = `Scene "${scene.id}": focus target not found, filmed without the push-in`;
          warnings.push(warning);
          params.onWarning?.(warning);
        }
      }

      if (scene.hold > 0)
        await page.waitForTimeout(Math.round(scene.hold * 1000));
      if (scene.screenshot)
        await shoot(
          scene.id,
          scene.fullPage,
          (scene as { overlay?: string }).overlay
        );

      const pendingZoom = zoomMarks.at(-1);
      if (pendingZoom && pendingZoom.endMs === 0) {
        pendingZoom.endMs = Date.now() - startedAt;
      }

      const overlay = (scene as { overlay?: string }).overlay;
      if (overlay) {
        overlayMarks.push({
          text: overlay,
          startMs: sceneStartedAt - startedAt,
          endMs: Date.now() - startedAt,
        });
      }
    }

    capturedUntil = Date.now();

    // Framed stills. Presentation, not content: a capture that succeeded is
    // never lost to a framing problem — the raw still stays in the output
    // list and a warning says why it stands alone.
    if ((params.frameStyle ?? 'window') === 'window') {
      params.onStage?.('framing the stills');
      await frameStills({
        browser,
        files,
        captions: stillCaptions,
        viewport: storyboard.viewport,
        addressText: params.addressText ?? 'app.yawp.school',
        onWarning: (message) => {
          warnings.push(message);
          params.onWarning?.(message);
        },
      });
    }
  } finally {
    // Closing the context is what finalizes the recording, and it can wedge on
    // a browser that is already unhealthy. Bound it, and close the browser
    // either way so the attempt does not die holding a chromium process.
    await bounded(
      'Recording teardown',
      TEARDOWN_TIMEOUT_MS,
      context.close()
    ).catch(() => {});
    await bounded('Browser close', TEARDOWN_TIMEOUT_MS, browser.close()).catch(
      () => {}
    );
  }

  if (wantsVideo && video) {
    params.onStage?.('saving the recording');
    const recorded = await video.path();
    if (!fs.existsSync(recorded)) throw missingRecordingError(recorded);
    const mp4Path = path.join(videoDir, `${storyboard.slug}.mp4`);
    // A scene that declared itself the opening shot wins over the default of
    // "first scene ready"; no margin there, because the point is to land on
    // that screen rather than catch the navigation that reached it.
    const rawTrimSeconds = clipOpensAt
      ? Math.max(0, (clipOpensAt - startedAt) / 1000)
      : firstSceneReadyAt
        ? Math.max(0, (firstSceneReadyAt - startedAt) / 1000 - 0.4)
        : 0;

    const frameStyle = params.frameStyle ?? 'window';
    let outputWidth = storyboard.viewport.width;
    let outputHeight = storyboard.viewport.height;

    // Framing is presentation, not content. A capture that succeeded must not
    // be thrown away because the decorative re-shoot stalled or crashed —
    // shipping the unframed clip beats failing the render and retrying the
    // whole thing.
    let framed: Awaited<ReturnType<typeof frameClip>> | null = null;
    if (frameStyle === 'window') {
      params.onStage?.('framing the clip');
      try {
        framed = await frameClip({
          rawVideoPath: recorded,
          outDir,
          width: storyboard.viewport.width,
          height: storyboard.viewport.height,
          chromiumPath: params.chromiumPath,
          overlays: overlayMarks,
          zooms: zoomMarks.filter((mark) => mark.endMs > mark.startMs),
        });
      } catch (err) {
        const warning = `Framing failed, delivering the unframed capture: ${
          err instanceof Error ? err.message.split('\n')[0] : String(err)
        }`;
        warnings.push(warning);
        params.onWarning?.(warning);
      }
    }

    if (framed) {
      // The framed recording plays the raw capture from its very start, so the
      // raw lead-in and the framing page's own setup are consecutive dead
      // footage; one trim removes both.
      await transcode(
        params.ffmpegPath ?? 'ffmpeg',
        framed.videoPath,
        mp4Path,
        {
          trimStartSeconds: framed.leadInSeconds + rawTrimSeconds,
        }
      );
      fs.rmSync(framed.videoPath, { force: true });
      const geometry = frameGeometry(
        storyboard.viewport.width,
        storyboard.viewport.height
      );
      outputWidth = geometry.canvasWidth;
      outputHeight = geometry.canvasHeight;
    } else {
      await transcode(params.ffmpegPath ?? 'ffmpeg', recorded, mp4Path, {
        trimStartSeconds: rawTrimSeconds,
      });
    }
    fs.rmSync(recorded, { force: true });
    files.push({
      path: mp4Path,
      kind: 'VIDEO',
      label: storyboard.title,
      contentType: 'video/mp4',
      width: outputWidth,
      height: outputHeight,
      // The length of the clip a viewer receives: what was filmed, less the
      // lead-in the transcode trims off the front. This used to report
      // `Date.now() - startedAt`, which is how long the render took — a
      // number that never moved when the trim changed, and read as a clip
      // duration everywhere it was shown.
      durationMs: Math.max(
        0,
        (capturedUntil ?? Date.now()) -
          startedAt -
          Math.round(rawTrimSeconds * 1000)
      ),
    });
  }

  return { files, warnings };
}
