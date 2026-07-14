export const DEFAULT_OUTPUT_SCHEMA_JSON = {
  responseShape: 'categories_overall_comment',
  schemaVersion: 1,
} as const;

export type ScoringScaleData = {
  type: string;
  minScore: number;
  maxScore: number;
  compositeMin?: number;
  compositeMax?: number;
};

export type RubricCategory = {
  key: string;
  label: string;
  weight: number;
  description: string;
};

export type RubricData = {
  categories: RubricCategory[];
};

export type PromptConfigData = {
  systemInstructions?: string;
  gradingInstructions?: string;
  instructionsPreset?: string;
  systemMessageTemplate?: string;
  userMessageTemplate?: string;
};

export const DEFAULT_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

export const DEFAULT_RUBRIC: RubricData = { categories: [] };

export const DEFAULT_PROMPT_CONFIG: PromptConfigData = {
  systemInstructions: '',
  gradingInstructions: '',
};

export function rubricCategoryLabelToKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function prepareRubricForSave(rubric: RubricData): RubricData {
  return {
    categories: rubric.categories.map(
      ({ key, label, weight, description }) => ({
        key: key.trim() || rubricCategoryLabelToKey(label),
        label,
        weight,
        description,
      })
    ),
  };
}

export function parseScoringScale(raw: unknown): ScoringScaleData {
  const d = raw as Partial<ScoringScaleData> | null;
  return {
    type: d?.type ?? 'weighted_1_5',
    minScore: d?.minScore ?? 1,
    maxScore: d?.maxScore ?? 5,
    compositeMin: d?.compositeMin,
    compositeMax: d?.compositeMax,
  };
}

export function parseRubric(raw: unknown): RubricData {
  const d = raw as Partial<RubricData> | null;
  const cats = Array.isArray(d?.categories) ? d!.categories : [];
  return {
    categories: cats.map((c: Partial<RubricCategory>) => ({
      key: c.key ?? '',
      label: c.label ?? '',
      weight: typeof c.weight === 'number' ? c.weight : 0,
      description: c.description ?? '',
    })),
  };
}

export function parsePromptConfig(raw: unknown): PromptConfigData {
  const d = raw as
    | (Partial<PromptConfigData> & {
        systemInstructions?: string;
        scoreInstructions?: string;
        rubricInstructions?: string;
      })
    | null;

  const systemInstructions =
    typeof d?.systemInstructions === 'string' ? d.systemInstructions : '';
  const managedTemplates = {
    systemMessageTemplate:
      typeof d?.systemMessageTemplate === 'string'
        ? d.systemMessageTemplate
        : undefined,
    userMessageTemplate:
      typeof d?.userMessageTemplate === 'string'
        ? d.userMessageTemplate
        : undefined,
  };

  if (
    typeof d?.gradingInstructions === 'string' &&
    d.gradingInstructions.trim()
  ) {
    return {
      systemInstructions,
      gradingInstructions: d.gradingInstructions,
      instructionsPreset: d?.instructionsPreset ?? '',
      ...managedTemplates,
    };
  }

  const legacyParts = [d?.scoreInstructions, d?.rubricInstructions].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );

  return {
    systemInstructions,
    gradingInstructions: legacyParts.join('\n\n'),
    instructionsPreset: d?.instructionsPreset ?? '',
    ...managedTemplates,
  };
}
