// Data model + pure facet helpers for the Daily Pages short-form prompt library.
//
// Daily Pages sits between the two libraries that already exist, and its prompts
// have to do a job neither of theirs does.
//
// A Class Starter prompt (`../prompts-library`) is one line and ungraded, so it
// can stop at an invitation: "Agree or disagree." A thesis prompt
// (`../thesis-prompts-library`) is multi-paragraph and ends by naming a formal
// shape: introduction, thesis, body, conclusion.
//
// A Daily Pages prompt is short like the first and graded like the second. That
// combination is the whole design constraint: the rubric scores Depth of
// Thought and Development of Thought, so a prompt that asks only for an opinion
// leaves the grader nothing to score. Every prompt here therefore asks for the
// backing as well — a reason, a case, a quotation, a counterexample — and says
// what a finished answer looks like, in a piece a student can write in one
// sitting. A test enforces both.

/**
 * The shape of the thinking a prompt sets up. Chosen so a teacher can pick by
 * what they want to grade rather than by topic — these are the six patterns
 * that produce something the short-form rubric can actually score.
 */
export type ShortFormPromptKind =
  | 'close-read'
  | 'claim-and-defend'
  | 'one-difference'
  | 'evaluate-a-choice'
  | 'define-precisely'
  | 'exit-synthesis';

/**
 * The analytic moves, deliberately not the Class Starter set. That library
 * leans on `introspect` and `tell-a-story`, which are the right moves for a
 * warm-up and the wrong ones for a piece graded on development.
 */
export type ShortFormCognitiveMove =
  | 'analyze'
  | 'argue-a-position'
  | 'compare'
  | 'define-a-term'
  | 'evaluate'
  | 'interpret'
  | 'synthesize';

/**
 * Whether the prompt leans on a source text. Carried over from the thesis
 * library because it is the filter a teacher reaches for first: most of these
 * follow a reading, and the ones that do not are the ones you can assign on a
 * day the class has read nothing.
 */
export type ShortFormSourceNeed = 'none' | 'optional' | 'required';

/**
 * What a finished answer looks like. Exists because the rubric refuses to
 * reward length, and a student cannot act on that unless the assignment says
 * where the finish line is.
 */
export type ShortFormLengthTarget = 'paragraph' | 'half-page' | 'page';

export type GradeBand = '9' | '10' | '11' | '12';

export type ShortFormPrompt = {
  id: string;
  /** Short label shown as the row heading; the directive lives in `prompt`. */
  title: string;
  /** The assignment text, used verbatim. Short by contract — see the tests. */
  prompt: string;
  kind: ShortFormPromptKind;
  cognitiveMoves: ShortFormCognitiveMove[];
  sourceNeed: ShortFormSourceNeed;
  lengthTarget: ShortFormLengthTarget;
  /** Named texts or units this prompt is anchored to. Empty for general ones. */
  textsOrUnits: string[];
  themes: string[];
  gradeBands: GradeBand[];
};

/**
 * Which collection a row comes from: the fixed corpus that ships with the app,
 * or a prompt this teacher generated and saved ("My prompts").
 */
export type ShortFormCollection = 'library' | 'mine';

/** A prompt the teacher generated and saved, as returned by the loader. */
export type SavedShortFormPrompt = {
  id: string;
  title: string;
  prompt: string;
  /** ISO timestamp of when it was saved. */
  savedAt: string;
};

/**
 * A row in the library. Corpus prompts bring their full facet metadata; saved
 * prompts are free-form, so their facet fields are empty/null and they only
 * match the search box and the "My prompts" collection filter.
 */
export type ShortFormLibraryEntry = {
  id: string;
  title: string;
  prompt: string;
  collection: ShortFormCollection;
  kind: ShortFormPromptKind | null;
  cognitiveMoves: ShortFormCognitiveMove[];
  sourceNeed: ShortFormSourceNeed | null;
  lengthTarget: ShortFormLengthTarget | null;
  textsOrUnits: string[];
  themes: string[];
  gradeBands: GradeBand[];
  /** Present only on saved prompts. */
  savedAt?: string;
};

