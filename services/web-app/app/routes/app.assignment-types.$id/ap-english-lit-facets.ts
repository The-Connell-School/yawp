// Faceted-filter model for the AP English Literature prompt library.
// Mirrors the Daily Pages library facets, adapted to the AP Lit entry shape.

export type ApEnglishLitLibrarySource = {
  externalKey: string;
  position: number;
  title: string;
  attribution: string;
  body: string;
  caption: string | null;
};

export type ApEnglishLitLibraryEntry = {
  externalKey: string;
  title: string;
  prompt: string;
  frqType: string;
  focusSkill: string;
  difficulty: string | null;
  skillEmphasis: string | null;
  suggestedWorks: string | null;
  sources: ApEnglishLitLibrarySource[];
};

export type ApEnglishLitFacetValues = {
  frqTypes: string[];
  focusSkills: string[];
  difficulties: string[];
  skillEmphases: string[];
};

export type ApEnglishLitOptionCounts = {
  frqTypes: Record<string, number>;
  focusSkills: Record<string, number>;
  difficulties: Record<string, number>;
  skillEmphases: Record<string, number>;
};

export const AP_LIT_FACET_KEYS = {
  search: 'ael_q',
  frqTypes: 'ael_type',
  focusSkills: 'ael_focus',
  difficulties: 'ael_difficulty',
  skillEmphases: 'ael_emphasis',
} as const;

export const AP_LIT_FRQ_TYPE_LABEL: Record<string, string> = {
  poetry: 'Poetry Analysis',
  prose: 'Prose Fiction Analysis',
  literary_argument: 'Literary Argument',
};

const FRQ_TYPE_ORDER = ['poetry', 'prose', 'literary_argument'];
const DIFFICULTY_ORDER = ['intro', 'exam-ready'];

export function humanizeFacetValue(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function frqTypeLabel(value: string): string {
  return AP_LIT_FRQ_TYPE_LABEL[value] ?? humanizeFacetValue(value);
}

function sortWithOrder(values: Set<string>, order: string[]): string[] {
  const known = order.filter((value) => values.has(value));
  const rest = [...values].filter((value) => !order.includes(value)).sort();
  return [...known, ...rest];
}

export function buildApEnglishLitFacets(
  entries: ApEnglishLitLibraryEntry[],
): ApEnglishLitFacetValues {
  const frqTypes = new Set<string>();
  const focusSkills = new Set<string>();
  const difficulties = new Set<string>();
  const skillEmphases = new Set<string>();

  for (const entry of entries) {
    frqTypes.add(entry.frqType);
    focusSkills.add(entry.focusSkill);
    if (entry.difficulty) difficulties.add(entry.difficulty);
    if (entry.skillEmphasis) skillEmphases.add(entry.skillEmphasis);
  }

  return {
    frqTypes: sortWithOrder(frqTypes, FRQ_TYPE_ORDER),
    focusSkills: [...focusSkills].sort(),
    difficulties: sortWithOrder(difficulties, DIFFICULTY_ORDER),
    skillEmphases: [...skillEmphases].sort(),
  };
}

export function buildApEnglishLitOptionCounts(
  entries: ApEnglishLitLibraryEntry[],
): ApEnglishLitOptionCounts {
  const counts: ApEnglishLitOptionCounts = {
    frqTypes: {},
    focusSkills: {},
    difficulties: {},
    skillEmphases: {},
  };
  const bump = (bucket: Record<string, number>, key: string | null) => {
    if (!key) return;
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

  for (const entry of entries) {
    bump(counts.frqTypes, entry.frqType);
    bump(counts.focusSkills, entry.focusSkill);
    bump(counts.difficulties, entry.difficulty);
    bump(counts.skillEmphases, entry.skillEmphasis);
  }

  return counts;
}

export type ApEnglishLitFilters = {
  q: string;
  frqTypes: Set<string>;
  focusSkills: Set<string>;
  difficulties: Set<string>;
  skillEmphases: Set<string>;
};

export function readApEnglishLitFilters(url: URL): ApEnglishLitFilters {
  const readSet = (key: string) =>
    new Set(url.searchParams.get(key)?.split(',').filter(Boolean) ?? []);

  return {
    q: (url.searchParams.get(AP_LIT_FACET_KEYS.search) ?? '')
      .trim()
      .toLowerCase(),
    frqTypes: readSet(AP_LIT_FACET_KEYS.frqTypes),
    focusSkills: readSet(AP_LIT_FACET_KEYS.focusSkills),
    difficulties: readSet(AP_LIT_FACET_KEYS.difficulties),
    skillEmphases: readSet(AP_LIT_FACET_KEYS.skillEmphases),
  };
}

export function applyApEnglishLitFilters(
  entries: ApEnglishLitLibraryEntry[],
  filters: ApEnglishLitFilters,
): ApEnglishLitLibraryEntry[] {
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
    if (
      filters.skillEmphases.size &&
      !(entry.skillEmphasis && filters.skillEmphases.has(entry.skillEmphasis))
    ) {
      return false;
    }
    if (filters.q) {
      const haystack =
        `${entry.title}\n${entry.prompt}\n${entry.suggestedWorks ?? ''}`.toLowerCase();
      if (!haystack.includes(filters.q)) return false;
    }
    return true;
  });
}
