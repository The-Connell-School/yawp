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

export type FacetValues = {
  themes: string[];
  textsOrUnits: string[];
  cognitiveMoves: CognitiveMove[];
  types: PromptType[];
  seriousness: PromptSeriousness[];
  gradeBands: GradeBand[];
};

export type OptionCounts = {
  themes: Record<string, number>;
  textsOrUnits: Record<string, number>;
  cognitiveMoves: Record<string, number>;
  types: Record<string, number>;
  seriousness: Record<string, number>;
  gradeBands: Record<string, number>;
};

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

export const INSPIRATIONAL_EXAMPLES: string[] = [
  'Pick something in this room nobody else has noticed today. Make the case that it deserves attention.',
  "What's a belief you held two years ago that you no longer hold? What changed?",
  'If you could ask your future self one question, what would it be — and why that one?',
];

export const FACET_KEYS = {
  search: 'lp_q',
  themes: 'lp_themes',
  textsOrUnits: 'lp_texts',
  cognitiveMoves: 'lp_moves',
  types: 'lp_types',
  seriousness: 'lp_seriousness',
  gradeBands: 'lp_grades',
} as const;
