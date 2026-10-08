import fs from 'node:fs';
import path from 'node:path';
import {
  type MarketingStoryboard,
  renderGuideDocument,
  type GuideSceneMedia,
} from '@app/marketing-media';

/**
 * How a GUIDE job turns one filmed run into a how-to guide.
 *
 * The run is recorded once, like a clip. Each guide step that has something
 * happening in it is then cut out as its own short, silent loop — the "each
 * clip shows one thing and loops" rule from docs/how-to-guides.md — and every
 * tagged scene's still is downscaled for the page. The page itself inlines all
 * of it, so the deliverable is one file.
 */

/** Where a guide's start button sends a reader: the public site, never the demo it was filmed on. */
export const GUIDE_START_URL = 'https://yawp.school';

/** Guide media width, per docs/how-to-guides.md ("1120px wide H.264"). */
export const GUIDE_MEDIA_WIDTH = 1120;
const MIN_SEGMENT_SECONDS = 1;
const MAX_SEGMENT_SECONDS = 12;

/** Steps that move something on screen. A scene with none of these is a still. */
const MOTION_ACTIONS = new Set([
  'click',
  'hover',
  'scrollTo',
  'fill',
  'type',
  'press',
  'scroll',
]);

const CLIPPED_SECTIONS = new Set(['range', 'step', 'extra']);

export type SceneMark = { id: string; startMs: number; endMs: number };

export type GuideSegment = {
  sceneId: string;
  startSeconds: number;
  durationSeconds: number;
};

export function planGuideSegments(
  storyboard: MarketingStoryboard,
  marks: SceneMark[]
): GuideSegment[] {
  const byId = new Map(marks.map((mark) => [mark.id, mark]));
  const segments: GuideSegment[] = [];
  for (const scene of storyboard.scenes) {
    if (!scene.guide || !CLIPPED_SECTIONS.has(scene.guide.section)) continue;
    if (!scene.steps.some((step) => MOTION_ACTIONS.has(step.action))) continue;
    const mark = byId.get(scene.id);
    if (!mark) continue;
    const seconds = (mark.endMs - mark.startMs) / 1000;
    if (seconds < MIN_SEGMENT_SECONDS) continue;
    segments.push({
      sceneId: scene.id,
      startSeconds: Math.round(mark.startMs) / 1000,
      durationSeconds:
        Math.round(Math.min(seconds, MAX_SEGMENT_SECONDS) * 100) / 100,
    });
  }
  return segments;
}

export function buildGuideSegmentArgs(
  inputPath: string,
  outputPath: string,
  segment: { startSeconds: number; durationSeconds: number }
): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    // After -i so the cut is frame-accurate; the segment is re-encoded anyway.
    '-ss',
    segment.startSeconds.toFixed(2),
    '-t',
    segment.durationSeconds.toFixed(2),
    '-an',
    '-vf',
    `scale=${GUIDE_MEDIA_WIDTH}:-2`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    // Smaller than the feature clip's 23: a guide carries several loops and
    // the whole page should stay near 3 MB.
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export function buildGuideStillArgs(
  inputPath: string,
  outputPath: string
): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `scale=${GUIDE_MEDIA_WIDTH}:-2`,
    '-q:v',
    '4',
    outputPath,
  ];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

function dataUri(filePath: string): string {
  const mime =
    MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ??
    'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

/** Write the guide page with every still and clip inlined. */
export function assembleGuideDocument(params: {
  storyboard: MarketingStoryboard;
  /** Scene id to still path. */
  stills: Record<string, string>;
  /** Scene id to clip path. */
  clips: Record<string, string>;
  outPath: string;
  startUrl?: string;
}): void {
  const media: Record<string, GuideSceneMedia> = {};
  for (const scene of params.storyboard.scenes) {
    const still = params.stills[scene.id];
    const clip = params.clips[scene.id];
    if (!still && !clip) continue;
    media[scene.id] = {
      image: still ? dataUri(still) : undefined,
      clip: clip ? dataUri(clip) : undefined,
    };
  }
  fs.writeFileSync(
    params.outPath,
    renderGuideDocument({
      storyboard: params.storyboard,
      media,
      startUrl: params.startUrl,
    })
  );
}
