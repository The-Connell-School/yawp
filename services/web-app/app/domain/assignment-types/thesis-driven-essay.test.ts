import { describe, expect, test } from 'bun:test';
import {
  isThesisDrivenEssayTitle,
  isThesisPromptLibraryType,
  THESIS_STATEMENT_KIND,
} from './thesis-driven-essay';

describe('isThesisDrivenEssayTitle', () => {
  test('matches the canonical thesis essay title case-insensitively', () => {
    expect(isThesisDrivenEssayTitle('The Thesis-Driven Essay')).toBe(true);
    expect(isThesisDrivenEssayTitle('  the thesis-driven essay ')).toBe(true);
  });

  test('rejects other assignment type titles', () => {
    expect(isThesisDrivenEssayTitle('The 5-Paragraph Essay')).toBe(false);
    expect(isThesisDrivenEssayTitle('Daily Pages')).toBe(false);
    expect(isThesisDrivenEssayTitle('Thesis Statement')).toBe(false);
  });
});

describe('isThesisPromptLibraryType', () => {
  test('includes thesis essay title, thesis statement title, and kind', () => {
    expect(
      isThesisPromptLibraryType({ title: 'The Thesis-Driven Essay', kind: null })
    ).toBe(true);
    expect(
      isThesisPromptLibraryType({ title: 'Thesis Statement', kind: null })
    ).toBe(true);
    expect(
      isThesisPromptLibraryType({
        title: 'Anything',
        kind: THESIS_STATEMENT_KIND,
      })
    ).toBe(true);
  });

  test('rejects unrelated types', () => {
    expect(isThesisPromptLibraryType({ title: 'Daily Pages', kind: null })).toBe(
      false
    );
  });
});
