/**
 * Drives a demo script end to end: browser, overlay, recording, encode.
 *
 * The shape of a finished video is fixed here rather than left to each script,
 * so every demo opens and closes the same way and they look like a set when
 * you post three of them in a row.
 */

import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BEATS, FRAME, THEME } from '../theme';
import { encodeToMp4 } from './encode';
import { installOverlay, type CardContent } from './overlay';
import { Stage } from './stage';

export type DemoDefinition = {
  /** Slug; becomes the output filename. */
  name: string;
  /** Small label above the title, e.g. "New in Yawp". */
  kicker?: string;
  title: string;
  subtitle?: string;
  /** Closing card. Defaults to the opening title with no subtitle. */
  endCard?: CardContent;
  /**
   * Sign in and navigate to the starting screen.
   *
   * Runs behind the title card, so nothing here appears in the finished
   * video and it does not need to look good — only to land on the right page.
   */
  setup?: (stage: Stage) => Promise<void>;
  /** The demo itself. Everything here is on camera. */
  run: (stage: Stage) => Promise<void>;
  /**
   * Serve this demo's own page instead of pointing at the dev server.
   *
   * Only the self-test uses this. Real feature demos should run against the
   * actual app — a demo of a mock is a demo of nothing.
   */
  fixtureServer?: () => Promise<{ url: string; close: () => Promise<void> }>;
};

/** Identity helper that gives demo scripts type inference and autocomplete. */
export function defineDemo(definition: DemoDefinition): DemoDefinition {
  return definition;
}

export type RecordOptions = {
  baseUrl: string;
  outDir: string;
  headed?: boolean;
  /** Keep the intermediate .webm next to the .mp4, for debugging. */
  keepRaw?: boolean;
  /** Speed multiplier for pauses. >1 records faster, for iterating on a script. */
  rate?: number;
};

export type RecordResult = {
  outputPath: string;
  durationMs: number;
};

export async function recordDemo(
  definition: DemoDefinition,
  options: RecordOptions
): Promise<RecordResult> {
  const rawDir = await mkdtemp(path.join(tmpdir(), 'yawp-demo-'));
  await mkdir(options.outDir, { recursive: true });

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    browser = await chromium.launch({
      headless: !options.headed,
      // Containers often ship one pinned Chromium that does not match the
      // build this Playwright version wants to download. Point at it with
      // DEMO_CHROMIUM_PATH rather than fetching a second browser.
      executablePath: process.env.DEMO_CHROMIUM_PATH || undefined,
    });

    context = await browser.newContext({
      baseURL: options.baseUrl,
      viewport: { width: FRAME.width, height: FRAME.height },
      // Capture at 2x and let the encoder downscale; text stays crisp.
      deviceScaleFactor: FRAME.deviceScaleFactor,
      recordVideo: {
        dir: rawDir,
        size: { width: FRAME.width, height: FRAME.height },
      },
      // A demo should never show a cookie banner or an "update available"
      // toast triggered by a stale service worker.
      serviceWorkers: 'block',
      reducedMotion: 'no-preference',
      colorScheme: 'light',
    });

    await context.addInitScript(installOverlay, {
      theme: THEME,
      fadeMs: BEATS.fade,
    });

    const page = await context.newPage();
    const recordingStartedAt = Date.now();
    const stage = new Stage(page);

    // Land somewhere on-origin so the overlay has a document to attach to,
    // then raise the curtain before any of the setup is visible.
    await page.goto('/');
    await stage.showCard(titleCardOf(definition), 0);

    await definition.setup?.(stage);

    // Everything before this instant is setup behind the curtain, and gets
    // cut. Backing off slightly guarantees the trim lands inside the title
    // card hold rather than a frame past it.
    const trimStartMs = Math.max(0, Date.now() - recordingStartedAt - 200);

    await page.waitForTimeout(scaled(BEATS.titleCard, options.rate));
    await stage.hideCard();

    await definition.run(stage);

    await stage.hush();
    await stage.clearHighlight();
    await stage.showCard(
      definition.endCard ?? {
        kicker: definition.kicker,
        title: definition.title,
      },
      scaled(BEATS.endCard, options.rate)
    );

    const video = page.video();
    if (!video) {
      throw new Error('Playwright produced no video for this recording');
    }

    // Video is only flushed to disk once the context closes.
    await context.close();
    context = undefined;
    const rawPath = await video.path();

    const outputPath = path.join(options.outDir, `${definition.name}.mp4`);
    await encodeToMp4({
      input: rawPath,
      output: outputPath,
      trimStartMs,
      width: FRAME.width,
      height: FRAME.height,
      fps: FRAME.fps,
      crf: FRAME.crf,
    });

    if (options.keepRaw) {
      await Bun.write(
        path.join(options.outDir, `${definition.name}.webm`),
        Bun.file(rawPath)
      );
    }

    return {
      outputPath,
      durationMs: Date.now() - recordingStartedAt - trimStartMs,
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await rm(rawDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function titleCardOf(definition: DemoDefinition): CardContent {
  return {
    kicker: definition.kicker,
    title: definition.title,
    subtitle: definition.subtitle,
  };
}

function scaled(ms: number, rate: number | undefined): number {
  return Math.round(ms / Math.max(rate ?? 1, 0.1));
}
