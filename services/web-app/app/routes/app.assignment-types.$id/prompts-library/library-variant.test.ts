import { describe, expect, test } from 'bun:test';

import { resolvePromptLibraryVariant } from './library-variant';

describe('resolvePromptLibraryVariant', () => {
  test('Class Starter gets the open-ended prompt library', () => {
    expect(
      resolvePromptLibraryVariant({
        title: 'Class Starter',
        dailyPagesSplitEnabled: true,
      })
    ).toBe('class-starter');
  });

  test('Class Starter does not wait on the split flag', () => {
    expect(
      resolvePromptLibraryVariant({
        title: 'class starter',
        dailyPagesSplitEnabled: false,
      })
    ).toBe('class-starter');
  });

  test('Daily Pages keeps its library exactly as it is while the flag is off', () => {
    expect(
      resolvePromptLibraryVariant({
        title: 'Daily Pages',
        dailyPagesSplitEnabled: false,
      })
    ).toBe('daily-pages-legacy');
  });

  test('Daily Pages reads as a reflection assignment once the flag is on', () => {
    expect(
      resolvePromptLibraryVariant({
        title: 'Daily Pages',
        dailyPagesSplitEnabled: true,
      })
    ).toBe('daily-pages-reflection');
  });

  test('matches the title the way the route always has: trimmed, case-insensitive', () => {
    expect(
      resolvePromptLibraryVariant({
        title: '  DAILY pages  ',
        dailyPagesSplitEnabled: false,
      })
    ).toBe('daily-pages-legacy');
  });

  test('any other assignment type gets no open-ended library', () => {
    expect(
      resolvePromptLibraryVariant({
        title: 'The Thesis-Driven Essay',
        dailyPagesSplitEnabled: true,
      })
    ).toBeNull();
    expect(
      resolvePromptLibraryVariant({ title: '', dailyPagesSplitEnabled: true })
    ).toBeNull();
  });
});
