export type PromptType =
  | 'agree-disagree'
  | 'open-reflection'
  | 'definitional'
  | 'observation-prompt'
  | 'free-write-seed';

export type PromptSeriousness = 'playful' | 'moderate' | 'serious';

export type CognitiveMove =
  | 'observe'
  | 'argue'
  | 'speculate'
  | 'recall'
  | 'synthesize'
  | 'reflect'
  | 'take-a-stance'
  | 'complicate'
  | 'introspect'
  | 'define-a-term';

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

export const PROMPT_TYPE_LABEL: Record<PromptType, string> = {
  'agree-disagree': 'Agree / disagree',
  'open-reflection': 'Open reflection',
  definitional: 'Definitional',
  'observation-prompt': 'Observation',
  'free-write-seed': 'Free-write seed',
};

export const SERIOUSNESS_LABEL: Record<PromptSeriousness, string> = {
  playful: 'Playful',
  moderate: 'Moderate',
  serious: 'Serious',
};

export const COGNITIVE_MOVE_LABEL: Record<CognitiveMove, string> = {
  observe: 'Observe',
  argue: 'Argue',
  speculate: 'Speculate',
  recall: 'Recall',
  synthesize: 'Synthesize',
  reflect: 'Reflect',
  'take-a-stance': 'Take a stance',
  complicate: 'Complicate',
  introspect: 'Introspect',
  'define-a-term': 'Define a term',
};

export const SEED_PROMPTS: LibraryPrompt[] = [
  {
    id: 'FW-001',
    prompt:
      'I am the captain of my destiny. Agree or disagree and explain your rationale.',
    themes: ['free-will', 'identity', 'responsibility'],
    textsOrUnits: [
      'Macbeth',
      'Oedipus Rex',
      'Of Mice and Men',
      'Their Eyes Were Watching God',
    ],
    seriousness: 'moderate',
    type: 'agree-disagree',
    cognitiveMoves: ['take-a-stance', 'complicate'],
    gradeBands: ['9', '10', '11', '12'],
  },
  {
    id: 'FW-002',
    prompt:
      'The person you are at school is not the same person you are at home. Is that a problem, or just how life works?',
    themes: ['identity', 'belonging'],
    textsOrUnits: ['Catcher in the Rye', 'The Outsiders', 'college-essay-prep'],
    seriousness: 'moderate',
    type: 'open-reflection',
    cognitiveMoves: ['introspect', 'complicate'],
    gradeBands: ['9', '10', '11', '12'],
  },
  {
    id: 'FW-003',
    prompt: 'You become who you spend time with. Defend, complicate, or reject this.',
    themes: ['identity', 'relationships', 'belonging'],
    textsOrUnits: ['Catcher in the Rye', 'The Outsiders', 'Lord of the Flies'],
    seriousness: 'moderate',
    type: 'agree-disagree',
    cognitiveMoves: ['take-a-stance', 'introspect'],
    gradeBands: ['9', '10', '11', '12'],
  },
  {
    id: 'FW-004',
    prompt:
      "There's a difference between who you are and who you're becoming. Which one is the real you?",
    themes: ['identity', 'change'],
    textsOrUnits: ['Great Gatsby', 'college-essay-prep', 'narrative-writing-unit'],
    seriousness: 'moderate',
    type: 'definitional',
    cognitiveMoves: ['define-a-term', 'introspect'],
    gradeBands: ['10', '11', '12'],
  },
  {
    id: 'FW-005',
    prompt: "Most people don't actually know themselves. Agree or disagree.",
    themes: ['identity', 'truth'],
    textsOrUnits: ['Hamlet', 'Catcher in the Rye', 'argumentative-writing-unit'],
    seriousness: 'moderate',
    type: 'agree-disagree',
    cognitiveMoves: ['take-a-stance', 'complicate'],
    gradeBands: ['10', '11', '12'],
  },
];

export const INSPIRATIONAL_EXAMPLES: string[] = [
  'Describe the strangest thing you saw on the way to school today, and what it might mean.',
  "What's a belief you held two years ago that you no longer hold? What changed?",
  'If you could ask your future self one question, what would it be — and why that one?',
];

export function uniqueValues<T extends string>(
  prompts: LibraryPrompt[],
  pick: (p: LibraryPrompt) => T[]
): T[] {
  const set = new Set<T>();
  for (const p of prompts) for (const v of pick(p)) set.add(v);
  return Array.from(set).sort();
}
