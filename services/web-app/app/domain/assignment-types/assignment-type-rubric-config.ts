import { rubricCategories } from '~/domain/grading/rubric';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parsePromptConfig,
  parseRubric,
  parseScoringScale,
  type PromptConfigData,
  type RubricCategory,
  type RubricData,
  type ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';

export const MODULE_RUBRIC_RELATIONSHIPS = [
  'primary',
  'supporting',
  'preparatory',
  'not-applicable',
] as const;

export type ModuleRubricRelationship =
  (typeof MODULE_RUBRIC_RELATIONSHIPS)[number];

export type AssignmentTypeRubricConfigSource =
  | 'assignment-type'
  | 'thesis-default';

export type AssignmentTypeRubricConfigInput = {
  scoringScaleJson?: unknown;
  rubricJson?: unknown;
  gradingPromptConfigJson?: unknown;
  gradingOutputSchemaJson?: unknown;
  gradingCalibrationNotes?: string | null;
};

export type AssignmentTypeRubricConfig = {
  source: AssignmentTypeRubricConfigSource;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
  outputSchema: Record<string, unknown>;
  calibrationNotes: string | null;
};

export type ModuleRubricAlignment = Record<string, ModuleRubricRelationship>;

const relationshipSet = new Set<string>(MODULE_RUBRIC_RELATIONSHIPS);

const thesisRubric: RubricData = {
  categories: rubricCategories.map((category) => ({
    key: category.key,
    label: category.label,
    description: category.description,
    weight: category.weight,
  })),
};

const thesisPromptConfig: PromptConfigData = {
  instructionsPreset: 'legacy_thesis_driven_essay',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseOutputSchema(raw: unknown): Record<string, unknown> {
  return isRecord(raw) ? raw : { ...DEFAULT_OUTPUT_SCHEMA_JSON };
}

export function hasAssignmentTypeOwnedRubric(rubric: RubricData) {
  return (
    rubric.categories.length > 0 &&
    rubric.categories.every(
      (category) =>
        category.key.trim() &&
        category.label.trim() &&
        category.description.trim() &&
        Number.isFinite(category.weight)
    )
  );
}

export function getThesisDefaultRubricConfig(): AssignmentTypeRubricConfig {
  return parseAssignmentTypeRubricConfig({});
}

function hasUsableRubric(rubric: RubricData) {
  return hasAssignmentTypeOwnedRubric(rubric);
}

export function parseAssignmentTypeRubricConfig(
  input: AssignmentTypeRubricConfigInput
): AssignmentTypeRubricConfig {
  const rubric = parseRubric(input.rubricJson);

  if (!hasUsableRubric(rubric)) {
    return {
      source: 'thesis-default',
      scoringScale: parseScoringScale(null),
      rubric: thesisRubric,
      promptConfig: thesisPromptConfig,
      outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
      calibrationNotes:
        'Represents the pre-existing Yawp thesis-driven essay grading assistant path.',
    };
  }

  return {
    source: 'assignment-type',
    scoringScale: parseScoringScale(input.scoringScaleJson),
    rubric,
    promptConfig: parsePromptConfig(input.gradingPromptConfigJson),
    outputSchema: parseOutputSchema(input.gradingOutputSchemaJson),
    calibrationNotes: input.gradingCalibrationNotes ?? null,
  };
}

function parseRelationship(value: unknown): ModuleRubricRelationship {
  return typeof value === 'string' && relationshipSet.has(value)
    ? (value as ModuleRubricRelationship)
    : 'not-applicable';
}

export function normalizeModuleRubricAlignment(
  rawAlignment: unknown,
  categories: Pick<RubricCategory, 'key'>[]
): ModuleRubricAlignment {
  const alignmentSource = isRecord(rawAlignment) ? rawAlignment : {};

  return categories.reduce<ModuleRubricAlignment>((alignment, category) => {
    alignment[category.key] = parseRelationship(alignmentSource[category.key]);
    return alignment;
  }, {});
}
