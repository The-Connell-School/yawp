import { describe, expect, test } from 'bun:test';
import {
  applyFilters,
  buildFacets,
  buildOptionCounts,
  FACET_KEYS,
  readFilters,
  type ThesisPrompt,
} from './data';
import promptsRaw from './prompts.json';

const ALL = promptsRaw as ThesisPrompt[];

function makePrompt(overrides: Partial<ThesisPrompt> = {}): ThesisPrompt {
  return {
    id: 'TD-000',
    title: 'Sample',
    prompt: 'A sample thesis-driven prompt body.',
    category: 'general',
    subjects: ['Civics & society'],
    textsOrUnits: [],
    cognitiveMoves: ['argue-a-position'],
    sourceNeed: 'none',
    gradeBands: ['9', '10'],
    ...overrides,
  };
}

function url(search: string) {
  return new URL(`https://example.test/app/assignment-types/at-1${search}`);
}

describe('thesis prompts corpus', () => {
  test('is non-empty and every prompt is well-formed', () => {
    expect(ALL.length).toBeGreaterThan(0);
    const ids = new Set(ALL.map((p) => p.id));
    expect(ids.size).toBe(ALL.length);
    for (const p of ALL) {
      expect(p.title.trim().length).toBeGreaterThan(0);
      expect(p.prompt.trim().length).toBeGreaterThan(0);
      expect(p.gradeBands.length).toBeGreaterThan(0);
      expect(p.cognitiveMoves.length).toBeGreaterThan(0);
    }
  });

  test('covers all five categories the feature requires', () => {
    const categories = new Set(ALL.map((p) => p.category));
    expect(categories).toEqual(
      new Set([
        'theme',
        'single-text',
        'applied-to-text',
        'history-subject',
        'general',
      ])
    );
  });

  test('every prompt keeps the formal-organization closing instruction', () => {
    for (const p of ALL) {
      expect(p.prompt.toLowerCase()).toContain('thesis statement');
      expect(p.prompt.toLowerCase()).toContain('body paragraphs');
    }
  });

  test('general prompts need no source text; single-text prompts name a text', () => {
    for (const p of ALL) {
      if (p.category === 'general') {
        expect(p.textsOrUnits).toEqual([]);
        // General prompts stand on their own; a source may be optional but is
        // never required.
        expect(p.sourceNeed).not.toBe('required');
      }
      if (p.category === 'single-text') {
        expect(p.textsOrUnits.length).toBeGreaterThan(0);
        expect(p.sourceNeed).toBe('required');
      }
    }
  });
});

describe('buildFacets', () => {
  test('orders categories, grades, and source needs deterministically', () => {
    const prompts = [
      makePrompt({ category: 'general', sourceNeed: 'none', gradeBands: ['12'] }),
      makePrompt({
        category: 'theme',
        sourceNeed: 'required',
        gradeBands: ['9'],
      }),
      makePrompt({
        category: 'single-text',
        sourceNeed: 'optional',
        gradeBands: ['10'],
      }),
    ];
    const facets = buildFacets(prompts);
    expect(facets.categories).toEqual(['theme', 'single-text', 'general']);
    expect(facets.sourceNeeds).toEqual(['required', 'optional', 'none']);
    expect(facets.gradeBands).toEqual(['9', '10', '12']);
  });

  test('collects and sorts subjects and texts', () => {
    const facets = buildFacets([
      makePrompt({ subjects: ['Literature'], textsOrUnits: ['Macbeth'] }),
      makePrompt({
        subjects: ['Art & culture'],
        textsOrUnits: ['Romeo and Juliet'],
      }),
    ]);
    expect(facets.subjects).toEqual(['Art & culture', 'Literature']);
    expect(facets.textsOrUnits).toEqual(['Macbeth', 'Romeo and Juliet']);
  });
});

describe('buildOptionCounts', () => {
  test('counts occurrences per facet value', () => {
    const counts = buildOptionCounts([
      makePrompt({ category: 'general', gradeBands: ['9', '10'] }),
      makePrompt({ category: 'general', gradeBands: ['9'] }),
      makePrompt({ category: 'theme', gradeBands: ['11'] }),
    ]);
    expect(counts.categories.general).toBe(2);
    expect(counts.categories.theme).toBe(1);
    expect(counts.gradeBands['9']).toBe(2);
    expect(counts.gradeBands['10']).toBe(1);
  });
});

describe('readFilters + applyFilters', () => {
  test('with no params returns every prompt', () => {
    const filtered = applyFilters(ALL, readFilters(url('')));
    expect(filtered.length).toBe(ALL.length);
  });

  test('filters by category', () => {
    const filtered = applyFilters(
      ALL,
      readFilters(url(`?${FACET_KEYS.categories}=single-text`))
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((p) => p.category === 'single-text')).toBe(true);
  });

  test('filters by named text', () => {
    const filtered = applyFilters(
      ALL,
      readFilters(url(`?${FACET_KEYS.textsOrUnits}=Romeo and Juliet`))
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].textsOrUnits).toContain('Romeo and Juliet');
  });

  test('search matches title or body, case-insensitively', () => {
    const byTitle = applyFilters(
      [makePrompt({ title: 'Ambition and Its Costs' })],
      readFilters(url(`?${FACET_KEYS.search}=ambition`))
    );
    expect(byTitle.length).toBe(1);

    const byBody = applyFilters(
      [makePrompt({ title: 'Untitled', prompt: 'Discuss the valley of ashes.' })],
      readFilters(url(`?${FACET_KEYS.search}=Valley Of Ashes`))
    );
    expect(byBody.length).toBe(1);
  });

  test('combines facets as AND across facet types', () => {
    const filters = readFilters(
      url(`?${FACET_KEYS.categories}=theme&${FACET_KEYS.gradeBands}=9`)
    );
    const filtered = applyFilters(ALL, filters);
    expect(
      filtered.every(
        (p) => p.category === 'theme' && p.gradeBands.includes('9')
      )
    ).toBe(true);
  });

  test('a facet with a value that matches nothing yields an empty list', () => {
    const filtered = applyFilters(
      ALL,
      readFilters(url(`?${FACET_KEYS.subjects}=Nonexistent Subject`))
    );
    expect(filtered).toEqual([]);
  });
});
