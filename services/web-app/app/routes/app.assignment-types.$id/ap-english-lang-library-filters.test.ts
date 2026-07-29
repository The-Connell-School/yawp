import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LANG_FACET_KEYS,
  applyApEnglishLangFilters,
  buildApEnglishLangFacets,
  buildApEnglishLangOptionCounts,
  readApEnglishLangFilters,
  type ApEnglishLangFilterableEntry,
  type ApEnglishLangSourcePreview,
} from './ap-english-lang-library-filters';

function makeSource(position: number): ApEnglishLangSourcePreview {
  return {
    position,
    title: `Source ${position}`,
    attribution: 'Composed for this exercise',
    body: 'Source body text.',
  };
}

function makeEntry(
  overrides: Partial<ApEnglishLangFilterableEntry> = {}
): ApEnglishLangFilterableEntry {
  return {
    externalKey: 'entry-1',
    title: 'The Gettysburg Address — Rhetorical Analysis',
    prompt: 'Analyze the rhetorical choices Lincoln makes.',
    frqType: 'rhetorical_analysis',
    focusSkill: 'rhetorical-situation',
    difficulty: 'exam-ready',
    sources: [],
    ...overrides,
  };
}

const synthesis = makeEntry({
  externalKey: 'synthesis-1',
  title: 'School Start Times — Synthesis',
  prompt: 'Argue a position on later school start times.',
  frqType: 'synthesis',
  focusSkill: 'source-integration',
  difficulty: 'exam-ready',
  sources: [1, 2, 3, 4, 5, 6].map(makeSource),
});
const rhetorical = makeEntry();
const argument = makeEntry({
  externalKey: 'argument-1',
  title: 'The Role of Failure — Argument',
  prompt: 'Take a position on what failure teaches.',
  frqType: 'argument',
  focusSkill: 'counterargument',
  difficulty: 'developing',
});
const entries = [synthesis, rhetorical, argument];

function filtersFrom(search: string) {
  return readApEnglishLangFilters(
    new URL(`https://yawp.test/app/assignment-types/at-1${search}`)
  );
}

describe('readApEnglishLangFilters', () => {
  test('returns empty filters when no params are present', () => {
    const filters = filtersFrom('');

    expect(filters.q).toBe('');
    expect(filters.frqTypes.size).toBe(0);
    expect(filters.focusSkills.size).toBe(0);
    expect(filters.difficulties.size).toBe(0);
  });

  test('normalizes the search term and splits comma separated facets', () => {
    const filters = filtersFrom(
      `?${AP_ENGLISH_LANG_FACET_KEYS.search}=%20Gettysburg%20` +
        `&${AP_ENGLISH_LANG_FACET_KEYS.frqTypes}=argument,synthesis` +
        `&${AP_ENGLISH_LANG_FACET_KEYS.difficulties}=developing`
    );

    expect(filters.q).toBe('gettysburg');
    expect([...filters.frqTypes].sort()).toEqual(['argument', 'synthesis']);
    expect([...filters.difficulties]).toEqual(['developing']);
  });

  test('ignores empty facet segments', () => {
    const filters = filtersFrom(
      `?${AP_ENGLISH_LANG_FACET_KEYS.focusSkills}=,,counterargument,`
    );

    expect([...filters.focusSkills]).toEqual(['counterargument']);
  });
});

describe('applyApEnglishLangFilters', () => {
  test('returns every entry when no filters are set', () => {
    expect(applyApEnglishLangFilters(entries, filtersFrom(''))).toEqual(entries);
  });

  test('matches the search term against the title', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.search}=gettysburg`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['entry-1']);
  });

  test('matches the search term against the prompt body', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.search}=later%20school%20start`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['synthesis-1']);
  });

  test('matches the search term against the focus skill', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.search}=counterargument`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['argument-1']);
  });

  test('search is case insensitive', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.search}=GETTYSBURG`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['entry-1']);
  });

  test('filters by FRQ type', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.frqTypes}=argument`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['argument-1']);
  });

  test('treats multiple values within a facet as OR', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(
        `?${AP_ENGLISH_LANG_FACET_KEYS.frqTypes}=argument,rhetorical_analysis`
      )
    );

    expect(result.map((entry) => entry.externalKey).sort()).toEqual([
      'argument-1',
      'entry-1',
    ]);
  });

  test('treats separate facets as AND', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(
        `?${AP_ENGLISH_LANG_FACET_KEYS.frqTypes}=argument` +
          `&${AP_ENGLISH_LANG_FACET_KEYS.difficulties}=exam-ready`
      )
    );

    expect(result).toEqual([]);
  });

  test('combines search with facet filters', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(
        `?${AP_ENGLISH_LANG_FACET_KEYS.search}=position` +
          `&${AP_ENGLISH_LANG_FACET_KEYS.frqTypes}=argument`
      )
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['argument-1']);
  });

  test('filters by focus skill and difficulty', () => {
    expect(
      applyApEnglishLangFilters(
        entries,
        filtersFrom(
          `?${AP_ENGLISH_LANG_FACET_KEYS.focusSkills}=source-integration`
        )
      ).map((entry) => entry.externalKey)
    ).toEqual(['synthesis-1']);

    expect(
      applyApEnglishLangFilters(
        entries,
        filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.difficulties}=developing`)
      ).map((entry) => entry.externalKey)
    ).toEqual(['argument-1']);
  });

  test('preserves the incoming entry order', () => {
    const result = applyApEnglishLangFilters(
      entries,
      filtersFrom(
        `?${AP_ENGLISH_LANG_FACET_KEYS.frqTypes}=argument,synthesis`
      )
    );

    expect(result.map((entry) => entry.externalKey)).toEqual([
      'synthesis-1',
      'argument-1',
    ]);
  });
});

