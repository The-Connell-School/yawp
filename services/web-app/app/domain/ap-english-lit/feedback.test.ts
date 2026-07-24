import { describe, expect, test } from 'bun:test';
import {
  ApEnglishLitFeedbackSchema,
  parseApEnglishLitFeedback,
  totalApEnglishLitScore,
} from './feedback';

function validFeedback() {
  return {
    rows: [
      {
        rowId: 'thesis' as const,
        pointsEarned: 1,
        pointsPossible: 1,
        rationale: 'The thesis stakes a defensible interpretation of the speaker\'s solitude.',
        located: [
          {
            location: 'thesis (¶1)',
            observation: 'The claim that solitude is chosen, not imposed, is arguable.',
            nextStep: 'Keep this thread visible in every body paragraph.',
          },
        ],
      },
      {
        rowId: 'evidence-commentary' as const,
        pointsEarned: 2,
        pointsPossible: 4,
        rationale: 'Evidence in ¶2 is specific but the commentary restates it instead of explaining it.',
        located: [
          {
            location: '¶2',
            observation: 'The quotation is strong but the sentence after it paraphrases the quote.',
            nextStep: 'Ask "so what does that choice do?" and explain how it supports the thesis.',
          },
        ],
      },
      {
        rowId: 'sophistication' as const,
        pointsEarned: 0,
        pointsPossible: 1,
        rationale: 'No sustained complexity yet; the tension named in the thesis is dropped.',
        located: [],
      },
    ],
    totalScore: 3,
    topPriorities: [
      'Turn the ¶2 commentary from paraphrase into explanation (Row B).',
    ],
  };
}

describe('AP English Literature feedback contract', () => {
  test('accepts a well-formed rubric-anchored feedback object', () => {
    const parsed = parseApEnglishLitFeedback(validFeedback());
    expect(parsed.totalScore).toBe(3);
    expect(parsed.rows).toHaveLength(3);
  });

  test('totalApEnglishLitScore sums the earned points', () => {
    expect(totalApEnglishLitScore(validFeedback())).toBe(3);
  });

  test('rejects feedback whose totalScore disagrees with the row sum', () => {
    expect(() =>
      parseApEnglishLitFeedback({ ...validFeedback(), totalScore: 5 }),
    ).toThrow();
  });

  test('rejects a row earning more than its rubric maximum', () => {
    const feedback = validFeedback();
    feedback.rows[0].pointsEarned = 2;
    expect(() => parseApEnglishLitFeedback(feedback)).toThrow();
  });

  test('rejects a row whose pointsPossible is not the rubric maximum', () => {
    const feedback = validFeedback();
    feedback.rows[1].pointsPossible = 3;
    expect(() => parseApEnglishLitFeedback(feedback)).toThrow();
  });

  test('requires all three rubric rows, each exactly once', () => {
    const feedback = validFeedback();
    feedback.rows = feedback.rows.slice(0, 2);
    expect(() => parseApEnglishLitFeedback(feedback)).toThrow();
  });

  test('rejects a duplicate rubric row', () => {
    const feedback = validFeedback();
    feedback.rows[2].rowId = 'thesis';
    expect(() => parseApEnglishLitFeedback(feedback)).toThrow();
  });

  test('caps the triaged priority list so feedback stays focused', () => {
    const feedback = validFeedback();
    feedback.topPriorities = ['a', 'b', 'c'];
    const result = ApEnglishLitFeedbackSchema.safeParse(feedback);
    expect(result.success).toBe(false);
  });
});
