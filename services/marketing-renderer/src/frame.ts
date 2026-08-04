import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  /** Hard ceiling on the whole framing stage; it must fit inside one attempt. */
  timeoutMs?: number;
};

/**
 * Framing re-plays the capture in real time, so it needs the clip's own
 * length plus decode slack — not the worker's entire attempt budget.
 */
export const FRAMING_TIMEOUT_MS = 150_000;

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

  const framedDir = path.join(options.outDir, 'framed');
  fs.mkdirSync(framedDir, { recursive: true });

  const pageHtml = buildFramingPage({
    width: options.width,
    height: options.height,
    addressText: options.addressText ?? 'app.yawp.school',
    videoSrc: 'clip.webm',
  });

  // The framing stage runs under Node rather than the worker's own runtime:
  // several Playwright CDP paths hang under Bun, and the worker image ships
  // Node anyway. The runner is plain JS and reports its result on stdout.
  const runnerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'frame-runner.mjs'
  );
  const timeoutMs = options.timeoutMs ?? FRAMING_TIMEOUT_MS;
  const config = JSON.stringify({
    rawVideoPath: options.rawVideoPath,
    framedDir,
    pageHtml,
    canvasWidth: geometry.canvasWidth,
    canvasHeight: geometry.canvasHeight,
    chromiumPath: options.chromiumPath ?? null,
    // Leave the outer kill below as the backstop, not the first line of
    // defence: the runner should give up on its own and exit cleanly.
    playbackTimeoutMs: Math.max(30_000, timeoutMs - 30_000),
  });

  const result = await new Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
  }>((resolve, reject) => {
    const child = spawn('node', [runnerPath, config], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    // A framing browser that wedges must not hold the worker past its attempt
    // deadline; kill it and let the caller fall back to the raw capture.
    const killTimer = setTimeout(() => {
      stderr += `\nFraming exceeded ${Math.round(timeoutMs / 1000)}s and was killed.`;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ stdout, stderr, code });
    });
  });

  if (result.code !== 0) {
    throw new Error(
      `Framing failed (exit ${result.code}): ${result.stderr.slice(-1500) || result.stdout.slice(-500)}`
    );
  }

  const lastLine = result.stdout.trim().split('\n').at(-1) ?? '';
  let parsed: FramedResult;
  try {
    parsed = JSON.parse(lastLine) as FramedResult;
  } catch {
    throw new Error(
      `Framing runner returned no result: ${result.stdout.slice(-500)}`
    );
  }
  if (!parsed.videoPath || !fs.existsSync(parsed.videoPath)) {
    throw new Error('Framing produced no recording');
  }
  return parsed;
}
