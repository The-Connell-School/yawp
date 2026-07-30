import { describe, expect, test } from 'bun:test';
import {
  ApEnglishLangFeedbackSchema,
  isApEnglishLangFeedback,
  parseApEnglishLangFeedback,
  totalApEnglishLangScore,
} from './feedback';

function validFeedback(overrides: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        rowId: 'thesis',
        pointsEarned: 1,
        pointsPossible: 1,
        rationale: 'Defensible position with a line of reasoning.',
        located: [
          {
            location: 'thesis (¶1)',
            observation: 'The claim takes a side rather than restating the prompt.',
            nextStep: 'Name the reasoning that will carry the argument.',
          },
        ],
      },
      {
        rowId: 'evidence-commentary',
        pointsEarned: 2,
        pointsPossible: 4,
        rationale: 'Specific evidence appears but the line of reasoning breaks in ¶3.',
        located: [],
      },
      {
        rowId: 'sophistication',
        pointsEarned: 0,
        pointsPossible: 1,
        rationale: 'No sustained complexity yet.',
        located: [],
      },
    ],
    totalScore: 3,
    sourcesCited: 4,
    topPriorities: ['Restore the line of reasoning in ¶3.'],
    ...overrides,
  };
}

describe('ApEnglishLangFeedbackSchema', () => {
  test('accepts well-formed feedback', () => {
    expect(() => parseApEnglishLangFeedback(validFeedback())).not.toThrow();
    expect(isApEnglishLangFeedback(validFeedback())).toBe(true);
  });

  test('requires feedback for all three rubric rows', () => {
    const feedback = validFeedback();
    const rows = feedback.rows.slice(0, 2);
    expect(
      ApEnglishLangFeedbackSchema.safeParse({ ...feedback, rows, totalScore: 3 })
        .success,
    ).toBe(false);
  });

  test('rejects duplicate rows', () => {
    const feedback = validFeedback();
    const rows = [feedback.rows[0], feedback.rows[0], feedback.rows[2]];
    expect(
      ApEnglishLangFeedbackSchema.safeParse({ ...feedback, rows, totalScore: 2 })
        .success,
    ).toBe(false);
  });

  test('rejects a row that exceeds its rubric maximum', () => {
    const feedback = validFeedback();
    feedback.rows[0].pointsEarned = 2;
    expect(ApEnglishLangFeedbackSchema.safeParse(feedback).success).toBe(false);
  });

  test('rejects a row whose pointsPossible disagrees with the rubric', () => {
    const feedback = validFeedback();
    feedback.rows[1].pointsPossible = 5;
    expect(ApEnglishLangFeedbackSchema.safeParse(feedback).success).toBe(false);
  });

  test('rejects a totalScore that does not equal the sum of rows', () => {
    expect(
      ApEnglishLangFeedbackSchema.safeParse(validFeedback({ totalScore: 6 })).success,
    ).toBe(false);
  });

  test('requires between one and two top priorities', () => {
    expect(
      ApEnglishLangFeedbackSchema.safeParse(validFeedback({ topPriorities: [] }))
        .success,
    ).toBe(false);
    expect(
      ApEnglishLangFeedbackSchema.safeParse(
        validFeedback({ topPriorities: ['a', 'b', 'c'] }),
      ).success,
    ).toBe(false);
  });
});

describe('synthesis source-count enforcement', () => {
  test('rejects Row B above the cap implied by sourcesCited', () => {
    // Two sources cited caps Evidence & Commentary at 1.
    const feedback = validFeedback({ sourcesCited: 2, totalScore: 3 });
    expect(ApEnglishLangFeedbackSchema.safeParse(feedback).success).toBe(false);
  });

  test('accepts Row B at the cap implied by sourcesCited', () => {
    const feedback = validFeedback({ sourcesCited: 2, totalScore: 2 });
    feedback.rows[1].pointsEarned = 1;
    expect(ApEnglishLangFeedbackSchema.safeParse(feedback).success).toBe(true);
  });

  test('applies no cap when sourcesCited is omitted (non-synthesis)', () => {
    const feedback = validFeedback({ sourcesCited: undefined });
    feedback.rows[1].pointsEarned = 4;
    feedback.totalScore = 5;
    expect(ApEnglishLangFeedbackSchema.safeParse(feedback).success).toBe(true);
  });
});

describe('totalApEnglishLangScore', () => {
  test('sums earned points across rows', () => {
    expect(totalApEnglishLangScore(validFeedback())).toBe(3);
  });
});
