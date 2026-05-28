import { describe, expect, test } from 'bun:test';

import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessons,
} from './static-lessons.server';

describe('Quick Writing Lessons static lesson archive', () => {
  test('recovers all ten old Quick Writing Lessons from the archived prompt', () => {
    const lessons = getQuickWritingLessons();

    expect(lessons).toHaveLength(10);
    expect(lessons.map((lesson) => lesson.slug)).toEqual([
      'fixing-comma-splices',
      'revising-for-wordiness',
      'transition-sentences',
      'the-oxford-comma',
      'commas-independent-dependent-clauses',
      'passive-voice',
      'parallel-construction',
      'subject-verb-agreement',
      'pronoun-agreement',
      'commas-introductory-phrases',
    ]);
  });

  test('preserves lesson content without the generator instructions', () => {
    const lesson = getQuickWritingLessonBySlug('revising-for-wordiness');

    expect(lesson?.title).toBe('Revising for Wordiness');
    expect(lesson?.content).toContain(
      "Every unnecessary word is a tiny tax on your reader's attention."
    );
    expect(lesson?.content).toContain('At this point in time');
    expect(lesson?.content).not.toContain('Quick Writing Lesson Generator');
    expect(lesson?.content).not.toContain('Example Lesson 2');
  });
});
