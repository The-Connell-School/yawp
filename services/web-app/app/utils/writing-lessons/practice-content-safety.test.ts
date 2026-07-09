import { describe, expect, test } from 'bun:test';

import {
  isSchoolAppropriate,
  filterAppropriatePrompts,
} from './practice-content-safety';

describe('isSchoolAppropriate', () => {
  test('accepts ordinary, on-topic practice sentences', () => {
    expect(
      isSchoolAppropriate('The album dropped at midnight, fans went wild.')
    ).toBe(true);
    expect(
      isSchoolAppropriate(
        'She studied all night for the exam, she still felt unprepared.'
      )
    ).toBe(true);
    expect(
      isSchoolAppropriate('My favorite genres are horror, comedy and sci-fi.')
    ).toBe(true);
  });

  test('rejects profanity and slurs regardless of casing', () => {
    expect(isSchoolAppropriate('This is fucking hard to read.')).toBe(false);
    expect(isSchoolAppropriate('What an ASSHOLE that character is.')).toBe(
      false
    );
  });

  test('rejects sexual content', () => {
    expect(isSchoolAppropriate('They had sex after the party ended.')).toBe(
      false
    );
    expect(isSchoolAppropriate('He watched porn instead of studying.')).toBe(
      false
    );
  });

  test('rejects graphic violence and self-harm', () => {
    expect(
      isSchoolAppropriate('He wanted to kill himself after the loss.')
    ).toBe(false);
    expect(isSchoolAppropriate('She loaded the gun and shot him dead.')).toBe(
      false
    );
  });

  test('rejects drug and alcohol use', () => {
    expect(
      isSchoolAppropriate('They got drunk and smoked meth all weekend.')
    ).toBe(false);
    expect(isSchoolAppropriate('He sold cocaine behind the school.')).toBe(
      false
    );
  });

  test('does not flag innocuous words that merely contain a banned substring', () => {
    // "class" contains "ass", "grasses" contains "ass", "Cockburn"/"Scunthorpe"
    // problem — word-boundary matching must not trip on these.
    expect(
      isSchoolAppropriate('The class analyzed grasses in the field.')
    ).toBe(true);
    expect(isSchoolAppropriate('Assign the passage about assessment.')).toBe(
      true
    );
    expect(
      isSchoolAppropriate('The team will shoot free throws at practice.')
    ).toBe(true);
  });

  test('treats blank input as inappropriate (nothing to show)', () => {
    expect(isSchoolAppropriate('   ')).toBe(false);
    expect(isSchoolAppropriate('')).toBe(false);
  });
});

describe('filterAppropriatePrompts', () => {
  test('drops any prompt whose exercise or instruction is inappropriate', () => {
    const prompts = [
      {
        exercise: 'The band played, the crowd sang.',
        instruction: 'Fix the splice.',
      },
      {
        exercise: 'He got drunk and drove home.',
        instruction: 'Fix the splice.',
      },
      {
        exercise: 'It rained, we stayed in.',
        instruction: 'Rewrite crudely, damn it.',
      },
      {
        exercise: 'The dog barked, the cat ran.',
        instruction: 'Add the Oxford comma.',
      },
    ];

    const safe = filterAppropriatePrompts(prompts);

    expect(safe).toEqual([
      {
        exercise: 'The band played, the crowd sang.',
        instruction: 'Fix the splice.',
      },
      {
        exercise: 'The dog barked, the cat ran.',
        instruction: 'Add the Oxford comma.',
      },
    ]);
  });

  test('returns an empty array when everything is inappropriate', () => {
    const prompts = [
      { exercise: 'He watched porn.', instruction: 'Fix it.' },
      { exercise: 'She wanted to kill herself.', instruction: 'Fix it.' },
    ];

    expect(filterAppropriatePrompts(prompts)).toEqual([]);
  });
});
