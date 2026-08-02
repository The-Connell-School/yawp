import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Short-form marketing framing: the captured clip re-shot inside a styled
 * scene — vivid gradient backdrop, browser-window chrome with rounded corners
 * and a deep shadow — the way product clips are cut for a feed.
 *
 * The composite is done by the browser itself: a framing page plays the raw
 * capture inside the window chrome while a second recording films it. CSS does
 * the gradient, rounding, and shadow, which keeps ffmpeg out of the
 * mask-compositing business entirely.
 */

export type FrameOptions = {
  rawVideoPath: string;
  outDir: string;
  /** Capture viewport, used to size the window and canvas. */
  width: number;
  height: number;
  /** Text shown in the window's address pill. */
  addressText?: string;
  chromiumPath?: string;
};

export type FramedResult = {
  videoPath: string;
  /** Seconds of recording before playback started; dead footage for the trim. */
  leadInSeconds: number;
};

/** Canvas leaves margin for the backdrop; the window fills ~82% of the width. */
export function frameGeometry(width: number, height: number) {
  const windowWidth = Math.round(width * 0.82);
  const videoHeight = Math.round((windowWidth / width) * height);
  const barHeight = 44;
  const canvasWidth = width;
  const canvasHeight = Math.round(videoHeight + barHeight + height * 0.16);
  return { canvasWidth, canvasHeight, windowWidth, videoHeight, barHeight };
}

export function buildFramingPage(options: {
  width: number;
  height: number;
  addressText: string;
  videoSrc: string;
}): string {
  const { canvasWidth, canvasHeight, windowWidth, barHeight } = frameGeometry(
    options.width,
    options.height
  );

  return `<!doctype html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${canvasWidth}px; height: ${canvasHeight}px; overflow: hidden; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(125deg,
      #ff9ecd 0%, #f95f9b 22%, #a855f7 48%, #38bdf8 74%, #fde047 100%);
  }
  .window {
    width: ${windowWidth}px;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 34px 70px rgba(20, 10, 40, 0.45);
  }
  .bar {
    height: ${barHeight}px;
    background: #f5f1ec;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 8px;
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .address {
    flex: 1;
    margin: 0 60px;
    height: 26px;
    border-radius: 13px;
    background: #ffffff;
    color: #6b6560;
    font: 500 13px/26px -apple-system, 'Segoe UI', sans-serif;
    text-align: center;
    overflow: hidden;
  }
  video { display: block; width: 100%; }
</style>
</head>
<body>
  <div class="window">
    <div class="bar">
      <div class="dot" style="background:#ff5f57"></div>
      <div class="dot" style="background:#febc2e"></div>
      <div class="dot" style="background:#28c840"></div>
      <div class="address">${options.addressText}</div>
    </div>
    <video id="clip" src="${options.videoSrc}" muted playsinline preload="auto"></video>
  </div>
</body>
</html>`;
}

/**
 * Re-shoot the raw capture inside the framing page. Returns the framed WebM
 * and how much lead-in (page setup before playback began) the transcode
 * should cut.
 */
export async function frameClip(options: FrameOptions): Promise<FramedResult> {
  const geometry = frameGeometry(options.width, options.height);
  const raw = fs.readFileSync(options.rawVideoPath);
  const videoSrc = `data:video/webm;base64,${raw.toString('base64')}`;

  const framedDir = path.join(options.outDir, 'framed');
  fs.mkdirSync(framedDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: options.chromiumPath,
  });
  const context = await browser.newContext({
    viewport: { width: geometry.canvasWidth, height: geometry.canvasHeight },
    recordVideo: {
      dir: framedDir,
      size: { width: geometry.canvasWidth, height: geometry.canvasHeight },
    },
  });

  const startedAt = Date.now();
  const page = await context.newPage();
  const video = page.video();

  // Polling with evaluate instead of waitForFunction: the worker runs under
  // Bun, where Playwright's waitForFunction never resolves. evaluate is
  // reliable under both runtimes.
  const poll = async (
    expression: string,
    what: string,
    timeoutMs: number
  ): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const errorText = (await page.evaluate(
        "(() => { const clip = document.getElementById('clip'); return clip && clip.error ? String(clip.error.code) + ': playback error' : null })()"
      )) as string | null;
      if (errorText) throw new Error(`Framing playback failed (${errorText})`);
      if (await page.evaluate(expression)) return;
      if (Date.now() > deadline) {
        throw new Error(`Framing timed out waiting for ${what}`);
      }
      await page.waitForTimeout(200);
    }
  };

  let playbackStartedAt = startedAt;
  try {
    await page.setContent(
      buildFramingPage({
        width: options.width,
        height: options.height,
        addressText: options.addressText ?? 'app.yawp.school',
        videoSrc,
      }),
      { waitUntil: 'load' }
    );
    await poll(
      "document.getElementById('clip').readyState >= 3",
      'the clip to decode',
      30_000
    );
    playbackStartedAt = Date.now();
    // A Playwright recording is a WebM whose duration metadata is unreliable,
    // so 'ended' cannot be trusted alone. Progress-stall detection covers both
    // cases: once currentTime stops advancing after having moved, the clip is
    // over.
    await page.evaluate(`(() => {
      const clip = document.getElementById('clip');
      window.__clipLastTime = -1;
      window.__clipStalledTicks = 0;
      setInterval(() => {
        if (clip.currentTime === window.__clipLastTime) {
          window.__clipStalledTicks += 1;
        } else {
          window.__clipStalledTicks = 0;
          window.__clipLastTime = clip.currentTime;
        }
      }, 200);
      clip.play().catch(() => {});
    })()`);
    await poll(
      "document.getElementById('clip').currentTime > 0",
      'playback to start',
      15_000
    );
    await poll(
      "document.getElementById('clip').ended || window.__clipStalledTicks >= 5",
      'playback to finish',
      // Bounded by the schema's render cap, plus slack for decode stalls.
      5 * 60_000
    );
    // Let the final frame land in the recording before tearing down.
    await page.waitForTimeout(300);
  } finally {
    await context.close();
    await browser.close();
  }

  const recordedPath = await video?.path();
  if (!recordedPath) throw new Error('Framing produced no recording');

  return {
    videoPath: recordedPath,
    leadInSeconds: Math.max(0, (playbackStartedAt - startedAt) / 1000 - 0.1),
  };
}
