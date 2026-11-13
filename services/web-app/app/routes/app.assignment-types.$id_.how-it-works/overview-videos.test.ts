import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDE_HOW_TO_TEACH_KEYS } from './how-to-teach';
import { GUIDE_OVERVIEW_VIDEOS } from './overview-videos';

const PUBLIC = join(import.meta.dirname, '../../../public');

describe('the overview video at the top of each How It Works page', () => {
  test('every one of the four pages has one', () => {
    expect(Object.keys(GUIDE_OVERVIEW_VIDEOS).sort()).toEqual([...GUIDE_HOW_TO_TEACH_KEYS].sort());
  });

  for (const key of GUIDE_HOW_TO_TEACH_KEYS) {
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
    });
  }
});
