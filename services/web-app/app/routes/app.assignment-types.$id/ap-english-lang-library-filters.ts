/**
 * Search and faceted filtering for the AP English Language prompt library.
 *
 * Mirrors the Daily Pages prompts library: filter state lives in the URL so a
 * filtered library is linkable and survives a refresh, and the loader does the
 * filtering server-side against the full entry list.
 */

export type ApEnglishLangFilterableEntry = {
  externalKey: string;
  title: string;
  prompt: string;
  frqType: string;
  focusSkill: string;
  difficulty: string | null;
  sources: Array<unknown>;
};

export type ApEnglishLangFacetValues = {
  frqTypes: string[];
  focusSkills: string[];
  difficulties: string[];
};

export type ApEnglishLangOptionCounts = {
  frqTypes: Record<string, number>;
  focusSkills: Record<string, number>;
  difficulties: Record<string, number>;
};

export type ApEnglishLangLibraryFilters = {
  q: string;
  frqTypes: Set<string>;
  focusSkills: Set<string>;
  difficulties: Set<string>;
};

export const AP_ENGLISH_LANG_FACET_KEYS = {
  search: 'ael_q',
  frqTypes: 'ael_frq',
  focusSkills: 'ael_skill',
  difficulties: 'ael_difficulty',
} as const;

export const AP_ENGLISH_LANG_FRQ_TYPE_LABELS: Record<string, string> = {
  synthesis: 'Synthesis',
  rhetorical_analysis: 'Rhetorical Analysis',
  argument: 'Argument',
};

/** Exam order: Q1 synthesis, Q2 rhetorical analysis, Q3 argument. */
const FRQ_TYPE_ORDER = ['synthesis', 'rhetorical_analysis', 'argument'];

/** Least to most demanding, matching how the library data grades a prompt. */
const DIFFICULTY_ORDER = ['entry', 'developing', 'exam-ready'];

export function formatApEnglishLangFrqType(frqType: string) {
  return AP_ENGLISH_LANG_FRQ_TYPE_LABELS[frqType] ?? frqType;
}

export function formatApEnglishLangFacetValue(value: string) {
  const spaced = value.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function orderedBy(order: string[], values: Set<string>) {
  const known = order.filter((value) => values.has(value));
  const unknown = [...values].filter((value) => !order.includes(value)).sort();
  return [...known, ...unknown];
}

export function buildApEnglishLangFacets(
  entries: ApEnglishLangFilterableEntry[]
): ApEnglishLangFacetValues {
  const frqTypes = new Set<string>();
  const focusSkills = new Set<string>();
  const difficulties = new Set<string>();

  for (const entry of entries) {
    frqTypes.add(entry.frqType);
    focusSkills.add(entry.focusSkill);
    if (entry.difficulty) difficulties.add(entry.difficulty);
  }

  return {
    frqTypes: orderedBy(FRQ_TYPE_ORDER, frqTypes),
    focusSkills: [...focusSkills].sort(),
    difficulties: orderedBy(DIFFICULTY_ORDER, difficulties),
  };
}

export function buildApEnglishLangOptionCounts(
  entries: ApEnglishLangFilterableEntry[]
): ApEnglishLangOptionCounts {
  const counts: ApEnglishLangOptionCounts = {
    frqTypes: {},
    focusSkills: {},
    difficulties: {},
  };
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

  for (const entry of entries) {
    bump(counts.frqTypes, entry.frqType);
    bump(counts.focusSkills, entry.focusSkill);
    if (entry.difficulty) bump(counts.difficulties, entry.difficulty);
  }

  return counts;
}

export function readApEnglishLangFilters(url: URL): ApEnglishLangLibraryFilters {
  const readSet = (key: string) =>
    new Set(url.searchParams.get(key)?.split(',').filter(Boolean) ?? []);

  return {
    q: (url.searchParams.get(AP_ENGLISH_LANG_FACET_KEYS.search) ?? '')
      .trim()
      .toLowerCase(),
    frqTypes: readSet(AP_ENGLISH_LANG_FACET_KEYS.frqTypes),
    focusSkills: readSet(AP_ENGLISH_LANG_FACET_KEYS.focusSkills),
    difficulties: readSet(AP_ENGLISH_LANG_FACET_KEYS.difficulties),
  };
}

export function applyApEnglishLangFilters<
  Entry extends ApEnglishLangFilterableEntry,
>(entries: Entry[], filters: ApEnglishLangLibraryFilters): Entry[] {
  return entries.filter((entry) => {
    if (filters.frqTypes.size && !filters.frqTypes.has(entry.frqType)) {
      return false;
    }
    if (filters.focusSkills.size && !filters.focusSkills.has(entry.focusSkill)) {
      return false;
    }
    if (
      filters.difficulties.size &&
      !(entry.difficulty && filters.difficulties.has(entry.difficulty))
    ) {
      return false;
    }
    if (filters.q) {
      const haystack = [
        entry.title,
        entry.prompt,
        entry.focusSkill,
        formatApEnglishLangFrqType(entry.frqType),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(filters.q)) return false;
    }
    return true;
  });
}
