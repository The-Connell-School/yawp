// Data model + pure facet helpers for the Thesis-Driven Essay prompt library.
//
// Unlike Daily Pages (short, one-line free-write prompts), thesis-driven essay
// prompts are multi-paragraph: an opening directive, a paragraph that gives the
// student freedom to find their own angle, and a closing note about formal
// organization. Each prompt therefore carries a short `title` for the library
// row plus the full multi-paragraph `prompt` body that becomes the assignment.

/**
 * The primary way prompts are grouped, mirroring the categories a teacher
 * thinks in: a theme, one specific text, any text the class read, another
 * subject like history or science, or a general question that needs no text.
 */
export type ThesisCategory =
  | 'theme'
  | 'single-text'
  | 'applied-to-text'
  | 'history-subject'
  | 'general';

/** The kind of thinking the prompt primarily asks the student to do. */
export type ThesisCognitiveMove =
  | 'argue-a-position'
  | 'analyze'
  | 'compare'
  | 'evaluate'
  | 'interpret'
  | 'propose-a-solution'
  | 'reflect'
  | 'synthesize';

/** Whether the prompt leans on a source text. */
export type ThesisSourceNeed = 'none' | 'optional' | 'required';

export type GradeBand = '9' | '10' | '11' | '12';

export type ThesisPrompt = {
  id: string;
  /** Short label shown as the row heading (the full directive lives in `prompt`). */
  title: string;
  /** Full multi-paragraph prompt used verbatim as the assignment. */
  prompt: string;
  category: ThesisCategory;
  subjects: string[];
  /** Named texts this prompt is anchored to, if any. Empty for general prompts. */
  textsOrUnits: string[];
  cognitiveMoves: ThesisCognitiveMove[];
  sourceNeed: ThesisSourceNeed;
  gradeBands: GradeBand[];
};

export type FacetValues = {
  categories: ThesisCategory[];
  subjects: string[];
  textsOrUnits: string[];
  cognitiveMoves: ThesisCognitiveMove[];
  sourceNeeds: ThesisSourceNeed[];
  gradeBands: GradeBand[];
};

export type OptionCounts = {
  categories: Record<string, number>;
  subjects: Record<string, number>;
  textsOrUnits: Record<string, number>;
  cognitiveMoves: Record<string, number>;
  sourceNeeds: Record<string, number>;
  gradeBands: Record<string, number>;
};

export const CATEGORY_LABEL: Record<ThesisCategory, string> = {
  theme: 'Theme',
  'single-text': 'A specific text',
  'applied-to-text': 'Any text',
  'history-subject': 'History & other subjects',
  general: 'General (no text)',
};

export const COGNITIVE_MOVE_LABEL: Record<ThesisCognitiveMove, string> = {
  'argue-a-position': 'Argue a position',
  analyze: 'Analyze',
  compare: 'Compare',
  evaluate: 'Evaluate',
  interpret: 'Interpret',
  'propose-a-solution': 'Propose a solution',
  reflect: 'Reflect',
  synthesize: 'Synthesize',
};

export const SOURCE_NEED_LABEL: Record<ThesisSourceNeed, string> = {
  none: 'No source needed',
  optional: 'Source optional',
  required: 'Source required',
};

/** Stable display order for facets that are not simply alphabetical. */
export const CATEGORY_ORDER: ThesisCategory[] = [
  'theme',
  'single-text',
  'applied-to-text',
  'history-subject',
  'general',
];

export const SOURCE_NEED_ORDER: ThesisSourceNeed[] = [
  'required',
  'optional',
  'none',
];

export const GRADE_ORDER: GradeBand[] = ['9', '10', '11', '12'];

/**
 * Guidance shown to teachers above the library — echoes the philosophy of the
 * source prompts: give students room to find an angle they actually care about.
 */
export const TEACHING_NOTES: string[] = [
  'Give students freedom to explore an aspect of the topic they care about — an original position beats an assigned one.',
  'Stuck students should go where the emotional charge is: what they loved, what grabbed them, what upset them.',
  'Every prompt asks for a formal, thesis-driven essay: introduction, thesis statement, body paragraphs, and a conclusion.',
];

/** URL search-param keys. Prefixed `tp_` so they never collide with Daily Pages. */
export const FACET_KEYS = {
  search: 'tp_q',
  categories: 'tp_cat',
  subjects: 'tp_subjects',
  textsOrUnits: 'tp_texts',
  cognitiveMoves: 'tp_moves',
  sourceNeeds: 'tp_source',
  gradeBands: 'tp_grades',
} as const;

