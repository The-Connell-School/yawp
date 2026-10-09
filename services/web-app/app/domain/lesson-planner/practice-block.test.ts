import { describe, expect, test } from 'bun:test';
import {
  inlinePlannedPractice,
  PRACTICE_FENCE,
  readPlannedPractice,
} from './practice-block';

const block = (inner: string) => '```' + PRACTICE_FENCE + '\n' + inner + '\n```';

describe('readPlannedPractice', () => {
  test('lifts a practice set out of the plan', () => {
    const { practices, body } = readPlannedPractice(
      '## Practice (10 min)\n\nThey repair their own splices.\n\n' +
        block(
          'lessons: fixing-comma-splices\nproblems: 6\ntitle: Comma splice repair\n---\nFix each sentence two different ways.'
        ) +
        '\n\n## Closing'
    );

    expect(practices).toEqual([
      {
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 6,
        title: 'Comma splice repair',
        instructions: 'Fix each sentence two different ways.',
      },
    ]);
    expect(body).toBe(
      '## Practice (10 min)\n\nThey repair their own splices.\n\n## Closing'
    );
  });

  test('takes several lessons, in the order written', () => {
    const { practices } = readPlannedPractice(
      block('lessons: subject-verb-agreement, pronoun-agreement\nproblems: 8')
    );
    expect(practices[0]!.lessonSlugs).toEqual([
      'subject-verb-agreement',
      'pronoun-agreement',
    ]);
  });

  test('reads the lessons however the model separated them', () => {
    const { practices } = readPlannedPractice(
      block('lesson: Passive-Voice ;  parallel-construction')
    );
    expect(practices[0]!.lessonSlugs).toEqual([
      'passive-voice',
      'parallel-construction',
    ]);
  });

  test('drops a repeated lesson rather than assigning it twice', () => {
    const { practices } = readPlannedPractice(
      block('lessons: passive-voice, passive-voice')
    );
    expect(practices[0]!.lessonSlugs).toEqual(['passive-voice']);
  });

  test('defaults to five problems, the assignment sheet’s own default', () => {
    const { practices } = readPlannedPractice(block('lessons: passive-voice'));
    expect(practices[0]!.problemCount).toBe(5);
  });

  test('keeps the problem count inside what the sheet accepts', () => {
    expect(
      readPlannedPractice(block('lessons: passive-voice\nproblems: 40'))
        .practices[0]!.problemCount
    ).toBe(20);
    expect(
      readPlannedPractice(block('lessons: passive-voice\nproblems: 0'))
        .practices[0]!.problemCount
    ).toBe(1);
    expect(
      readPlannedPractice(block('lessons: passive-voice\nproblems: several'))
        .practices[0]!.problemCount
    ).toBe(5);
  });

  test('drops a block that names no lesson — there is nothing to assign', () => {
    const { practices, body } = readPlannedPractice(
      'Before.\n\n' + block('problems: 5\ntitle: Grammar') + '\n\nAfter.'
    );
    expect(practices).toEqual([]);
    // The fence is still machinery, and never reaches the page.
    expect(body).toBe('Before.\n\nAfter.');
  });

  test('leaves title and instructions empty when the block has none', () => {
    const { practices } = readPlannedPractice(block('lessons: passive-voice'));
    expect(practices[0]!.title).toBeNull();
    expect(practices[0]!.instructions).toBeNull();
  });

  test('ignores a slug with characters no lesson slug has', () => {
    const { practices } = readPlannedPractice(
      block('lessons: passive-voice, ../admin, <b>x</b>')
    );
    expect(practices[0]!.lessonSlugs).toEqual(['passive-voice']);
  });

  test('leaves a reply with no practice untouched', () => {
    const content = '## Lesson\n\nNothing to assign here.';
    expect(readPlannedPractice(content)).toEqual({
      practices: [],
      body: content,
    });
  });
});

describe('inlinePlannedPractice', () => {
  test('prints the practice as a line a teacher can read, not a fence', () => {
    const printed = inlinePlannedPractice(
      'Before.\n\n' +
        block(
          'lessons: fixing-comma-splices\nproblems: 6\ntitle: Comma splice repair\n---\nFix each one two ways.'
        ),
      { 'fixing-comma-splices': 'Fixing Comma Splices' }
    );

    expect(printed).not.toContain(PRACTICE_FENCE);
    expect(printed).toContain('Comma splice repair');
    expect(printed).toContain('Fixing Comma Splices');
    expect(printed).toContain('6 problems');
    expect(printed).toContain('Fix each one two ways.');
  });

  test('falls back to a readable name when it does not know the lesson', () => {
    const printed = inlinePlannedPractice(
      block('lessons: passive-voice\nproblems: 1')
    );
    expect(printed).toContain('Passive voice');
    expect(printed).toContain('1 problem');
    expect(printed).not.toContain('1 problems');
  });

  test('prints nothing for a block with no lesson', () => {
    expect(inlinePlannedPractice(block('problems: 4')).trim()).toBe('');
  });
});
