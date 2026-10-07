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

  test('Daily Pages reads the graded short-form corpus', () => {
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
  test('Class Starter and Daily Pages read the freewrite corpus', () => {
    expect(usesOpenEndedLibrary('class-starter')).toBe(true);
  });

  test('Daily Pages graded library is separate from Class Starter', () => {
    expect(usesShortFormLibrary('daily-pages-graded')).toBe(true);
    expect(usesShortFormLibrary('class-starter')).toBe(false);
    expect(usesShortFormLibrary(null)).toBe(false);
  });

  test('an assignment type with no library gets neither', () => {
    expect(usesOpenEndedLibrary(null)).toBe(false);
  });
});
