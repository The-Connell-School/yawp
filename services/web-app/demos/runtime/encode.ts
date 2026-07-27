/**
 * Turns Playwright's raw capture into a file you can drop into Slack.
 *
 * Playwright records VP8/WebM. That plays in Chrome and almost nowhere else
 * people actually share things — Slack previews are unreliable, GitHub
 * comments reject it outright, iMessage will not touch it. So every recording
 * gets transcoded to H.264/MP4 on the way out.
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export type EncodeSpec = {
  /** Raw .webm written by Playwright. */
  input: string;
  /** Destination .mp4. */
  output: string;
  /** Milliseconds to cut off the front (sign-in, navigation, seeding). */
  trimStartMs: number;
  width: number;
  height: number;
  fps: number;
  /** H.264 quality, lower is better. 18-23 is the useful range. */
  crf: number;
};

/**
 * Build the ffmpeg argument list for a recording.
 *
 * Split out from the process spawn so the flag choices — the ones that decide
 * whether the video plays at all on a given surface — are testable without
 * shelling out.
 */
export function buildFfmpegArgs(spec: EncodeSpec): string[] {
  assertValid(spec);

  const width = roundUpToEven(spec.width);
  const height = roundUpToEven(spec.height);

  const args = ['-y', '-i', spec.input];

  // -ss goes *after* -i on purpose. Placed before it, ffmpeg does a fast
  // keyframe seek, which overshoots or undershoots by up to a keyframe
  // interval and can leave a frame of the sign-in screen at the head.
  if (spec.trimStartMs > 0) {
    args.push('-ss', (spec.trimStartMs / 1000).toFixed(3));
  }

  args.push(
    '-vf',
    [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    ].join(','),
    '-r',
    String(spec.fps),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    String(spec.crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    spec.output
  );

  return args;
}

function assertValid(spec: EncodeSpec): void {
  if (path.extname(spec.output).toLowerCase() !== '.mp4') {
    throw new Error(`Demo output must be an .mp4 file, got: ${spec.output}`);
  }
  if (spec.width <= 0) throw new Error(`Invalid width: ${spec.width}`);
  if (spec.height <= 0) throw new Error(`Invalid height: ${spec.height}`);
  if (spec.fps <= 0) throw new Error(`Invalid fps: ${spec.fps}`);
}

function roundUpToEven(value: number): number {
  const rounded = Math.ceil(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Locate an ffmpeg binary that can encode H.264.
 *
 * Note that Playwright ships its own ffmpeg, but it is compiled
 * `--disable-everything` with only VP8 and WebM enabled — it cannot produce
 * an MP4. We deliberately do not fall back to it; a confusing codec error
 * deep in a transcode is worse than a clear message here.
 */
export async function resolveFfmpegPath(): Promise<string> {
  const fromEnv = process.env.DEMO_FFMPEG_PATH;
  if (fromEnv) return fromEnv;

  try {
    const staticPath = (await import('ffmpeg-static')).default;
    if (typeof staticPath === 'string' && staticPath.length > 0) {
      return staticPath;
    }
  } catch {
    // ffmpeg-static not installed; fall through to a system binary.
  }

  return 'ffmpeg';
}

export async function encodeToMp4(spec: EncodeSpec): Promise<string> {
  await mkdir(path.dirname(spec.output), { recursive: true });

  const ffmpegPath = await resolveFfmpegPath();
  const args = buildFfmpegArgs(spec);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      const hint =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? `\n\nCould not find ffmpeg at "${ffmpegPath}". Install it with:\n` +
            `  bun add -d ffmpeg-static      (from services/web-app)\n` +
            `or use a system build (brew install ffmpeg / apt-get install ffmpeg).`
          : '';
      reject(new Error(`ffmpeg failed to start: ${error.message}${hint}`));
    });

    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(`ffmpeg exited with code ${code}\n${lastLines(stderr, 20)}`)
      );
    });
  });

  return spec.output;
}

function lastLines(text: string, count: number): string {
  return text.trimEnd().split('\n').slice(-count).join('\n');
}
