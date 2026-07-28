export type PromptType =
  | 'agree-disagree'
  | 'open-reflection'
  | 'narrative-anchor'
  | 'hypothetical'
  | 'provocation'
  | 'definitional';

export type PromptSeriousness =
  | 'playful'
  | 'light'
  | 'moderate'
  | 'serious'
  | 'heavy';

export type CognitiveMove =
  | 'compare'
  | 'complicate'
  | 'define-a-term'
  | 'imagine'
  | 'introspect'
  | 'take-a-stance'
  | 'tell-a-story';

export type GradeBand = '9' | '10' | '11' | '12';

export type LibraryPrompt = {
  id: string;
  prompt: string;
  themes: string[];
  textsOrUnits: string[];
  seriousness: PromptSeriousness;
  type: PromptType;
  cognitiveMoves: CognitiveMove[];
  gradeBands: GradeBand[];
};

/**
 * Which collection a row in the library comes from: the fixed corpus that ships
 * with the app, or a prompt this teacher generated and saved ("My prompts").
 */
export type PromptCollection = 'library' | 'mine';

/**
 * The library-vocabulary tags the generator gave a draft. Every field is
 * optional — tagging is best-effort, and a saved prompt is still useful
 * untagged.
 */
export type SavedPromptFacets = {
  type?: PromptType;
  seriousness?: PromptSeriousness;
  cognitiveMoves?: CognitiveMove[];
};

/** A prompt the teacher generated and saved, as returned by the loader. */
export type SavedDailyPagesPrompt = {
  id: string;
  prompt: string;
  /** ISO timestamp of when it was saved. */
  savedAt: string;
  facets: SavedPromptFacets;
};

/**
 * A row in the library. Corpus prompts bring their full facet metadata; saved
 * prompts carry only what the generator tagged them with, so the rest of the
 * facet fields are empty/null.
 */
export type LibraryEntry = {
  id: string;
  prompt: string;
  collection: PromptCollection;
  themes: string[];
  textsOrUnits: string[];
  seriousness: PromptSeriousness | null;
  type: PromptType | null;
  cognitiveMoves: CognitiveMove[];
  gradeBands: GradeBand[];
  /** Present only on saved prompts. */
  savedAt?: string;
};

export function toLibraryEntry(prompt: LibraryPrompt): LibraryEntry {
  return { ...prompt, collection: 'library' };
}

export function toLibraryEntries(prompts: LibraryPrompt[]): LibraryEntry[] {
  return prompts.map(toLibraryEntry);
}

export function savedPromptToLibraryEntry(
  saved: SavedDailyPagesPrompt
): LibraryEntry {
  return {
    id: saved.id,
    prompt: saved.prompt,
    collection: 'mine',
    themes: [],
    textsOrUnits: [],
    seriousness: saved.facets.seriousness ?? null,
    type: saved.facets.type ?? null,
    cognitiveMoves: saved.facets.cognitiveMoves ?? [],
    gradeBands: [],
    savedAt: saved.savedAt,
  };
}

export type FacetValues = {
  collections: PromptCollection[];
  themes: string[];
  textsOrUnits: string[];
  cognitiveMoves: CognitiveMove[];
  types: PromptType[];
  seriousness: PromptSeriousness[];
  gradeBands: GradeBand[];
};

export type OptionCounts = {
  collections: Record<string, number>;
  themes: Record<string, number>;
  textsOrUnits: Record<string, number>;
  cognitiveMoves: Record<string, number>;
  types: Record<string, number>;
  seriousness: Record<string, number>;
  gradeBands: Record<string, number>;
};

export const COLLECTION_LABEL: Record<PromptCollection, string> = {
  library: 'Library',
  mine: 'My prompts',
};

export const COLLECTION_ORDER: PromptCollection[] = ['library', 'mine'];

export const PROMPT_TYPE_LABEL: Record<PromptType, string> = {
  'agree-disagree': 'Agree / disagree',
  'open-reflection': 'Open reflection',
  'narrative-anchor': 'Narrative anchor',
  hypothetical: 'Hypothetical',
  provocation: 'Provocation',
  definitional: 'Definitional',
};

export const SERIOUSNESS_LABEL: Record<PromptSeriousness, string> = {
  playful: 'Playful',
  light: 'Light',
  moderate: 'Moderate',
  serious: 'Serious',
  heavy: 'Heavy',
};

export const COGNITIVE_MOVE_LABEL: Record<CognitiveMove, string> = {
  compare: 'Compare',
  complicate: 'Complicate',
  'define-a-term': 'Define a term',
  imagine: 'Imagine',
  introspect: 'Introspect',
  'take-a-stance': 'Take a stance',
  'tell-a-story': 'Tell a story',
};

// The controlled vocabularies as value tuples. The label maps above already
// pin the display order; these give the same values in a form the prompt
// generator can validate an LLM-tagged draft against (`z.enum` needs a tuple).
export const PROMPT_TYPES = [
  'agree-disagree',
  'open-reflection',
  'narrative-anchor',
  'hypothetical',
  'provocation',
  'definitional',
] as const satisfies readonly PromptType[];

export const SERIOUSNESS_LEVELS = [
  'playful',
  'light',
  'moderate',
  'serious',
  'heavy',
] as const satisfies readonly PromptSeriousness[];

export const COGNITIVE_MOVES = [
  'compare',
  'complicate',
  'define-a-term',
  'imagine',
  'introspect',
  'take-a-stance',
  'tell-a-story',
] as const satisfies readonly CognitiveMove[];

export const INSPIRATIONAL_EXAMPLES: string[] = [
  'Pick something in this room nobody else has noticed today. Make the case that it deserves attention.',
  "What's a belief you held two years ago that you no longer hold? What changed?",
  'If you could ask your future self one question, what would it be — and why that one?',
];

export const FACET_KEYS = {
  search: 'lp_q',
  collections: 'lp_coll',
  themes: 'lp_themes',
  textsOrUnits: 'lp_texts',
  cognitiveMoves: 'lp_moves',
  types: 'lp_types',
  seriousness: 'lp_seriousness',
  gradeBands: 'lp_grades',
} as const;
