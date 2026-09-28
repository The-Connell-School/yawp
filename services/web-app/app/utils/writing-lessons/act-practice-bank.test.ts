import { describe, expect, test } from 'bun:test';

import {
  actPracticeBankSlugs,
  getActPracticeQuestions,
} from './act-practice-bank';
import { isRenderableActQuestion } from './act-practice.shared';
import { isSchoolAppropriate } from './practice-content-safety';

describe('ACT practice bank integrity', () => {
  const slugs = actPracticeBankSlugs();

  test('covers all ten writing-fundamentals lessons', () => {
    expect(slugs).toHaveLength(10);
    expect(slugs).toContain('fixing-comma-splices');
    expect(slugs).toContain('subject-verb-agreement');
  });

  test('every item is well-formed, answerable, and school-appropriate', () => {
    for (const slug of slugs) {
      const questions = getActPracticeQuestions(slug);
      expect(questions.length).toBeGreaterThanOrEqual(3);

      for (const q of questions) {
        // Renderable: underline present in sentence, four non-empty choices,
        // and a correct index that points at a real choice.
        expect(isRenderableActQuestion(q)).toBe(true);
        // Choice A is the "NO CHANGE" text and must equal the underline.
        expect(q.choices[0]).toBe(q.underline);
        // Every field a student can see must clear the content-safety screen.
        expect(isSchoolAppropriate(q.sentence)).toBe(true);
        expect(isSchoolAppropriate(q.explanation)).toBe(true);
        for (const choice of q.choices) {
          expect(isSchoolAppropriate(choice)).toBe(true);
        }
        // Ids are stable and namespaced by slug.
        expect(q.id.startsWith(`${slug}-act-`)).toBe(true);
      }
    }
  });

  test('returns [] for an unknown slug', () => {
    expect(getActPracticeQuestions('not-a-lesson')).toEqual([]);
    expect(getActPracticeQuestions(undefined)).toEqual([]);
  });
});
