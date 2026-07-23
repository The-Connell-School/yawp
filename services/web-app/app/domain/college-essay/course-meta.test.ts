import { describe, expect, test } from 'bun:test';
import {
  COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY,
  COLLEGE_ESSAY_EXEMPLARS,
  COLLEGE_ESSAY_EXEMPLARS_INTRO,
} from './course-meta';

describe('College essay course meta', () => {
  test('system key matches the seeded course key', () => {
    expect(COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY).toBe('college_admissions_essay');
  });

  test('exposes a non-empty empathetic intro', () => {
    expect(COLLEGE_ESSAY_EXEMPLARS_INTRO.trim().length).toBeGreaterThan(0);
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
