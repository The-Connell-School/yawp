import { describe, expect, test } from 'bun:test';
import { applyGrammarHighlightScoreClamp } from './grammar-highlight-scoring';

describe('applyGrammarHighlightScoreClamp', () => {
  const rubricCategories = [
    {
      key: 'language_use_and_conventions',
      grammarHighlighting: true,
    },
    {
      key: 'thesis_and_content',
      grammarHighlighting: false,
    },
  ];

  const highlightDisplay = {
    showCategories: true,
    perCategoryComments: true,
    grammarHighlight: 'highlight' as const,
    teacherNotes: true,
  };

  test('restores full credit when grammarImpairsMeaning is not true', () => {
    const categories = applyGrammarHighlightScoreClamp({
      categories: [
        {
          key: 'language_use_and_conventions',
          score: 2,
          comment: 'A few comma slips.',
          grammarImpairsMeaning: false,
        },
      ],
      rubricCategories,
      minScore: 1,
      maxScore: 4,
      display: highlightDisplay,
    });

    expect(categories[0].score).toBe(4);
  });

  test('does not infer impairment from comment wording', () => {
    const categories = applyGrammarHighlightScoreClamp({
      categories: [
        {
          key: 'language_use_and_conventions',
          score: 2,
          comment: 'Meaning is not hard to read; commas only.',
        },
      ],
      rubricCategories,
      minScore: 1,
      maxScore: 4,
      display: highlightDisplay,
    });

    expect(categories[0].score).toBe(4);
  });

  test('keeps a deduction when grammarImpairsMeaning is true on that category', () => {
    const categories = applyGrammarHighlightScoreClamp({
      categories: [
        {
          key: 'language_use_and_conventions',
          score: 2,
          comment: 'Errors force the reader to reread.',
          grammarImpairsMeaning: true,
        },
      ],
      rubricCategories,
      minScore: 1,
      maxScore: 4,
      display: highlightDisplay,
    });

    expect(categories[0].score).toBe(2);
  });

  test('only clamps grammar categories', () => {
    const categories = applyGrammarHighlightScoreClamp({
      categories: [
        {
          key: 'thesis_and_content',
          score: 2,
          comment: 'Thin thesis.',
        },
        {
          key: 'language_use_and_conventions',
          score: 2,
          comment: 'Typos.',
        },
      ],
      rubricCategories,
      minScore: 1,
      maxScore: 4,
      display: highlightDisplay,
    });

    expect(categories[0].score).toBe(2);
    expect(categories[1].score).toBe(4);
  });
});
