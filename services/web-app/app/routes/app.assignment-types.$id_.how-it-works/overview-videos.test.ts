import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDE_HOW_TO_TEACH_KEYS } from './how-to-teach';
import { GUIDE_OVERVIEW_VIDEOS } from './overview-videos';
import { THESIS_ESSAY_COURSE } from '../app.assignment-types.$id/landing-copy/thesis-essay-course';

const PUBLIC = join(import.meta.dirname, '../../../public');

describe('the overview video at the top of each How It Works page', () => {
  test('every one of the four pages has one', () => {
    expect(Object.keys(GUIDE_OVERVIEW_VIDEOS).sort()).toEqual([...GUIDE_HOW_TO_TEACH_KEYS].sort());
  });

  // Class Starter and Exit Ticket: a tour recorded from the app, no sound.
  for (const key of ['class-starter', 'exit-ticket'] as const) {
    const video = GUIDE_OVERVIEW_VIDEOS[key];

    test(`${key}: the video is a real MP4 served from the app`, () => {
      expect(video.src).toMatch(/^\/img\/[a-z-]+-guide\/overview\.mp4$/);
      const file = join(PUBLIC, video.src);
      expect(existsSync(file)).toBe(true);
      // An MP4 opens with an ftyp box.
      expect(readFileSync(file).subarray(4, 8).toString('latin1')).toBe('ftyp');
    });

    test(`${key}: its poster is a JPEG beside it`, () => {
      expect(video.poster).toBe(video.src.replace(/\.mp4$/, '.jpg'));
      const bytes = readFileSync(join(PUBLIC, video.poster));
      expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    });

    test(`${key}: it says what it shows, for anyone who can’t watch it`, () => {
      expect(video.label).toMatch(/^A tour of .+ with no sound\. /);
      expect(video.label.length).toBeGreaterThan(120);
      expect(video.captions).toBeUndefined();
    });
  }

  // Pre-Writing and Thesis Statement: Brian's tutorial for that lesson of the
  // course (Nov 14), the same file its "Watch tutorial" page plays.
  for (const [key, lesson] of [
    ['prewriting', 2],
    ['thesis-statement', 3],
  ] as const) {
    const video = GUIDE_OVERVIEW_VIDEOS[key];
    const tutorial = THESIS_ESSAY_COURSE[lesson - 1]!.tutorials[0]!;

    test(`${key}: the video is Brian’s tutorial for lesson ${lesson}, with its poster and captions`, () => {
      expect(video.src).toBe(tutorial.src);
      expect(video.poster).toBe(tutorial.poster);
      expect(video.captions).toBe(tutorial.captions);
      expect(existsSync(join(PUBLIC, video.src))).toBe(true);
      // 16:9: the black bars around his slides are cropped off.
      expect({ width: video.width, height: video.height }).toEqual({ width: 1080, height: 608 });
    });

    test(`${key}: it says who is talking and what he covers, and no longer claims to be silent`, () => {
      expect(video.label).toMatch(/^Brian Connell /);
      expect(video.label.length).toBeGreaterThan(120);
      expect(`${video.label} ${video.note}`).not.toMatch(/no sound|demo classes/i);
      expect(video.note).toContain(`About ${tutorial.minutes} minutes`);
      expect(video.note).toContain('captions');
    });
  }
});
