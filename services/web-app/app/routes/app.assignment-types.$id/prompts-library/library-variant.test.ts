import { describe, expect, test } from 'bun:test';

import {
  resolvePromptLibraryVariant,
  usesOpenEndedLibrary,
  usesShortFormLibrary,
} from './library-variant';

describe('resolvePromptLibraryVariant', () => {
  test('Class Starter gets the open-ended freewrite library', () => {
    expect(resolvePromptLibraryVariant({ title: 'Class Starter' })).toBe(
      'class-starter'
    );
  });

  /**
   * Daily Pages is the graded assignment now, so it reads the short-form
   * corpus — whose prompts ask for the backing the rubric scores — rather than
   * borrowing the freewrite corpus it used to share with Class Starter.
   */
  test('Daily Pages gets the graded short-form library', () => {
    expect(resolvePromptLibraryVariant({ title: 'Daily Pages' })).toBe(
      'daily-pages-graded'
    );
  });

  test('matches the title the way the route always has: trimmed, case-insensitive', () => {
    expect(resolvePromptLibraryVariant({ title: '  DAILY pages  ' })).toBe(
      'daily-pages-graded'
    );
    expect(resolvePromptLibraryVariant({ title: 'CLASS STARTER' })).toBe(
      'class-starter'
    );
  });

  test('any other assignment type gets no prompt library', () => {
    expect(
      resolvePromptLibraryVariant({ title: 'The Thesis-Driven Essay' })
    ).toBeNull();
    expect(resolvePromptLibraryVariant({ title: '' })).toBeNull();
  });
});

describe('which library a variant gets', () => {
  test('Class Starter is the only reader of the freewrite corpus', () => {
    expect(usesOpenEndedLibrary('class-starter')).toBe(true);
    expect(usesOpenEndedLibrary('daily-pages-graded')).toBe(false);
  });

  test('Daily Pages is the only reader of the short-form corpus', () => {
    expect(usesShortFormLibrary('daily-pages-graded')).toBe(true);
    expect(usesShortFormLibrary('class-starter')).toBe(false);
  });

  test('an assignment type with no library gets neither', () => {
    expect(usesOpenEndedLibrary(null)).toBe(false);
    expect(usesShortFormLibrary(null)).toBe(false);
  });
});
