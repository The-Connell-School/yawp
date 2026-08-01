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
    case 'click':
      await locate(page, step).click({ timeout: STEP_TIMEOUT_MS });
      break;
    case 'hover':
      await locate(page, step as never).hover({ timeout: STEP_TIMEOUT_MS });
      break;
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
  outputPath: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, buildTranscodeArgs(inputPath, outputPath), {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
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

  const shoot = async (name: string, fullPage: boolean) => {
    shotIndex += 1;
    const filePath = path.join(screenshotDir, shotFileName(shotIndex, name));
    await page.screenshot({ path: filePath, fullPage });
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

      for (const step of scene.steps) {
        try {
          await runStep(page, step, {
            baseUrl,
            context,
            loginPath,
            basicAuth: params.basicAuth,
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
    await transcode(params.ffmpegPath ?? 'ffmpeg', recorded, mp4Path);
    fs.rmSync(recorded, { force: true });
    files.push({
      path: mp4Path,
      kind: 'VIDEO',
      label: storyboard.title,
      contentType: 'video/mp4',
      width: storyboard.viewport.width,
      height: storyboard.viewport.height,
      durationMs: Date.now() - startedAt,
    });
  }

  return { files, warnings };
}
