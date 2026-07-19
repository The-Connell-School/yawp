import { describe, expect, test } from 'bun:test';

import {
  getQuickWritingLessonBody,
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
  getQuickWritingLessonSections,
  getQuickWritingLessons,
  getQuickWritingPracticePrompts,
} from './static-lessons.server';

describe('Quick Writing Lessons static lesson archive', () => {
  test('recovers the ten grammar lessons plus the composition lessons', () => {
    const lessons = getQuickWritingLessons();

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
      'topic-sentences',
      'thesis-statements',
      'evidence',
      'analysis',
    ]);
  });

  test('every grammar lesson is tagged to the Grammar & Mechanics section', () => {
    const lessons = getQuickWritingLessons();
    const grammar = lessons.filter(
      (lesson) => lesson.section === 'Grammar & Mechanics'
    );

    // The ten original lessons are all grammar/mechanics.
    expect(grammar).toHaveLength(10);
    for (const lesson of grammar) {
      expect([
        'Punctuation',
        'Sentence Structure',
        'Agreement',
        'Flow',
      ]).toContain(lesson.category);
    }
  });

  test('composition lessons form their own section', () => {
    const composition = getQuickWritingLessons().filter(
      (lesson) => lesson.section === 'Composition'
    );

    expect(composition.map((lesson) => lesson.slug)).toEqual([
      'topic-sentences',
      'thesis-statements',
      'evidence',
      'analysis',
    ]);
    for (const lesson of composition) {
      expect(['Making Claims', 'Supporting Claims']).toContain(lesson.category);
    }
  });

  test('groups lessons into ordered sections, each with its categories', () => {
    const sections = getQuickWritingLessonSections();

    expect(sections.map((section) => section.section)).toEqual([
      'Grammar & Mechanics',
      'Composition',
    ]);

    const composition = sections.find(
      (section) => section.section === 'Composition'
    );
    // Making Claims (topic sentences, thesis) then Supporting Claims
    // (evidence, analysis), in first-appearance order.
    expect(composition?.groups.map((group) => group.category)).toEqual([
      'Making Claims',
      'Supporting Claims',
    ]);
    expect(composition?.groups[1]).toEqual({
      category: 'Supporting Claims',
      lessons: expect.arrayContaining([
        expect.objectContaining({ slug: 'evidence' }),
        expect.objectContaining({ slug: 'analysis' }),
      ]),
    });
  });

  test('exposes grounding context (skill + rule) for a composition lesson', () => {
    const context = getQuickWritingLessonContext('topic-sentences');

    expect(context).not.toBeNull();
    expect(context?.title).toBe('Topic Sentences');
    expect(context?.skill).toBe('topic sentences');
    expect(context?.rule).toContain('claim');
    expect(context?.rule).not.toContain('Why This Matters');
    expect(context?.rule).not.toContain('Your turn');
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

  test('extracts practice prompts from lesson exercises', () => {
    const prompts = getQuickWritingPracticePrompts('revising-for-wordiness');

    expect(prompts).toHaveLength(6);
    expect(prompts[0]).toEqual({
      id: 'revising-for-wordiness-1',
      exercise:
        'At this point in time, we are not able to accept new applications.',
      instruction: 'Cut the wordiness. Say the same thing in fewer words.',
    });
    expect(prompts[1].instruction).toContain('weak');
  });

  test('exposes grounding context (skill + rule) for tutor feedback', () => {
    const context = getQuickWritingLessonContext('fixing-comma-splices');

    expect(context).not.toBeNull();
    expect(context?.title).toBe('Fixing Comma Splices');
    expect(context?.skill).toBe('comma splices');
    // The rule section, not the hook or the practice exercises.
    expect(context?.rule).toContain('two complete sentences');
    expect(context?.rule).not.toContain('Why This Matters');
    expect(context?.rule).not.toContain('Your turn');
  });

  test('returns null context for an unknown slug', () => {
    expect(getQuickWritingLessonContext('not-a-lesson')).toBeNull();
  });

  test('lesson body drops the redundant Practice Time section', () => {
    const lesson = getQuickWritingLessonBySlug('fixing-comma-splices');
    const body = getQuickWritingLessonBody(lesson!.content);

    // Keeps the teaching content...
    expect(body).toContain('Why This Matters');
    expect(body).toContain('The Rule');
    expect(body).toContain('Quick Tip');
    // ...but not the practice exercises (the side panel owns those).
    expect(body).not.toContain('Practice Time');
    expect(body).not.toContain('Your turn');
    expect(body).not.toContain('[Your response here]');
  });
});
