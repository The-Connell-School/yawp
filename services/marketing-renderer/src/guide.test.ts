import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseStoryboard } from '@app/marketing-media';
import {
  GUIDE_MEDIA_WIDTH,
  assembleGuideDocument,
  buildGuideSegmentArgs,
  buildGuideStillArgs,
  planGuideSegments,
} from './guide';

function board() {
  return parseStoryboard({
    slug: 'reporter-guide',
    title: 'Reporter guide',
    persona: 'teacher',
    guide: {
      headline: 'Ask about your classes in plain language.',
      lede: 'Reporter turns released grades into class reports.',
      will: ['Read released grades.'],
      wont: ['Change, give, or release grades.'],
      footerNote: 'Clips use demo classes.',
    },
    scenes: [
      { id: 'hero', goto: '/app', guide: { section: 'hero' } },
      {
        id: 'open-class',
        steps: [{ action: 'click', role: 'link', name: 'Period 1' }],
        guide: { section: 'step', heading: 'Start with a class', body: 'Pick one.' },
      },
      {
        id: 'still-step',
        guide: { section: 'step', heading: 'Read it', body: 'It is all there.' },
      },
      {
        id: 'untagged',
        steps: [{ action: 'click', role: 'link', name: 'Period 1' }],
      },
    ],
  });
}

const marks = [
  { id: 'hero', startMs: 4_000, endMs: 6_000 },
  { id: 'open-class', startMs: 6_000, endMs: 11_500 },
  { id: 'still-step', startMs: 11_500, endMs: 13_000 },
  { id: 'untagged', startMs: 13_000, endMs: 15_000 },
];

describe('planGuideSegments', () => {
  // A step is a loop of one thing happening. A scene with nothing to do is a
  // still, and a scene the guide does not show is not cut at all.
  test('cuts a clip for each guide step that has something happening', () => {
    expect(planGuideSegments(board(), marks)).toEqual([
      { sceneId: 'open-class', startSeconds: 6, durationSeconds: 5.5 },
    ]);
  });

  test('caps a long scene so each loop stays short', () => {
    const long = [{ id: 'open-class', startMs: 0, endMs: 60_000 }];
    const [segment] = planGuideSegments(board(), long);
    expect(segment.durationSeconds).toBe(12);
  });

  test('skips a scene too short to read as a loop', () => {
    const blink = [{ id: 'open-class', startMs: 1_000, endMs: 1_400 }];
    expect(planGuideSegments(board(), blink)).toEqual([]);
  });
});

describe('ffmpeg arguments', () => {
  test('a segment is a silent, guide-sized, phone-safe mp4 cut from the take', () => {
    const args = buildGuideSegmentArgs('/in.webm', '/out.mp4', {
      startSeconds: 6,
      durationSeconds: 5.5,
    }).join(' ');
    expect(args).toContain('-ss 6.00');
    expect(args).toContain('-t 5.50');
    expect(args).toContain(`scale=${GUIDE_MEDIA_WIDTH}:-2`);
    expect(args).toContain('-an');
    expect(args).toContain('libx264');
    expect(args).toContain('yuv420p');
    expect(args).toContain('+faststart');
    expect(args.endsWith('/out.mp4')).toBe(true);
  });

  test('a guide still is a guide-width jpeg', () => {
    const args = buildGuideStillArgs('/in.png', '/out.jpg').join(' ');
    expect(args).toContain(`scale=${GUIDE_MEDIA_WIDTH}:-2`);
    expect(args.endsWith('/out.jpg')).toBe(true);
  });
});

describe('assembleGuideDocument', () => {
  test('inlines the stills and clips into one html file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-'));
    const still = path.join(dir, 'hero.jpg');
    const clip = path.join(dir, 'open-class.mp4');
    fs.writeFileSync(still, Buffer.from('still'));
    fs.writeFileSync(clip, Buffer.from('clip'));
    const outPath = path.join(dir, 'reporter-guide.html');

    assembleGuideDocument({
      storyboard: board(),
      stills: { hero: still, 'open-class': still },
      clips: { 'open-class': clip },
      outPath,
    });

    const html = fs.readFileSync(outPath, 'utf8');
    expect(html).toContain(
      `data:image/jpeg;base64,${Buffer.from('still').toString('base64')}`
    );
    expect(html).toContain(
      `data:video/mp4;base64,${Buffer.from('clip').toString('base64')}`
    );
    expect(html).toContain('Ask about your classes in plain language.');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
