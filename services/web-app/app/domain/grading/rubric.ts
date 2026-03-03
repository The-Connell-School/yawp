export const rubricCategories = [
  {
    key: 'thesis_and_content',
    label: 'Thesis/Content',
    description:
      'Original, defensible thesis with sustained critical thinking and meaningful deductions.',
    weight: 0.25,
  },
  {
    key: 'organization_and_structure',
    label: 'Organization/Structure',
    description:
      'Purposeful structure with strong progression, clear transitions, and a conclusion that extends thinking.',
    weight: 0.25,
  },
  {
    key: 'evidence_and_support',
    label: 'Evidence/Support',
    description:
      'Precise, well-integrated evidence that deepens analysis and builds authority.',
    weight: 0.2,
  },
  {
    key: 'voice_and_style',
    label: 'Voice/Style',
    description:
      'Authentic voice with engaging, precise language and consistent tone.',
    weight: 0.2,
  },
  {
    key: 'grammar_and_mechanics',
    label: 'Grammar/Syntax/Formatting',
    description:
      'Technical correctness and polished presentation that support clarity.',
    weight: 0.1,
  },
] as const;

export type RubricCategory = (typeof rubricCategories)[number];
export type RubricKey = RubricCategory['key'];

export const rubricKeys = rubricCategories.map((c) => c.key) as RubricKey[];
