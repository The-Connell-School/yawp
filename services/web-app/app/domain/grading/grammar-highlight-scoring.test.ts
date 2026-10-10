import { describe, expect, test } from 'bun:test';
import { applyGrammarHighlightScoreClamp } from './grammar-highlight-scoring';

describe('applyGrammarHighlightScoreClamp', () => {
  const rubricCategories = [
    {
      key: 'language_use_and_conventions',
      grammarHighlighting: true,
    },
  ];

  test('restores full credit when meaning is not impaired', () => {
    const categories = applyGrammarHighlightScoreClamp({
      categories: [
        {
          key: 'language_use_and_conventions',
          score: 2,
          comment: 'A few comma slips.',
        },
      ],
      rubricCategories,
      minScore: 1,
      maxScore: 4,
      display: {
        showCategories: true,
        perCategoryComments: true,
        grammarHighlight: 'highlight',
        teacherNotes: true,
      },
      grammarImpairsMeaning: false,
    });

    expect(categories[0].score).toBe(4);
  });

  test('keeps a deduction when grammarImpairsMeaning is true', () => {
    const categories = applyGrammarHighlightScoreClamp({
      categories: [
        {
          key: 'language_use_and_conventions',
          score: 2,
          comment: 'Errors force the reader to reread.',
        },
      ],
      rubricCategories,
      minScore: 1,
      maxScore: 4,
      display: {
        showCategories: true,
        perCategoryComments: true,
        grammarHighlight: 'highlight',
        teacherNotes: true,
      },
      grammarImpairsMeaning: true,
    });

    expect(categories[0].score).toBe(2);
  });
});
