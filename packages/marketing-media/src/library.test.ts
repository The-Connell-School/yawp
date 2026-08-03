import { describe, expect, test } from 'bun:test';
import { MARKETING_LIBRARY } from './library';
import { MAX_CLIP_SECONDS_HINT } from './library';
import { estimateRenderSeconds, safeParseStoryboard } from './storyboard';

// The library exists so an admin can render known-good media with one click:
// every entry must be a storyboard the renderer will accept without an LLM in
// the loop, and clips must stay short-form. An entry failing here would fail
// at render time in front of the admin instead.
describe('MARKETING_LIBRARY', () => {
  test('every entry is a valid storyboard', () => {
    for (const entry of MARKETING_LIBRARY) {
      const result = safeParseStoryboard(entry.storyboard);
      if (!result.success) {
        throw new Error(
          `${entry.slug}: ${JSON.stringify(result.error.issues)}`
        );
      }
    }
  });

  test('clips stay short-form', () => {
    for (const entry of MARKETING_LIBRARY) {
      if (entry.kind !== 'CLIP') continue;
      const parsed = safeParseStoryboard(entry.storyboard);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(estimateRenderSeconds(parsed.data)).toBeLessThanOrEqual(
          MAX_CLIP_SECONDS_HINT
        );
      }
    }
  });

  test('slugs are unique and entries carry the teaching story', () => {
    const slugs = MARKETING_LIBRARY.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const entry of MARKETING_LIBRARY) {
      expect(entry.title.length).toBeGreaterThan(5);
      expect(entry.description.length).toBeGreaterThan(30);
    }
  });

  test('covers the feedback loop, daily writing, and teacher views', () => {
    const slugs = MARKETING_LIBRARY.map((entry) => entry.slug).join(' ');
    expect(slugs).toContain('feedback');
    expect(slugs).toContain('daily-pages');
    expect(slugs).toContain('grading');
  });
});
