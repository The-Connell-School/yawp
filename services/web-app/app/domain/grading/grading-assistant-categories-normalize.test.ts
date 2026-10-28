import { describe, expect, test } from 'bun:test';
import cristoRey from '~/domain/rubrics/library/cristo-rey-hornbuckle-five-paragraph-essay.json';
import { expandGradingAssistantCategoriesInput } from './grading-assistant-categories-normalize';

describe('expandGradingAssistantCategoriesInput', () => {
  const categories = cristoRey.rubric.categories;

  test('converts a keyed categories object into an array', () => {
    const expanded = expandGradingAssistantCategoriesInput(
      {
        categories: {
          thesis_and_purpose: { score: 3, comment: 'Clear thesis.' },
          evidence: { band: 'Proficient', comment: 'Two quotes.' },
        },
      },
      categories
    ) as Array<{ key: string; score: number }>;

    expect(expanded).toEqual([
      { key: 'thesis_and_purpose', score: 3, comment: 'Clear thesis.' },
      { key: 'evidence', score: 3, comment: 'Two quotes.', band: 'Proficient' },
    ]);
  });

  test('expands a bare category-key map at the top level', () => {
    const expanded = expandGradingAssistantCategoriesInput(
      {
        thesis_and_purpose: { score: 4, comment: 'Strong.' },
        evidence: { score: 2, comment: 'Thin.' },
      },
      categories
    ) as Array<{ key: string; score: number }>;

    expect(expanded).toEqual([
      { key: 'thesis_and_purpose', score: 4, comment: 'Strong.' },
      { key: 'evidence', score: 2, comment: 'Thin.' },
    ]);
  });

  test('coerces band labels to numeric scores using rubric bands', () => {
    const expanded = expandGradingAssistantCategoriesInput(
      {
        categories: [
          { key: 'thesis_and_purpose', score: 'Advanced', comment: 'Strong.' },
          { key: 'evidence', score: 'beginning', comment: 'Thin.' },
        ],
      },
      categories
    ) as Array<{ key: string; score: number }>;

    expect(expanded[0]?.score).toBe(4);
    expect(expanded[1]?.score).toBe(1);
  });
});
