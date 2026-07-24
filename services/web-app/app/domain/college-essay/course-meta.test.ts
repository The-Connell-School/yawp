import { describe, expect, test } from 'bun:test';
import {
  COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY,
  COLLEGE_ESSAY_COMMON_APP_PROMPTS,
  COLLEGE_ESSAY_DIRECTIONS_INTRO,
  COLLEGE_ESSAY_DIRECTIONS_STEPS,
  COLLEGE_ESSAY_DIRECTIONS_TITLE,
  COLLEGE_ESSAY_EXEMPLARS,
  COLLEGE_ESSAY_EXEMPLARS_INTRO,
  COLLEGE_ESSAY_EXEMPLARS_TAGLINE,
  COLLEGE_ESSAY_PROMPTS_NOTE,
  COLLEGE_ESSAY_PROMPTS_TITLE,
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

describe('Common App prompts', () => {
  test('lists exactly the seven prompts', () => {
    expect(COLLEGE_ESSAY_COMMON_APP_PROMPTS).toHaveLength(7);
  });

  test('every prompt is non-empty and unique', () => {
    for (const prompt of COLLEGE_ESSAY_COMMON_APP_PROMPTS) {
      expect(prompt.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(COLLEGE_ESSAY_COMMON_APP_PROMPTS).size).toBe(
      COLLEGE_ESSAY_COMMON_APP_PROMPTS.length
    );
  });

  test('the note reinforces choosing a prompt last', () => {
    expect(COLLEGE_ESSAY_PROMPTS_TITLE.trim().length).toBeGreaterThan(0);
    expect(COLLEGE_ESSAY_PROMPTS_NOTE.toLowerCase()).toContain('last');
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
