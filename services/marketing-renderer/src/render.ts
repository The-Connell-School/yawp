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
import { frameClip, frameGeometry } from './frame';
import { buildTranscodeArgs, shotFileName } from './jobs';
import { parseSessionCookies, personaEmail } from './session';

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
  /** Credential for a target behind a basic-auth gate, e.g. a preview environment. */
  basicAuth?: { username: string; password: string };
  /** Clip presentation. 'window' (default) re-shoots the capture inside a gradient + browser-chrome scene. */
  frameStyle?: 'window' | 'none';
  /** Scenes whose optional steps failed, reported back for the job record. */
  onWarning?: (message: string) => void;
};

export type RenderResult = {
  files: RenderedFile[];
  warnings: string[];
};

const NAVIGATION_TIMEOUT_MS = 45_000;
const STEP_TIMEOUT_MS = 15_000;

function resolveUrl(baseUrl: string, route: string): string {
  return new URL(route, baseUrl).toString();
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
  basicAuth?: { username: string; password: string }
): Promise<void> {
  const email = personaEmail(persona);
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  // The browser context sends its own httpCredentials, but this fetch bypasses
  // the browser, so a gated target needs the header here too.
  if (basicAuth) {
    headers.authorization = `Basic ${Buffer.from(
      `${basicAuth.username}:${basicAuth.password}`
    ).toString('base64')}`;
  }
  const response = await fetch(resolveUrl(baseUrl, loginPath), {
    method: 'POST',
    headers,
    body: new URLSearchParams({ email }).toString(),
    redirect: 'manual',
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
  // leave the previous session's cookies attached.
  await context.clearCookies();
  await context.addCookies(cookies);
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
  const box = await locator.boundingBox();
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
    basicAuth?: { username: string; password: string };
    cinematic: boolean;
    mouse: { x: number; y: number };
    shoot: (name: string, fullPage: boolean) => Promise<void>;
  }
): Promise<void> {
  switch (step.action) {
    case 'goto':
      await page.goto(resolveUrl(ctx.baseUrl, step.path), {
        waitUntil: 'networkidle',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
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
      await page.mouse.wheel(0, step.y);
      break;
    case 'wait':
      await page.waitForTimeout(Math.round(step.seconds * 1000));
      break;
    case 'screenshot':
      await ctx.shoot(step.name, step.fullPage);
      break;
    case 'login':
      await login(
        ctx.context,
        ctx.baseUrl,
        ctx.loginPath,
        step.persona,
        ctx.basicAuth
      );
      await page.goto(resolveUrl(ctx.baseUrl, step.path), {
        waitUntil: 'networkidle',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      break;
    default: {
      const exhaustive: never = step;
      throw new Error(`Unsupported step: ${JSON.stringify(exhaustive)}`);
    }
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
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('ffmpeg produced no output file');
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

  const browser = await chromium.launch({
    headless: true,
    executablePath: params.chromiumPath,
  });
  const context = await browser.newContext({
    viewport: storyboard.viewport,
    recordVideo: wantsVideo
      ? { dir: videoDir, size: storyboard.viewport }
      : undefined,
  });

  const page = await context.newPage();
  const video = page.video();
  const startedAt = Date.now();
  // Everything recorded before the first scene is ready — login, navigation,
  // first paint — is dead footage in a short-form clip, so the transcode cuts
  // it. A small margin keeps the scene's own settle in the take.
  let firstSceneReadyAt: number | null = null;
  // Tracked pointer position so glides start where the last one ended rather
  // than teleporting from the origin.
  const mouse = {
    x: storyboard.viewport.width / 2,
    y: storyboard.viewport.height / 2,
  };

  const shoot = async (name: string, fullPage: boolean) => {
    shotIndex += 1;
    const filePath = path.join(screenshotDir, shotFileName(shotIndex, name));
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
    await login(
      context,
      baseUrl,
      loginPath,
      storyboard.persona,
      params.basicAuth
    );

    for (const scene of storyboard.scenes as StoryboardScene[]) {
      if (scene.goto) {
        await page.goto(resolveUrl(baseUrl, scene.goto), {
          waitUntil: 'networkidle',
          timeout: NAVIGATION_TIMEOUT_MS,
        });
      }
      if (scene.waitFor) {
        await page
          .locator(scene.waitFor)
          .first()
          .waitFor({ state: 'visible', timeout: 20_000 });
      }
      if (scene.settle > 0)
        await page.waitForTimeout(Math.round(scene.settle * 1000));
      if (firstSceneReadyAt === null) firstSceneReadyAt = Date.now();

      for (const step of scene.steps) {
        try {
          await runStep(page, step, {
            baseUrl,
            context,
            loginPath,
            basicAuth: params.basicAuth,
            cinematic: wantsVideo,
            mouse,
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

      if (scene.hold > 0)
        await page.waitForTimeout(Math.round(scene.hold * 1000));
      if (scene.screenshot) await shoot(scene.id, scene.fullPage);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (wantsVideo && video) {
    const recorded = await video.path();
    const mp4Path = path.join(videoDir, `${storyboard.slug}.mp4`);
    const rawTrimSeconds = firstSceneReadyAt
      ? Math.max(0, (firstSceneReadyAt - startedAt) / 1000 - 0.4)
      : 0;

    const frameStyle = params.frameStyle ?? 'window';
    let outputWidth = storyboard.viewport.width;
    let outputHeight = storyboard.viewport.height;

    if (frameStyle === 'window') {
      // The framed recording plays the raw capture from its very start, so the
      // raw lead-in and the framing page's own setup are consecutive dead
      // footage; one trim removes both.
      const framed = await frameClip({
        rawVideoPath: recorded,
        outDir,
        width: storyboard.viewport.width,
        height: storyboard.viewport.height,
        chromiumPath: params.chromiumPath,
      });
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
      durationMs: Date.now() - startedAt,
    });
  }

  return { files, warnings };
}