export function toLibraryEntry(prompt: ShortFormPrompt): ShortFormLibraryEntry {
  return { ...prompt, collection: 'library' };
}

export function toLibraryEntries(
  prompts: ShortFormPrompt[]
): ShortFormLibraryEntry[] {
  return prompts.map(toLibraryEntry);
}

const SAVED_TITLE_MAX = 72;

/**
 * A heading for a saved prompt. The saved-prompt store records no title — the
 * Class Starter library shows the prompt text as the row and needs none — so
 * one is derived from the prompt's own first sentence.
 */
export function deriveTitleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Saved prompt';

  const firstSentence = normalized.match(/^[^.?!]*[.?!]/)?.[0]?.trim();
  const candidate =
    firstSentence && firstSentence.length <= SAVED_TITLE_MAX
      ? firstSentence
      : normalized;
  if (candidate.length <= SAVED_TITLE_MAX) return candidate;

  const clipped = candidate.slice(0, SAVED_TITLE_MAX - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export function savedPromptToLibraryEntry(
  saved: SavedShortFormPrompt
): ShortFormLibraryEntry {
  return {
    id: saved.id,
    title: saved.title,
    prompt: saved.prompt,
    collection: 'mine',
    kind: null,
    cognitiveMoves: [],
    sourceNeed: null,
    lengthTarget: null,
    textsOrUnits: [],
    themes: [],
    gradeBands: [],
    savedAt: saved.savedAt,
  };
}

export type FacetValues = {
  collections: ShortFormCollection[];
  kinds: ShortFormPromptKind[];
  cognitiveMoves: ShortFormCognitiveMove[];
  sourceNeeds: ShortFormSourceNeed[];
  lengthTargets: ShortFormLengthTarget[];
  textsOrUnits: string[];
  themes: string[];
  gradeBands: GradeBand[];
};

export type OptionCounts = {
  collections: Record<string, number>;
  kinds: Record<string, number>;
  cognitiveMoves: Record<string, number>;
  sourceNeeds: Record<string, number>;
  lengthTargets: Record<string, number>;
  textsOrUnits: Record<string, number>;
  themes: Record<string, number>;
  gradeBands: Record<string, number>;
};

export const COLLECTION_LABEL: Record<ShortFormCollection, string> = {
  library: 'Library',
  mine: 'My prompts',
};

export const COLLECTION_ORDER: ShortFormCollection[] = ['library', 'mine'];

export const KIND_LABEL: Record<ShortFormPromptKind, string> = {
  'close-read': 'Close-read a passage',
  'claim-and-defend': 'Claim and defend',
  'one-difference': 'Two things, one difference',
  'evaluate-a-choice': 'Evaluate a choice',
  'define-precisely': 'Define precisely',
  'exit-synthesis': 'Exit-ticket synthesis',
};

export const KIND_DESCRIPTION: Record<ShortFormPromptKind, string> = {
  'close-read':
    'Sends the student back into the text for specific words. Scores well on Depth when they notice something the passage does not hand over.',
  'claim-and-defend':
    'A position, its strongest reason, and the case that tests it. The most reliable way to get something gradeable in fifteen minutes.',
  'one-difference':
    'A comparison narrowed to the single distinction that matters, which is what keeps a short piece from becoming a list.',
  'evaluate-a-choice':
    'A judgment that has to name its own standard. Good for Development, because the standard has to come before the verdict.',
  'define-precisely':
    'A boundary drawn and then tested. Rewards precision over fluency.',
  'exit-synthesis':
    'What changed today and what changed it. The one kind that works without a reading in front of the student.',
};

export const COGNITIVE_MOVE_LABEL: Record<ShortFormCognitiveMove, string> = {
  analyze: 'Analyze',
  'argue-a-position': 'Argue a position',
  compare: 'Compare',
  'define-a-term': 'Define a term',
  evaluate: 'Evaluate',
  interpret: 'Interpret',
  synthesize: 'Synthesize',
};

export const SOURCE_NEED_LABEL: Record<ShortFormSourceNeed, string> = {
  none: 'No source needed',
  optional: 'Source optional',
  required: 'Source required',
};

export const LENGTH_TARGET_LABEL: Record<ShortFormLengthTarget, string> = {
  paragraph: 'One paragraph',
  'half-page': 'Half a page',
  page: 'A page',
};

/** Stable display order for facets that are not simply alphabetical. */
export const KIND_ORDER = [
  'close-read',
  'claim-and-defend',
  'one-difference',
  'evaluate-a-choice',
  'define-precisely',
  'exit-synthesis',
] as const satisfies readonly ShortFormPromptKind[];

export const SOURCE_NEED_ORDER = [
  'required',
  'optional',
  'none',
] as const satisfies readonly ShortFormSourceNeed[];

export const LENGTH_TARGET_ORDER = [
  'paragraph',
  'half-page',
  'page',
] as const satisfies readonly ShortFormLengthTarget[];

export const GRADE_ORDER: GradeBand[] = ['9', '10', '11', '12'];

/**
 * The runtime vocabulary arrays. Separate from the ordering constants above
 * because the generator's schema needs real arrays to build enums from, and a
 * tag the model invents has to be recognisably outside the set.
 */
export const COGNITIVE_MOVES = [
  'analyze',
  'argue-a-position',
  'compare',
  'define-a-term',
  'evaluate',
  'interpret',
  'synthesize',
] as const satisfies readonly ShortFormCognitiveMove[];

/**
 * Guidance shown above the library, about the library. What the assignment type
 * is, how it is graded, and how to write a prompt for it belong to the about
 * section (`../about-daily-pages/`), which sits directly above this one —
 * repeating any of it here only buries the few things that are true of the
 * corpus and nothing else.
 */
export const TEACHING_NOTES: string[] = [
  'Filter by “Source required” for the prompts that follow a reading, and by “No source needed” on a day the class has read nothing.',
  'Every prompt names a target length. Keep it when you edit the wording — it is how a student knows when they are done, and length earns nothing on its own.',
  'Editing a prompt before you create the assignment is expected. These are starting points; the class in front of you is the reason to change one.',
  'The six kinds below are also the six shapes worth copying when you write a prompt of your own.',
];

/** URL search-param keys. Prefixed `sf_` so they collide with neither library. */
export const FACET_KEYS = {
  search: 'sf_q',
  collections: 'sf_coll',
  kinds: 'sf_kind',
  cognitiveMoves: 'sf_moves',
  sourceNeeds: 'sf_source',
  lengthTargets: 'sf_length',
  textsOrUnits: 'sf_texts',
  themes: 'sf_themes',
  gradeBands: 'sf_grades',
} as const;

export type ShortFormLibraryFilters = {
  q: string;
  collections: Set<string>;
  kinds: Set<string>;
  cognitiveMoves: Set<string>;
  sourceNeeds: Set<string>;
  lengthTargets: Set<string>;
  textsOrUnits: Set<string>;
  themes: Set<string>;
  gradeBands: Set<string>;
};

export function buildFacets(prompts: ShortFormLibraryEntry[]): FacetValues {
  const kinds = new Set<ShortFormPromptKind>();
  const cognitiveMoves = new Set<ShortFormCognitiveMove>();
  const sourceNeeds = new Set<ShortFormSourceNeed>();
  const lengthTargets = new Set<ShortFormLengthTarget>();
  const textsOrUnits = new Set<string>();
  const themes = new Set<string>();
  const gradeBands = new Set<GradeBand>();

  for (const prompt of prompts) {
    if (prompt.kind) kinds.add(prompt.kind);
    prompt.cognitiveMoves.forEach((move) => cognitiveMoves.add(move));
    if (prompt.sourceNeed) sourceNeeds.add(prompt.sourceNeed);
    if (prompt.lengthTarget) lengthTargets.add(prompt.lengthTarget);
    prompt.textsOrUnits.forEach((textOrUnit) => textsOrUnits.add(textOrUnit));
    prompt.themes.forEach((theme) => themes.add(theme));
    prompt.gradeBands.forEach((gradeBand) => gradeBands.add(gradeBand));
  }

  return {
    // Both collections are always offered, even when the teacher has saved
    // nothing yet — "My prompts" has to be visible to be discovered.
    collections: [...COLLECTION_ORDER],
    kinds: KIND_ORDER.filter((value) => kinds.has(value)),
    cognitiveMoves: [...cognitiveMoves].sort(),
    sourceNeeds: SOURCE_NEED_ORDER.filter((value) => sourceNeeds.has(value)),
    lengthTargets: LENGTH_TARGET_ORDER.filter((value) =>
      lengthTargets.has(value)
    ),
    textsOrUnits: [...textsOrUnits].sort(),
    themes: [...themes].sort(),
    gradeBands: GRADE_ORDER.filter((value) => gradeBands.has(value)),
  };
}

export function buildOptionCounts(
  prompts: ShortFormLibraryEntry[]
): OptionCounts {
  const counts: OptionCounts = {
    // Seeded so an empty collection still reports a count of 0.
    collections: Object.fromEntries(
      COLLECTION_ORDER.map((collection) => [collection, 0])
    ),
    kinds: {},
    cognitiveMoves: {},
    sourceNeeds: {},
    lengthTargets: {},
    textsOrUnits: {},
    themes: {},
    gradeBands: {},
  };
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

  for (const prompt of prompts) {
    bump(counts.collections, prompt.collection);
    if (prompt.kind) bump(counts.kinds, prompt.kind);
    prompt.cognitiveMoves.forEach((move) => bump(counts.cognitiveMoves, move));
    if (prompt.sourceNeed) bump(counts.sourceNeeds, prompt.sourceNeed);
    if (prompt.lengthTarget) bump(counts.lengthTargets, prompt.lengthTarget);
    prompt.textsOrUnits.forEach((textOrUnit) =>
      bump(counts.textsOrUnits, textOrUnit)
    );
    prompt.themes.forEach((theme) => bump(counts.themes, theme));
    prompt.gradeBands.forEach((gradeBand) => bump(counts.gradeBands, gradeBand));
  }

  return counts;
}

export function readFilters(url: URL): ShortFormLibraryFilters {
  const readSet = (key: string) =>
    new Set(url.searchParams.get(key)?.split(',').filter(Boolean) ?? []);

  return {
    q: (url.searchParams.get(FACET_KEYS.search) ?? '').trim().toLowerCase(),
    collections: readSet(FACET_KEYS.collections),
    kinds: readSet(FACET_KEYS.kinds),
    cognitiveMoves: readSet(FACET_KEYS.cognitiveMoves),
    sourceNeeds: readSet(FACET_KEYS.sourceNeeds),
    lengthTargets: readSet(FACET_KEYS.lengthTargets),
    textsOrUnits: readSet(FACET_KEYS.textsOrUnits),
    themes: readSet(FACET_KEYS.themes),
    gradeBands: readSet(FACET_KEYS.gradeBands),
  };
}

export function applyFilters(
  prompts: ShortFormLibraryEntry[],
  filters: ShortFormLibraryFilters
): ShortFormLibraryEntry[] {
  return prompts.filter((prompt) => {
    if (
      filters.collections.size &&
      !filters.collections.has(prompt.collection)
    ) {
      return false;
    }
    // Saved prompts carry no corpus metadata, so any corpus facet filters them
    // out rather than matching a missing value.
    if (
      filters.kinds.size &&
      (!prompt.kind || !filters.kinds.has(prompt.kind))
    ) {
      return false;
    }
    if (
      filters.cognitiveMoves.size &&
      !prompt.cognitiveMoves.some((move) => filters.cognitiveMoves.has(move))
    ) {
      return false;
    }
    if (
      filters.sourceNeeds.size &&
      (!prompt.sourceNeed || !filters.sourceNeeds.has(prompt.sourceNeed))
    ) {
      return false;
    }
    if (
      filters.lengthTargets.size &&
      (!prompt.lengthTarget || !filters.lengthTargets.has(prompt.lengthTarget))
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
      filters.themes.size &&
      !prompt.themes.some((theme) => filters.themes.has(theme))
    ) {
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
