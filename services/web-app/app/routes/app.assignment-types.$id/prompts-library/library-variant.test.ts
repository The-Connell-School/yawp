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

  test('Daily Pages shares the open-ended library after short-form retirement', () => {
    expect(resolvePromptLibraryVariant({ title: 'Daily Pages' })).toBe(
      'class-starter'
    );
  });

  test('matches the title the way the route always has: trimmed, case-insensitive', () => {
    expect(resolvePromptLibraryVariant({ title: '  DAILY pages  ' })).toBe(
      'class-starter'
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

  test('short-form library is retired', () => {
    expect(usesShortFormLibrary('class-starter')).toBe(false);
    expect(usesShortFormLibrary(null)).toBe(false);
  });

  test('an assignment type with no library gets neither', () => {
    expect(usesOpenEndedLibrary(null)).toBe(false);
  });
});
