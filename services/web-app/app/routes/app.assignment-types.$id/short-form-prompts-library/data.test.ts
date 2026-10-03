import { describe, expect, test } from 'bun:test';

import {
  DAILY_PAGES_PARAGRAPH_MODES,
  enabledParagraphModes,
} from '~/domain/assignment-types/daily-pages-paragraph-modes';

import {
  COGNITIVE_MOVES,
  COGNITIVE_MOVE_LABEL,
  KIND_ORDER,
  PARAGRAPH_MODE_FOR_MOVE,
  LENGTH_TARGET_ORDER,
  SOURCE_NEED_ORDER,
  applyFilters,
  buildFacets,
  deriveTitleFromPrompt,
  buildOptionCounts,
  onlySwitchedOnMoves,
  readFilters,
  savedPromptToLibraryEntry,
  toLibraryEntries,
  type ShortFormPrompt,
} from './data';
import promptsRaw from './prompts.json';

const prompts = promptsRaw as ShortFormPrompt[];
const entries = toLibraryEntries(prompts);

describe('the short-form corpus', () => {
  test('has a usable starter size', () => {
    expect(prompts.length).toBeGreaterThanOrEqual(24);
  });

  test('gives every prompt a unique id', () => {
    const ids = prompts.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('covers every kind, so no filter lands on an empty library', () => {
    const kinds = new Set(prompts.map((prompt) => prompt.kind));
    for (const kind of KIND_ORDER) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  /**
   * The assignment is fifteen minutes of writing. A prompt long enough to need
   * its own close reading has already failed, which is the line between this
   * corpus and the thesis library's multi-paragraph directives.
   */
  test('keeps every prompt short enough to answer in one sitting', () => {
    for (const prompt of prompts) {
      expect(prompt.prompt.length).toBeLessThanOrEqual(320);
      expect(prompt.prompt.trim().length).toBeGreaterThan(0);
      expect(prompt.title.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * The rubric grades Development of Thought, so a prompt that asks only for an
   * opinion leaves the grader nothing to score. Every prompt has to ask for the
   * backing too — a reason, a case, a quotation, a counterexample.
   */
  test('every prompt asks for the support, not just the opinion', () => {
    const asksForSupport =
      /\b(reason|example|case|quote|point to|specific|evidence|counterexample|moment|line|word|sentence|why|cost|test)\b/i;

    for (const prompt of prompts) {
      expect(asksForSupport.test(prompt.prompt)).toBe(true);
    }
  });

  test('every prompt is tagged with at least one move and one grade band', () => {
    for (const prompt of prompts) {
      expect(prompt.cognitiveMoves.length).toBeGreaterThan(0);
      expect(prompt.gradeBands.length).toBeGreaterThan(0);
      expect(SOURCE_NEED_ORDER).toContain(prompt.sourceNeed);
      expect(LENGTH_TARGET_ORDER).toContain(prompt.lengthTarget);
    }
  });

  /**
   * A prompt that names a book cannot also claim to need no source — the tag is
   * what a teacher filters on when they have not assigned that text.
   */
  test('a prompt anchored to a named text admits that it needs one', () => {
    for (const prompt of prompts) {
      if (prompt.textsOrUnits.length > 0) {
        expect(prompt.sourceNeed).not.toBe('none');
      }
    }
  });

  test('a prompt that requires a source says what kind of source', () => {
    for (const prompt of prompts) {
      if (prompt.sourceNeed === 'required') {
        expect(
          prompt.textsOrUnits.length > 0 ||
            /\b(reading|passage|text|source|chapter|discussion)\b/i.test(
              prompt.prompt
            )
        ).toBe(true);
      }
    }
  });
});

/**
 * Daily Pages is deliberate academic paragraph practice. A prompt that asks
 * what changed today, with no text and no move to make, is an exploration —
 * which is a Class Starter's job — so that kind is not in this corpus.
 */
describe('the corpus is deliberate moves, not exploration', () => {
  test('carries no exit-synthesis prompts', () => {
    expect(KIND_ORDER as readonly string[]).not.toContain('exit-synthesis');
    for (const prompt of prompts) {
      expect(prompt.kind as string).not.toBe('exit-synthesis');
      expect(prompt.id.startsWith('sf-ex-')).toBe(false);
    }
  });
});

/**
 * Scranton reads Romeo and Juliet in ninth grade alongside Yawp, so the
 * library carries prompts anchored to it — weighted toward analysis, the first
 * paragraph type to ship.
 */
describe('Romeo and Juliet prompts', () => {
  const romeo = prompts.filter((prompt) =>
    prompt.textsOrUnits.includes('Romeo and Juliet')
  );

  test('there are enough to use across the unit', () => {
    expect(romeo.length).toBeGreaterThanOrEqual(5);
  });

  test('every one is offered for ninth grade', () => {
    for (const prompt of romeo) {
      expect(prompt.gradeBands).toContain('9');
    }
  });

  test('most of them are analysis', () => {
    const analysis = romeo.filter((prompt) =>
      prompt.cognitiveMoves.includes('analyze')
    );
    expect(analysis.length * 2).toBeGreaterThan(romeo.length);
  });

  test('each names the text it needs, since it cannot be answered without it', () => {
    for (const prompt of romeo) {
      expect(prompt.sourceNeed).toBe('required');
      expect(prompt.id).toMatch(/^sf-(cr|cd|od|ev|dp)-rj-\d{3}$/);
    }
  });
});

describe('short-form library filtering', () => {
  test('an empty filter returns the whole corpus', () => {
    const filters = readFilters(new URL('https://example.test/app'));
    expect(applyFilters(entries, filters).length).toBe(entries.length);
  });

  test('filters by kind', () => {
    const url = new URL('https://example.test/app?sf_kind=close-read');
    const filtered = applyFilters(entries, readFilters(url));

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((entry) => entry.kind === 'close-read')).toBe(true);
  });

  test('filters by source need, which is the one a teacher reaches for first', () => {
    const url = new URL('https://example.test/app?sf_source=none');
    const filtered = applyFilters(entries, readFilters(url));

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((entry) => entry.sourceNeed === 'none')).toBe(true);
  });

  test('searches the title and the prompt body', () => {
    const url = new URL('https://example.test/app?sf_q=counterexample');
    expect(applyFilters(entries, readFilters(url)).length).toBeGreaterThan(0);
  });

  test('combines filters as an intersection', () => {
    const url = new URL(
      'https://example.test/app?sf_kind=claim-and-defend&sf_source=none'
    );
    const filtered = applyFilters(entries, readFilters(url));

    expect(
      filtered.every(
        (entry) =>
          entry.kind === 'claim-and-defend' && entry.sourceNeed === 'none'
      )
    ).toBe(true);
  });

  /**
   * A saved prompt carries no corpus metadata, so a corpus facet has to filter
   * it out rather than match a missing value — the same rule the other two
   * libraries follow.
   */
  test('a saved prompt survives search but not a corpus facet', () => {
    const saved = savedPromptToLibraryEntry({
      id: 'saved-1',
      title: 'My own prompt',
      prompt: 'Defend a claim about ambition and give one reason.',
      savedAt: new Date().toISOString(),
    });
    const all = [saved, ...entries];

    expect(
      applyFilters(all, readFilters(new URL('https://example.test/?sf_q=ambition')))
    ).toContain(saved);
    expect(
      applyFilters(
        all,
        readFilters(new URL('https://example.test/?sf_kind=close-read'))
      )
    ).not.toContain(saved);
  });
});

/**
 * The library's cognitive modes are the paragraph types a teacher can assign,
 * and they roll out together: a mode appears in the library on the day its
 * paragraph type is switched on, and not before. Otherwise a teacher can pick
 * an Evaluate prompt that no Evaluate grading or tutoring stands behind.
 */
describe('the library shows only switched-on paragraph types', () => {
  const switchedOnKeys = enabledParagraphModes().map((mode) => mode.key);
  const shown = onlySwitchedOnMoves(entries);

  test('every mode names the paragraph type it is, under the same label', () => {
    for (const move of COGNITIVE_MOVES) {
      const mode = DAILY_PAGES_PARAGRAPH_MODES.find(
        (candidate) => candidate.key === PARAGRAPH_MODE_FOR_MOVE[move]
      );
      expect(mode?.label).toBe(COGNITIVE_MOVE_LABEL[move]);
    }
  });

  test('the Cognitive mode filter lists exactly the switched-on types', () => {
    expect(
      buildFacets(shown).cognitiveMoves.map(
        (move) => PARAGRAPH_MODE_FOR_MOVE[move]
      )
    ).toEqual(switchedOnKeys);
  });

  test('a prompt keeps only its switched-on modes', () => {
    for (const entry of shown) {
      expect(entry.cognitiveMoves.length).toBeGreaterThan(0);
      for (const move of entry.cognitiveMoves) {
        expect(switchedOnKeys).toContain(PARAGRAPH_MODE_FOR_MOVE[move]);
      }
    }
  });

  test('hides a library prompt with no switched-on mode, and only those', () => {
    const expected = entries.filter((entry) =>
      entry.cognitiveMoves.some((move) =>
        switchedOnKeys.includes(PARAGRAPH_MODE_FOR_MOVE[move])
      )
    );
    expect(shown.map((entry) => entry.id)).toEqual(
      expected.map((entry) => entry.id)
    );
    expect(shown.length).toBeLessThan(entries.length);
  });

  test('never hides a prompt the teacher saved', () => {
    const saved = savedPromptToLibraryEntry({
      id: 'saved-1',
      title: 'My own prompt',
      prompt: 'Compare two characters and name the one difference that matters.',
      savedAt: new Date().toISOString(),
    });
    expect(onlySwitchedOnMoves([saved, ...entries])).toContain(saved);
  });
});

describe('short-form library facets', () => {
  test('offers both collections even before anything is saved', () => {
    expect(buildFacets(entries).collections).toEqual(['library', 'mine']);
  });

  test('orders kinds, source needs and lengths deliberately, not alphabetically', () => {
    const facets = buildFacets(entries);

    expect(facets.kinds).toEqual(
      KIND_ORDER.filter((kind) => facets.kinds.includes(kind))
    );
    expect(facets.sourceNeeds).toEqual(
      SOURCE_NEED_ORDER.filter((need) => facets.sourceNeeds.includes(need))
    );
    expect(facets.lengthTargets).toEqual(
      LENGTH_TARGET_ORDER.filter((target) =>
        facets.lengthTargets.includes(target)
      )
    );
  });

  test('counts every prompt exactly once per facet it carries', () => {
    const counts = buildOptionCounts(entries);
    const kindTotal = Object.values(counts.kinds).reduce((a, b) => a + b, 0);

    expect(kindTotal).toBe(entries.length);
    expect(counts.collections.library).toBe(entries.length);
    expect(counts.collections.mine).toBe(0);
  });
});

/**
 * Saved prompts come from the same store the Class Starter library uses, which
 * records no title — that library shows the prompt text as the row. This one
 * has a title column, so a saved prompt needs one derived.
 */
describe('deriveTitleFromPrompt', () => {
  test('uses the first sentence when it is short enough to be a heading', () => {
    expect(
      deriveTitleFromPrompt('Was the ending earned? Argue from one detail.')
    ).toBe('Was the ending earned?');
  });

  test('truncates on a word boundary rather than mid-word', () => {
    const title = deriveTitleFromPrompt(
      'Define success the way the main character would define it and then point to the exact moment where that definition fails them completely'
    );

    expect(title.length).toBeLessThanOrEqual(72);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });

  test('falls back to a label rather than an empty heading', () => {
    expect(deriveTitleFromPrompt('   ')).toBe('Saved prompt');
    expect(deriveTitleFromPrompt('')).toBe('Saved prompt');
  });

  test('collapses whitespace so a pasted prompt does not break the row', () => {
    expect(deriveTitleFromPrompt('Two   lines\n\nof prompt.')).toBe(
      'Two lines of prompt.'
    );
  });
});
