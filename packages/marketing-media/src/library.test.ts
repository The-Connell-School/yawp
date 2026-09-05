import { describe, expect, test } from 'bun:test';
import { MARKETING_LIBRARY } from './library';
import { MAX_CLIP_SECONDS_HINT } from './library';
import {
  estimateRenderSeconds,
  parseStoryboard,
  safeParseStoryboard,
} from './storyboard';

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

  // These clips are silent. Without burned-in copy a viewer sees a cursor
  // moving around an unfamiliar UI and has to infer the feature, so every
  // clip needs at least one line, and it has to be short enough to read at a
  // glance rather than a description of what the mouse is doing.
  test('every clip carries on-screen copy a viewer can read', () => {
    for (const entry of MARKETING_LIBRARY) {
      if (entry.kind !== 'CLIP') continue;
      const parsed = safeParseStoryboard(entry.storyboard);
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;

      const overlays = parsed.data.scenes
        .map((scene) => scene.overlay)
        .filter((text): text is string => Boolean(text));

      expect(overlays.length).toBeGreaterThan(0);
      for (const text of overlays) {
        expect(text.length).toBeLessThanOrEqual(60);
      }
    }
  });

  test('covers the feedback loop, daily writing, and teacher views', () => {
    const slugs = MARKETING_LIBRARY.map((entry) => entry.slug).join(' ');
    expect(slugs).toContain('feedback');
    expect(slugs).toContain('daily-pages');
    expect(slugs).toContain('grading');
  });
});

describe('student storyboards follow the current student flow', () => {
  // The student dashboard now lists classes, not documents; a student's
  // writing lives under My Documents. Both student clips used to click a
  // document card on the dashboard and timed out on every render.
  test('open a student document from My Documents, not the dashboard', () => {
    const studentEntries = MARKETING_LIBRARY.filter((entry) =>
      ['student', 'student-graded'].includes(
        (entry.storyboard as { persona?: string }).persona ?? ''
      )
    );
    expect(studentEntries.length).toBeGreaterThan(0);
    for (const entry of studentEntries) {
      const parsed = parseStoryboard(entry.storyboard);
      const firstClick = parsed.scenes
        .flatMap((scene) => scene.steps ?? [])
        .find((step) => step.action === 'click');
      const opensFrom = parsed.scenes.find((scene) =>
        (scene.steps ?? []).includes(firstClick as never)
      );
      expect(opensFrom?.goto).toBe('/app/my-documents');
    }
  });
});

describe('library routes stay canonical', () => {
  // A redirect fires mid-capture and can race the scene's waitFor, so the
  // hand-verified library must never point at a path that redirects.
  test('no entry navigates to the legacy student-work path', () => {
    for (const entry of MARKETING_LIBRARY) {
      const parsed = parseStoryboard(entry.storyboard);
      for (const scene of parsed.scenes) {
        expect(scene.goto).not.toBe('/app/student-work');
      }
    }
  });
});
