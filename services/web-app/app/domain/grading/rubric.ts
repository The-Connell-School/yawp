export const rubricCategories = [
  {
    key: 'thesis_and_content',
    label: 'Thesis and Content',
    description: 'Clear argument, main idea, and relevance of content.',
    weight: 0.3,
  },
  {
    key: 'organization_and_structure',
    label: 'Organization and Structure',
    description: 'Introduction, body, conclusion flow, and transitions.',
    weight: 0.25,
  },
  {
    key: 'evidence_and_support',
    label: 'Evidence and Support',
    description: 'Use of examples, quotes, reasoning, and analysis.',
    weight: 0.25,
  },
  {
    key: 'voice_and_style',
    label: 'Voice and Style',
    description: 'Appropriate tone, word choice, and sentence variety.',
    weight: 0.15,
  },
  {
    key: 'grammar_and_mechanics',
    label: 'Grammar & Syntax',
    description: 'Sentence structure, punctuation, and spelling.',
    weight: 0.05,
  },
] as const;

export type RubricCategory = (typeof rubricCategories)[number];
export type RubricKey = RubricCategory['key'];

export const rubricKeys = rubricCategories.map((c) => c.key) as RubricKey[];
