import { describe, expect, test } from 'bun:test';
import {
  COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY,
  COLLEGE_ESSAY_DIRECTIONS_INTRO,
  COLLEGE_ESSAY_DIRECTIONS_STEPS,
  COLLEGE_ESSAY_DIRECTIONS_TITLE,
  COLLEGE_ESSAY_EXEMPLARS,
  COLLEGE_ESSAY_EXEMPLARS_INTRO,
  COLLEGE_ESSAY_EXEMPLARS_TAGLINE,
} from './course-meta';

describe('College essay course meta', () => {
  test('system key matches the seeded course key', () => {
    expect(COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY).toBe('college_admissions_essay');
  });

  test('exposes a non-empty explanatory intro and tagline', () => {
    expect(COLLEGE_ESSAY_EXEMPLARS_INTRO.trim().length).toBeGreaterThan(0);
    expect(COLLEGE_ESSAY_EXEMPLARS_TAGLINE.trim().length).toBeGreaterThan(0);
  });
});

describe('College essay directions', () => {
  test('has a title, intro, and several ordered steps', () => {
    expect(COLLEGE_ESSAY_DIRECTIONS_TITLE.trim().length).toBeGreaterThan(0);
    expect(COLLEGE_ESSAY_DIRECTIONS_INTRO.trim().length).toBeGreaterThan(0);
    expect(COLLEGE_ESSAY_DIRECTIONS_STEPS.length).toBeGreaterThanOrEqual(3);
    for (const step of COLLEGE_ESSAY_DIRECTIONS_STEPS) {
      expect(step.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('College essay exemplar links', () => {
  test('has several curated exemplars', () => {
    expect(COLLEGE_ESSAY_EXEMPLARS.length).toBeGreaterThanOrEqual(3);
  });

  test('every exemplar has a label, blurb, and https URL', () => {
    for (const exemplar of COLLEGE_ESSAY_EXEMPLARS) {
      expect(exemplar.label.trim().length).toBeGreaterThan(0);
      expect(exemplar.blurb.trim().length).toBeGreaterThan(0);
      expect(exemplar.href).toMatch(/^https:\/\//);
      // A well-formed, parseable URL.
      expect(() => new URL(exemplar.href)).not.toThrow();
    }
  });

  test('exemplar URLs are unique', () => {
    const hrefs = COLLEGE_ESSAY_EXEMPLARS.map((exemplar) => exemplar.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
