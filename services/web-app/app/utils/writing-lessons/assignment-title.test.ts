import { describe, expect, test } from 'bun:test';

import { writingPracticeAssignmentTitle } from './assignment-title';

describe('writingPracticeAssignmentTitle', () => {
  test('uses the teacher-provided title when set', () => {
    expect(
      writingPracticeAssignmentTitle({
        title: 'Comma splices warm-up',
        lessonSlugs: ['fixing-comma-splices'],
      })
    ).toBe('Comma splices warm-up');
  });

  test('treats a blank title as unset', () => {
    expect(
      writingPracticeAssignmentTitle({
        title: '   ',
        lessonSlugs: ['topic-sentences'],
      })
    ).toBe('Topic Sentences');
  });

  test('names the single assigned lesson when there is no title', () => {
    expect(
      writingPracticeAssignmentTitle({
        title: null,
        lessonSlugs: ['topic-sentences'],
      })
    ).toBe('Topic Sentences');
  });

  test('joins two assigned lessons', () => {
    expect(
      writingPracticeAssignmentTitle({
        title: null,
        lessonSlugs: ['topic-sentences', 'thesis-statements'],
      })
    ).toBe('Topic Sentences & Thesis Statements');
  });

  test('summarizes three or more assigned lessons', () => {
    expect(
      writingPracticeAssignmentTitle({
        title: null,
        lessonSlugs: ['topic-sentences', 'thesis-statements', 'evidence'],
      })
    ).toBe('Topic Sentences, Thesis Statements & 1 more');
  });

  test('falls back to the generic label when no lesson resolves', () => {
    expect(
      writingPracticeAssignmentTitle({ title: null, lessonSlugs: [] })
    ).toBe('Writing Fundamentals Practice');
    expect(
      writingPracticeAssignmentTitle({
        title: null,
        lessonSlugs: ['not-a-real-lesson'],
      })
    ).toBe('Writing Fundamentals Practice');
  });
});
