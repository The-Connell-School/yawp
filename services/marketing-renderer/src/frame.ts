import { spawn } from 'node:child_process';
import type { MarketingBackdrop } from '@app/marketing-media';
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
  /**
   * On-screen copy, timed against the raw clip's own playback position. The
   * framing stage is the only place this can happen: it replays the capture
   * in a browser, so the overlay is composited by CSS rather than burned in
   * by a filter chain.
   */
  overlays?: OverlayMark[];
  /** Timed push-ins, positioned in normalised capture coordinates. */
  zooms?: ZoomMark[];
  /** The ground the capture is re-shot on. Defaults to the gradient. */
  backdrop?: MarketingBackdrop;
};

export type OverlayMark = {
  text: string;
  startMs: number;
  endMs: number;
};

export type ZoomMark = {
  startMs: number;
  endMs: number;
  /** 0..1 across the captured viewport. */
  x: number;
  y: number;
  scale: number;
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

/**
 * Canvas leaves margin for the backdrop; the window fills ~82% of the width.
 * The 'none' backdrop has neither: it delivers the capture at its own size,
 * with no chrome, for embedding somewhere that supplies its own frame.
 */
export function frameGeometry(
  width: number,
  height: number,
  backdrop: MarketingBackdrop = 'gradient'
) {
  if (backdrop === 'none') {
    return {
      canvasWidth: width,
      canvasHeight: height,
      windowWidth: width,
      videoHeight: height,
      barHeight: 0,
    };
  }
  const windowWidth = Math.round(width * 0.82);
  const videoHeight = Math.round((windowWidth / width) * height);
  const barHeight = 44;
  const canvasWidth = width;
  const canvasHeight = Math.round(videoHeight + barHeight + height * 0.16);
  return { canvasWidth, canvasHeight, windowWidth, videoHeight, barHeight };
}

/**
 * The ground a framed capture sits on. Shared by stills and clips so the two
 * come out of one storyboard looking like one set.
 */
const BACKDROP_GROUNDS: Record<MarketingBackdrop, string> = {
  gradient:
    'linear-gradient(125deg, #ff9ecd 0%, #f95f9b 22%, #a855f7 48%, #38bdf8 74%, #fde047 100%)',
  slate: '#0f172a',
  // The app's own warm off-white, so a still sits on the brand ground.
  paper: '#f5f1ec',
  none: 'transparent',
};

/** A lighter ground needs a lighter shadow, or the window looks pasted on. */
const BACKDROP_SHADOWS: Record<MarketingBackdrop, string> = {
  gradient: '0 34px 70px rgba(20, 10, 40, 0.45)',
  slate: '0 34px 70px rgba(0, 0, 0, 0.55)',
  paper: '0 24px 50px rgba(60, 50, 40, 0.18)',
  none: 'none',
};

/** Shared CSS for the window chrome, so stills and clips frame identically. */
function framingStyles(options: {
  backdrop: MarketingBackdrop;
  canvasWidth: number;
  canvasHeight: number;
  windowWidth: number;
  barHeight: number;
}): string {
  const bare = options.backdrop === 'none';
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${options.canvasWidth}px; height: ${options.canvasHeight}px; overflow: hidden; }
  body {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${BACKDROP_GROUNDS[options.backdrop]};
  }
  .window {
    width: ${options.windowWidth}px;
    ${bare ? '' : 'border-radius: 14px;'}
    overflow: hidden;
    box-shadow: ${BACKDROP_SHADOWS[options.backdrop]};
  }
  .bar {
    height: ${options.barHeight}px;
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
  .overlay {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: ${Math.round(options.canvasHeight * 0.045)}px;
    max-width: ${Math.round(options.canvasWidth * 0.8)}px;
    padding: 14px 26px;
    border-radius: 999px;
    background: rgba(17, 12, 28, 0.82);
    color: #fff;
    font: 600 ${Math.round(options.canvasWidth * 0.022)}px/1.3 -apple-system, 'Segoe UI', sans-serif;
    text-align: center;
    letter-spacing: -0.01em;
  }`;
}

/** The window chrome bar, omitted entirely for the bare backdrop. */
function windowBar(backdrop: MarketingBackdrop, addressText: string): string {
  if (backdrop === 'none') return '';
  return `    <div class="bar">
      <div class="dot" style="background:#ff5f57"></div>
      <div class="dot" style="background:#febc2e"></div>
      <div class="dot" style="background:#28c840"></div>
      <div class="address">${escapeHtml(addressText)}</div>
    </div>
`;
}

/** Keeps storyboard copy from closing the framing page's own markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFramingPage(options: {
  width: number;
  height: number;
  addressText: string;
  videoSrc: string;
  overlays?: OverlayMark[];
  zooms?: ZoomMark[];
  backdrop?: MarketingBackdrop;
}): string {
  const backdrop = options.backdrop ?? 'gradient';
  const geometry = frameGeometry(options.width, options.height, backdrop);
  const { canvasWidth, canvasHeight, windowWidth, barHeight } = geometry;

  return `<!doctype html>
<html>
<head>
<style>${framingStyles({ backdrop, canvasWidth, canvasHeight, windowWidth, barHeight })}
  video {
    display: block;
    width: 100%;
    /* Slow enough to read as a camera move rather than a jump cut. */
    transition: transform 700ms cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: 50% 50%;
    will-change: transform;
  }
  .overlay { opacity: 0; transition: opacity 220ms ease; }
  .overlay.on { opacity: 1; }
</style>
</head>
<body>
  <div class="window">
${windowBar(backdrop, options.addressText)}    <video id="clip" src="${options.videoSrc}" muted playsinline preload="auto"></video>
  </div>
  <div class="overlay" id="overlay"></div>
  <script>
    // Keyed off the clip's own playback position rather than wall-clock, so a
    // decode stall slides the copy with the picture instead of desyncing it.
    window.__overlays = ${JSON.stringify(
      (options.overlays ?? []).map((mark) => ({
        text: escapeHtml(mark.text),
        startMs: mark.startMs,
        endMs: mark.endMs,
      }))
    )};
    window.__zooms = ${JSON.stringify(options.zooms ?? [])};
    (() => {
      const clip = document.getElementById('clip');
      const box = document.getElementById('overlay');
      const marks = window.__overlays || [];
      const zooms = window.__zooms || [];
      if (!marks.length && !zooms.length) return;
      let shown = null;
      let zoomed = null;
      setInterval(() => {
        const ms = clip.currentTime * 1000;

        const hit = marks.find((m) => ms >= m.startMs && ms < m.endMs);
        const next = hit ? hit.text : null;
        if (next !== shown) {
          shown = next;
          if (next) {
            box.innerHTML = next;
            box.classList.add('on');
          } else {
            box.classList.remove('on');
          }
        }

        const zoom = zooms.find((z) => ms >= z.startMs && ms < z.endMs);
        const key = zoom ? z_key(zoom) : null;
        if (key !== zoomed) {
          zoomed = key;
          if (zoom) {
            // Origin as a percentage of the element, so the point of interest
            // stays put while everything else grows away from it.
            clip.style.transformOrigin =
              (zoom.x * 100).toFixed(2) + '% ' + (zoom.y * 100).toFixed(2) + '%';
            clip.style.transform = 'scale(' + zoom.scale + ')';
          } else {
            clip.style.transform = 'scale(1)';
          }
        }
      }, 100);

      function z_key(z) {
        return z.startMs + ':' + z.scale + ':' + z.x + ':' + z.y;
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * The still counterpart of the clip framing page: one capture placed inside
 * the same window chrome on the same gradient, with the scene's overlay copy
 * shown as a caption. A still has no timeline, so the copy is simply on.
 *
 * Loaded from disk beside the capture rather than inlined: a page carrying a
 * megabyte of base64 is exactly the kind of setContent payload that hangs
 * under Bun, while goto + screenshot are the calls the worker already relies
 * on.
 */
export function buildStillFramingPage(options: {
  width: number;
  height: number;
  addressText: string;
  /** Relative or file URL to the raw capture, resolved against the page. */
  imageSrc: string;
  caption?: string;
  backdrop?: MarketingBackdrop;
}): string {
  const backdrop = options.backdrop ?? 'gradient';
  const geometry = frameGeometry(options.width, options.height, backdrop);
  const caption = options.caption?.trim();

  return `<!doctype html>
<html>
<head>
<style>${framingStyles({ backdrop, ...geometry })}
  img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
  <div class="window">
${windowBar(backdrop, options.addressText)}    <img id="still" src="${escapeHtml(options.imageSrc)}" alt="">
  </div>
${caption ? `  <div class="overlay on">${escapeHtml(caption)}</div>\n` : ''}</body>
</html>`;
}

/**
 * Re-shoot the raw capture inside the framing page. Returns the framed WebM
 * and how much lead-in (page setup before playback began) the transcode
 * should cut.
 */
export async function frameClip(options: FrameOptions): Promise<FramedResult> {
  const backdrop = options.backdrop ?? 'gradient';
  const geometry = frameGeometry(options.width, options.height, backdrop);

  const framedDir = path.join(options.outDir, 'framed');
  fs.mkdirSync(framedDir, { recursive: true });

  const pageHtml = buildFramingPage({
    width: options.width,
    height: options.height,
    addressText: options.addressText ?? 'app.yawp.school',
    videoSrc: 'clip.webm',
    overlays: options.overlays,
    zooms: options.zooms,
    backdrop,
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
