import { describe, expect, test } from 'bun:test';
import {
  applyApEnglishLitFilters,
  buildApEnglishLitFacets,
  buildApEnglishLitOptionCounts,
  frqTypeLabel,
  pickRandomEntry,
  readApEnglishLitFilters,
  type ApEnglishLitLibraryEntry,
} from './ap-english-lit-facets';

function entry(
  overrides: Partial<ApEnglishLitLibraryEntry>,
): ApEnglishLitLibraryEntry {
  return {
    externalKey: overrides.externalKey ?? 'k',
    title: overrides.title ?? 'Title',
    prompt: overrides.prompt ?? 'Prompt body',
    frqType: overrides.frqType ?? 'poetry',
    focusSkill: overrides.focusSkill ?? 'speaker-attitude',
    difficulty: overrides.difficulty ?? 'exam-ready',
    skillEmphasis: overrides.skillEmphasis ?? 'evidence-commentary',
    suggestedWorks: overrides.suggestedWorks ?? null,
    sources: overrides.sources ?? [],
  };
}

const entries: ApEnglishLitLibraryEntry[] = [
  entry({ externalKey: 'poem', frqType: 'poetry', focusSkill: 'speaker-attitude', difficulty: 'exam-ready', title: 'Frost poem' }),
  entry({ externalKey: 'prose', frqType: 'prose', focusSkill: 'characterization', difficulty: 'intro', title: 'Austen passage' }),
  entry({ externalKey: 'arg1', frqType: 'literary_argument', focusSkill: 'moral-ambiguity', difficulty: 'exam-ready', skillEmphasis: 'sophistication', title: 'Moral ambiguity', suggestedWorks: 'Hamlet\nBeloved' }),
];

function urlWith(params: Record<string, string>): URL {
  const url = new URL('https://example.test/app/assignment-types/1');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

describe('AP English Literature library facets', () => {
  test('builds ordered facet values', () => {
    const facets = buildApEnglishLitFacets(entries);
    expect(facets.frqTypes).toEqual(['poetry', 'prose', 'literary_argument']);
    expect(facets.difficulties).toEqual(['intro', 'exam-ready']);
    expect(facets.focusSkills).toContain('moral-ambiguity');
  });

  test('counts options across entries', () => {
    const counts = buildApEnglishLitOptionCounts(entries);
    expect(counts.frqTypes.poetry).toBe(1);
    expect(counts.difficulties['exam-ready']).toBe(2);
    expect(counts.skillEmphases.sophistication).toBe(1);
  });

  test('filters by a single facet', () => {
    const filters = readApEnglishLitFilters(urlWith({ ael_type: 'poetry' }));
    const result = applyApEnglishLitFilters(entries, filters);
    expect(result.map((e) => e.externalKey)).toEqual(['poem']);
  });

  test('ORs within a facet and ANDs across facets', () => {
    const filters = readApEnglishLitFilters(
      urlWith({ ael_type: 'poetry,prose', ael_difficulty: 'intro' }),
    );
    const result = applyApEnglishLitFilters(entries, filters);
    expect(result.map((e) => e.externalKey)).toEqual(['prose']);
  });

  test('search matches title, prompt, and suggested works', () => {
    const byTitle = applyApEnglishLitFilters(
      entries,
      readApEnglishLitFilters(urlWith({ ael_q: 'austen' })),
    );
    expect(byTitle.map((e) => e.externalKey)).toEqual(['prose']);

    const byWork = applyApEnglishLitFilters(
      entries,
      readApEnglishLitFilters(urlWith({ ael_q: 'beloved' })),
    );
    expect(byWork.map((e) => e.externalKey)).toEqual(['arg1']);
  });

  test('no filters returns everything', () => {
    const filters = readApEnglishLitFilters(urlWith({}));
    expect(applyApEnglishLitFilters(entries, filters)).toHaveLength(3);
  });

  test('frqTypeLabel maps known types and humanizes the rest', () => {
    expect(frqTypeLabel('literary_argument')).toBe('Literary Argument');
    expect(frqTypeLabel('poetry')).toBe('Poetry Analysis');
    expect(frqTypeLabel('something-else')).toBe('Something Else');
  });

  test('pickRandomEntry chooses from the (filtered) list using the injected RNG', () => {
    // Randomly picks within bounds — here from the poetry-only filtered set.
    const poetryOnly = applyApEnglishLitFilters(
      entries,
      readApEnglishLitFilters(urlWith({ ael_type: 'poetry' })),
    );
    expect(pickRandomEntry(poetryOnly, () => 0)?.externalKey).toBe('poem');

    // A value near 1 lands on the last element without going out of bounds.
    expect(pickRandomEntry(entries, () => 0)?.externalKey).toBe('poem');
    expect(pickRandomEntry(entries, () => 0.5)?.externalKey).toBe('prose');
    expect(pickRandomEntry(entries, () => 0.999)?.externalKey).toBe('arg1');
  });

  test('pickRandomEntry returns null for an empty list', () => {
    expect(pickRandomEntry([], () => 0)).toBeNull();
  });
});
