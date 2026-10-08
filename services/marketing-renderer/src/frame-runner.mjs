// Framing stage, executed by Node.
//
// The worker runs under Bun, where several Playwright CDP paths (request,
// waitForFunction, large setContent payloads) hang indefinitely. Rather than
// dodging them one at a time, the framing stage runs in this plain-JS script
// under Node — present in the worker image because Playwright's base image
// ships it — spawned by frame.ts. stdout carries a single JSON result line.
//
// Usage: node frame-runner.mjs <configJson>
//   config: { rawVideoPath, framedDir, pageHtml, canvasWidth, canvasHeight, chromiumPath? }

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const config = JSON.parse(process.argv[2]);

const clipPath = path.join(config.framedDir, 'clip.webm');
fs.copyFileSync(config.rawVideoPath, clipPath);
const pagePath = path.join(config.framedDir, 'frame.html');
fs.writeFileSync(pagePath, config.pageHtml);

const browser = await chromium.launch({
  headless: true,
  executablePath: config.chromiumPath || undefined,
});
const context = await browser.newContext({
  viewport: { width: config.canvasWidth, height: config.canvasHeight },
  recordVideo: {
    dir: config.framedDir,
    size: { width: config.canvasWidth, height: config.canvasHeight },
  },
});

const startedAt = Date.now();
const page = await context.newPage();
const video = page.video();

let playbackStartedAt = startedAt;
try {
  await page.goto(`file://${pagePath}`, { waitUntil: 'load' });
  await page.waitForFunction(
    "document.getElementById('clip').readyState >= 3",
    undefined,
    { timeout: 30_000 }
  );

  playbackStartedAt = Date.now();
  // Playwright recordings carry unreliable duration metadata, so 'ended'
  // cannot be trusted alone; currentTime stalling after progress covers both.
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
  await page.waitForFunction(
    "document.getElementById('clip').error !== null || document.getElementById('clip').currentTime > 0",
    undefined,
    { timeout: 15_000 }
  );
  const playbackError = await page.evaluate(
    "(() => { const clip = document.getElementById('clip'); return clip.error ? String(clip.error.code) : null })()"
  );
  if (playbackError)
    throw new Error(`Framing playback failed (code ${playbackError})`);
  await page.waitForFunction(
    "document.getElementById('clip').ended || window.__clipStalledTicks >= 5",
    undefined,
    // Playback is real-time, so this only needs to cover the clip itself plus
    // decode slack. It used to allow five minutes, which on its own could
    // outlast the worker's whole attempt deadline — the render was abandoned
    // and retried while a finished capture sat here waiting on decoration.
    { timeout: Number(config.playbackTimeoutMs) || 120_000 }
  );
  // Let the final frame land in the recording before tearing down.
  await page.waitForTimeout(300);
} finally {
  await context.close();
  await browser.close();
}

fs.rmSync(clipPath, { force: true });
fs.rmSync(pagePath, { force: true });

const recordedPath = await video?.path();
if (!recordedPath) throw new Error('Framing produced no recording');

process.stdout.write(
  `${JSON.stringify({
    videoPath: recordedPath,
    leadInSeconds: Math.max(0, (playbackStartedAt - startedAt) / 1000 - 0.1),
  })}\n`
);