export type ThesisLibraryFilters = {
  q: string;
  categories: Set<string>;
  subjects: Set<string>;
  textsOrUnits: Set<string>;
  cognitiveMoves: Set<string>;
  sourceNeeds: Set<string>;
  gradeBands: Set<string>;
};

export function buildFacets(prompts: ThesisPrompt[]): FacetValues {
  const categories = new Set<ThesisCategory>();
  const subjects = new Set<string>();
  const textsOrUnits = new Set<string>();
  const cognitiveMoves = new Set<ThesisCognitiveMove>();
  const sourceNeeds = new Set<ThesisSourceNeed>();
  const gradeBands = new Set<GradeBand>();

  for (const prompt of prompts) {
    categories.add(prompt.category);
    prompt.subjects.forEach((subject) => subjects.add(subject));
    prompt.textsOrUnits.forEach((textOrUnit) => textsOrUnits.add(textOrUnit));
    prompt.cognitiveMoves.forEach((move) => cognitiveMoves.add(move));
    sourceNeeds.add(prompt.sourceNeed);
    prompt.gradeBands.forEach((gradeBand) => gradeBands.add(gradeBand));
  }

  return {
    categories: CATEGORY_ORDER.filter((value) => categories.has(value)),
    subjects: [...subjects].sort(),
    textsOrUnits: [...textsOrUnits].sort(),
    cognitiveMoves: [...cognitiveMoves].sort(),
    sourceNeeds: SOURCE_NEED_ORDER.filter((value) => sourceNeeds.has(value)),
    gradeBands: GRADE_ORDER.filter((value) => gradeBands.has(value)),
  };
}

export function buildOptionCounts(prompts: ThesisPrompt[]): OptionCounts {
  const counts: OptionCounts = {
    categories: {},
    subjects: {},
    textsOrUnits: {},
    cognitiveMoves: {},
    sourceNeeds: {},
    gradeBands: {},
  };
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

  for (const prompt of prompts) {
    bump(counts.categories, prompt.category);
    prompt.subjects.forEach((subject) => bump(counts.subjects, subject));
    prompt.textsOrUnits.forEach((textOrUnit) =>
      bump(counts.textsOrUnits, textOrUnit)
    );
    prompt.cognitiveMoves.forEach((move) => bump(counts.cognitiveMoves, move));
    bump(counts.sourceNeeds, prompt.sourceNeed);
    prompt.gradeBands.forEach((gradeBand) => bump(counts.gradeBands, gradeBand));
  }

  return counts;
}

export function readFilters(url: URL): ThesisLibraryFilters {
  const readSet = (key: string) =>
    new Set(url.searchParams.get(key)?.split(',').filter(Boolean) ?? []);

  return {
    q: (url.searchParams.get(FACET_KEYS.search) ?? '').trim().toLowerCase(),
    categories: readSet(FACET_KEYS.categories),
    subjects: readSet(FACET_KEYS.subjects),
    textsOrUnits: readSet(FACET_KEYS.textsOrUnits),
    cognitiveMoves: readSet(FACET_KEYS.cognitiveMoves),
    sourceNeeds: readSet(FACET_KEYS.sourceNeeds),
    gradeBands: readSet(FACET_KEYS.gradeBands),
  };
}

export function applyFilters(
  prompts: ThesisPrompt[],
  filters: ThesisLibraryFilters
): ThesisPrompt[] {
  return prompts.filter((prompt) => {
    if (filters.categories.size && !filters.categories.has(prompt.category)) {
      return false;
    }
    if (
      filters.subjects.size &&
      !prompt.subjects.some((subject) => filters.subjects.has(subject))
    ) {
      return false;
    }
    if (
      filters.textsOrUnits.size &&
      !prompt.textsOrUnits.some((textOrUnit) =>
        filters.textsOrUnits.has(textOrUnit)
      )
    ) {
      return false;
    }
    if (
      filters.cognitiveMoves.size &&
      !prompt.cognitiveMoves.some((move) => filters.cognitiveMoves.has(move))
    ) {
      return false;
    }
    if (filters.sourceNeeds.size && !filters.sourceNeeds.has(prompt.sourceNeed)) {
      return false;
    }
    if (
      filters.gradeBands.size &&
      !prompt.gradeBands.some((gradeBand) => filters.gradeBands.has(gradeBand))
    ) {
      return false;
    }
    if (
      filters.q &&
      !prompt.title.toLowerCase().includes(filters.q) &&
      !prompt.prompt.toLowerCase().includes(filters.q)
    ) {
      return false;
    }
    return true;
  });
}