describe('collections', () => {
  const savedPrompt = makeEntry({
    externalKey: 'saved:abc',
    title: 'What We Owe Strangers',
    prompt: 'Write an essay that argues your position on obligation.',
    frqType: 'argument',
    focusSkill: 'line-of-reasoning',
    difficulty: 'developing',
    collection: 'mine',
    savedAt: '2026-07-28T12:00:00.000Z',
  });
  const mixed = [savedPrompt, ...entries];

  test('a curated entry with no collection reads as library', () => {
    const result = applyApEnglishLangFilters(
      mixed,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.collections}=library`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual([
      'synthesis-1',
      'entry-1',
      'argument-1',
    ]);
  });

  test('filters down to the teacher\'s own prompts', () => {
    const result = applyApEnglishLangFilters(
      mixed,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.collections}=mine`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['saved:abc']);
  });

  test('counts each collection, including an empty one', () => {
    expect(buildApEnglishLangOptionCounts(mixed).collections).toEqual({
      library: 3,
      mine: 1,
    });
    expect(buildApEnglishLangOptionCounts(entries).collections).toEqual({
      library: 3,
      mine: 0,
    });
  });

  test('a saved prompt is searchable alongside curated entries', () => {
    const result = applyApEnglishLangFilters(
      mixed,
      filtersFrom(`?${AP_ENGLISH_LANG_FACET_KEYS.search}=strangers`)
    );

    expect(result.map((entry) => entry.externalKey)).toEqual(['saved:abc']);
  });

  test('stacks with the other facets', () => {
    const result = applyApEnglishLangFilters(
      mixed,
      filtersFrom(
        `?${AP_ENGLISH_LANG_FACET_KEYS.collections}=mine` +
          `&${AP_ENGLISH_LANG_FACET_KEYS.difficulties}=exam-ready`
      )
    );

    expect(result).toEqual([]);
  });
});

describe('buildApEnglishLangFacets', () => {
  test('lists FRQ types in exam order and other facets alphabetically', () => {
    const facets = buildApEnglishLangFacets(entries);

    expect(facets.frqTypes).toEqual([
      'synthesis',
      'rhetorical_analysis',
      'argument',
    ]);
    expect(facets.focusSkills).toEqual([
      'counterargument',
      'rhetorical-situation',
      'source-integration',
    ]);
    expect(facets.difficulties).toEqual(['developing', 'exam-ready']);
  });

  test('omits values that no entry uses', () => {
    const facets = buildApEnglishLangFacets([argument]);

    expect(facets.frqTypes).toEqual(['argument']);
    expect(facets.difficulties).toEqual(['developing']);
  });

  test('orders difficulty from least to most demanding', () => {
    const facets = buildApEnglishLangFacets([
      makeEntry({ externalKey: 'a', difficulty: 'exam-ready' }),
      makeEntry({ externalKey: 'b', difficulty: 'entry' }),
      makeEntry({ externalKey: 'c', difficulty: 'developing' }),
    ]);

    expect(facets.difficulties).toEqual(['entry', 'developing', 'exam-ready']);
  });

  test('handles an empty library', () => {
    expect(buildApEnglishLangFacets([])).toEqual({
      // Both collections are always offered so "My prompts" is discoverable
      // before the teacher has saved anything.
      collections: ['library', 'mine'],
      frqTypes: [],
      focusSkills: [],
      difficulties: [],
    });
  });
});

describe('buildApEnglishLangOptionCounts', () => {
  test('counts entries per facet value', () => {
    const counts = buildApEnglishLangOptionCounts([...entries, argument]);

    expect(counts.frqTypes).toEqual({
      synthesis: 1,
      rhetorical_analysis: 1,
      argument: 2,
    });
    expect(counts.difficulties).toEqual({ 'exam-ready': 2, developing: 2 });
    expect(counts.focusSkills['counterargument']).toBe(2);
  });

  test('returns empty buckets for an empty library', () => {
    expect(buildApEnglishLangOptionCounts([])).toEqual({
      collections: { library: 0, mine: 0 },
      frqTypes: {},
      focusSkills: {},
      difficulties: {},
    });
  });
});
