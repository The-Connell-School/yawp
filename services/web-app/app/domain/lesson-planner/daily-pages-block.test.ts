import { describe, expect, test } from 'bun:test';
import {
  dailyPagesCreateHref,
  inlineDailyPagesExercises,
  readDailyPagesExercises,
} from './daily-pages-block';

describe('readDailyPagesExercises', () => {
  test('lifts a written warm-up out of the plan', () => {
    const { exercises, body } = readDailyPagesExercises(
      '## Warm-up (7 min)\n\n' +
        'Post this and give them four minutes.\n\n' +
        '```yawp-daily-pages\n' +
        'Think of the last time you convinced someone of something.\n' +
        '```\n\n' +
        '## Mini-lesson'
    );

    expect(exercises).toEqual([
      { prompt: 'Think of the last time you convinced someone of something.' },
    ]);
    expect(body).toBe(
      '## Warm-up (7 min)\n\n' +
        'Post this and give them four minutes.\n\n' +
        '## Mini-lesson'
    );
  });

  test('takes the blockquote markers off a quoted prompt', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\n> What made it land?\n> Write for four minutes.\n```'
    );
    expect(exercises[0]!.prompt).toBe(
      'What made it land?\nWrite for four minutes.'
    );
  });

  test('takes the wrapping quotes off too', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\n"What made it land?"\n```'
    );
    expect(exercises[0]!.prompt).toBe('What made it land?');
  });

  test('reads more than one warm-up', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nFirst prompt\n```\n\n' +
        '```yawp-daily-pages\nSecond prompt\n```'
    );
    expect(exercises.map((exercise) => exercise.prompt)).toEqual([
      'First prompt',
      'Second prompt',
    ]);
  });

  test('ignores an empty block', () => {
    const { exercises, body } = readDailyPagesExercises(
      'Here you go.\n\n```yawp-daily-pages\n\n```'
    );
    expect(exercises).toEqual([]);
    expect(body).toBe('Here you go.');
  });

  test('leaves a reply with no block completely alone', () => {
    const reply = '## Warm-up\n\nFour minutes of writing.';
    const { exercises, body } = readDailyPagesExercises(reply);
    expect(exercises).toEqual([]);
    expect(body).toBe(reply);
  });

  test('does not touch an ordinary code block', () => {
    const reply = '```\nyawp-daily-pages\n```';
    expect(readDailyPagesExercises(reply).body).toBe(reply);
  });
});

describe('inlineDailyPagesExercises', () => {
  test('prints the prompt as a blockquote rather than a code fence', () => {
    expect(
      inlineDailyPagesExercises(
        '## Warm-up\n\n```yawp-daily-pages\nWhat made it land?\n```\n\n## Mini-lesson'
      )
    ).toBe('## Warm-up\n\n> What made it land?\n\n## Mini-lesson');
  });

  test('quotes every line of a multi-line prompt', () => {
    expect(
      inlineDailyPagesExercises(
        '```yawp-daily-pages\nWhat made it land?\nWrite for four minutes.\n```'
      )
    ).toBe('> What made it land?\n> Write for four minutes.');
  });

  test('leaves a reply with no block alone', () => {
    const reply = '## Warm-up\n\nFour minutes of writing.';
    expect(inlineDailyPagesExercises(reply)).toBe(reply);
  });
});

describe('dailyPagesCreateHref', () => {
  test('carries the prompt to the assignment sheet', () => {
    expect(dailyPagesCreateHref('type-1', 'What made it land?')).toBe(
      '/app/assignment-types/type-1?newPrompt=What%20made%20it%20land%3F'
    );
  });
});
