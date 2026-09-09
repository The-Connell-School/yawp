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
import {
  DAILY_PAGES_ASSIGNMENT_TYPE_KIND,
  DAILY_PAGES_PROMPT_CONFIG,
  DAILY_PAGES_RUBRIC,
  DAILY_PAGES_SCORING_SCALE,
} from './daily-pages-rubric';
import {
  DAILY_PAGES_REFLECTION_PROMPT_CONFIG,
  DAILY_PAGES_REFLECTION_RUBRIC,
  DAILY_PAGES_REFLECTION_SCORING_SCALE,
} from './daily-pages-reflection-rubric';
import {
  CLASS_STARTER_ASSIGNMENT_TYPE_KIND,
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORING_SCALE,
} from './class-starter-rubric';
import { isDailyPagesSplitEnabled } from './daily-pages-split';

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
  | 'thesis-default'
  | 'daily-pages-default'
  | 'daily-pages-reflection-default'
  | 'class-starter-default';

export type AssignmentTypeRubricConfigInput = {
  /**
   * The assignment type's `kind`, which picks the default rubric an assignment
   * type falls back to when it has not saved one of its own.
   */
  assignmentTypeKind?: string | null;
  scoringScaleJson?: unknown;
  rubricJson?: unknown;
  gradingPromptConfigJson?: unknown;
  gradingOutputSchemaJson?: unknown;
  gradingCalibrationNotes?: string | null;
  /**
   * Overrides the ambient Daily Pages split flag. Present so callers that
   * already know the rollout state — and tests, which must be able to assert
   * both sides — do not depend on process environment at call time.
   */
  dailyPagesSplitEnabled?: boolean;
};

export type AssignmentTypeRubricConfig = {
  source: AssignmentTypeRubricConfigSource;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
  outputSchema: Record<string, unknown>;
  calibrationNotes: string | null;
  /**
   * True when this is the assignment type's own rubric but some of its
   * categories are missing a key, label, description, or weight. The rubric is
   * still used — the flag exists so the incompleteness is surfaced to whoever
   * is grading rather than quietly changing which rubric applies.
   */
  rubricIncomplete: boolean;
  /**
   * What to call this config when it did not come from the assignment type's
   * own saved rubric. Undefined for `assignment-type`, which uses the title.
   */
  defaultLabel?: string;
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

const thesisDefaultConfig: AssignmentTypeRubricConfig = {
  source: 'thesis-default',
  scoringScale: parseScoringScale(null),
  rubric: thesisRubric,
  promptConfig: thesisPromptConfig,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Represents the pre-existing Yawp thesis-driven essay grading assistant path.',
  rubricIncomplete: false,
  defaultLabel: 'Thesis-driven essay grading assistant',
};

/**
 * The rubric an assignment type falls back to when it has saved none of its
 * own, keyed by `AssignmentType.kind`. Every kind that is not listed keeps
 * falling back to the thesis-driven essay rubric, which is what every
 * assignment type did before this registry existed.
 *
 * A kind listed here needs no data migration: an existing row picks its default
 * up on the next grading run, and a row that saved its own rubric still wins.
 */
const dailyPagesLegacyConfig: AssignmentTypeRubricConfig = {
  source: 'daily-pages-default',
  scoringScale: DAILY_PAGES_SCORING_SCALE,
  rubric: DAILY_PAGES_RUBRIC,
  promptConfig: DAILY_PAGES_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Daily Pages judges engagement only, with overall feedback and no grammar highlighting.',
  rubricIncomplete: false,
  defaultLabel: 'Daily Pages engagement',
};

/**
 * The soft assistant, under the name it is keeping. Class Starter is what
 * Daily Pages was: one engagement judgment, overall feedback, no markup.
 */
const classStarterConfig: AssignmentTypeRubricConfig = {
  source: 'class-starter-default',
  scoringScale: CLASS_STARTER_SCORING_SCALE,
  rubric: CLASS_STARTER_RUBRIC,
  promptConfig: CLASS_STARTER_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Class Starter judges engagement only — that the student wrote and reflected — with overall feedback and no grammar highlighting.',
  rubricIncomplete: false,
  defaultLabel: 'Class Starter engagement',
};

/**
 * The harder assistant: a reflection on an assigned text or topic, judged on
 * three categories with per-category feedback. Reached only when the split
 * flag is on, so no existing Daily Pages row changes how it grades until the
 * rollout says so.
 */
const dailyPagesReflectionConfig: AssignmentTypeRubricConfig = {
  source: 'daily-pages-reflection-default',
  scoringScale: DAILY_PAGES_REFLECTION_SCORING_SCALE,
  rubric: DAILY_PAGES_REFLECTION_RUBRIC,
  promptConfig: DAILY_PAGES_REFLECTION_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Daily Pages judges a reflection on an assigned text or topic across engagement with the source, depth of reflection, and clarity, with per-category feedback and no grammar highlighting. Effort alone earns the middle of the scale.',
  rubricIncomplete: false,
  defaultLabel: 'Daily Pages reflection',
};

const defaultRubricConfigsByKind: Record<string, AssignmentTypeRubricConfig> = {
  [DAILY_PAGES_ASSIGNMENT_TYPE_KIND]: dailyPagesLegacyConfig,
  [CLASS_STARTER_ASSIGNMENT_TYPE_KIND]: classStarterConfig,
};

function getDefaultRubricConfig(
  assignmentTypeKind: string | null | undefined,
  splitEnabled: boolean
): AssignmentTypeRubricConfig {
  if (!assignmentTypeKind) return thesisDefaultConfig;
  if (assignmentTypeKind === DAILY_PAGES_ASSIGNMENT_TYPE_KIND) {
    return splitEnabled ? dailyPagesReflectionConfig : dailyPagesLegacyConfig;
  }
  return defaultRubricConfigsByKind[assignmentTypeKind] ?? thesisDefaultConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseOutputSchema(raw: unknown): Record<string, unknown> {
  return isRecord(raw) ? raw : { ...DEFAULT_OUTPUT_SCHEMA_JSON };
}

export type AssignmentTypeRubricCompleteness = 'none' | 'partial' | 'complete';

function isCategoryComplete(category: RubricCategory) {
  return Boolean(
    category.key.trim() &&
      category.label.trim() &&
      category.description.trim() &&
      Number.isFinite(category.weight)
  );
}

/**
 * How much of an assignment type's own rubric an admin actually filled in.
 *
 * `partial` is the case worth naming: at least one category is usable and at
 * least one is not. Treating that as owned grades against a half-written
 * rubric; treating it as unowned swaps the whole rubric for the thesis default
 * behind the admin's back. Neither is acceptable silently, so the reading path
 * keeps the rubric and the partial state is reported loudly instead.
 */
export function classifyAssignmentTypeRubric(
  rubric: RubricData
): AssignmentTypeRubricCompleteness {
  if (rubric.categories.length === 0) return 'none';
  if (rubric.categories.every(isCategoryComplete)) return 'complete';
  if (rubric.categories.some(isCategoryComplete)) return 'partial';
  return 'none';
}

/**
 * Reading: permissive on purpose. A rubric with any usable category stays the
 * assignment type's own, so no persisted rubric ever changes out from under
 * scores that were already entered against it.
 */
export function hasAssignmentTypeOwnedRubric(rubric: RubricData) {
  return classifyAssignmentTypeRubric(rubric) !== 'none';
}

/**
 * Writing: strict. Save-time guards use this so a partial rubric cannot be
 * newly introduced, which is the only point at which blocking is safe.
 */
export function isRubricFullyPopulated(rubric: RubricData) {
  return classifyAssignmentTypeRubric(rubric) === 'complete';
}

export function getThesisDefaultRubricConfig(): AssignmentTypeRubricConfig {
  return parseAssignmentTypeRubricConfig({});
}

export function parseAssignmentTypeRubricConfig(
  input: AssignmentTypeRubricConfigInput
): AssignmentTypeRubricConfig {
  const rubric = parseRubric(input.rubricJson);
  const completeness = classifyAssignmentTypeRubric(rubric);

  if (completeness === 'none') {
    return {
      ...getDefaultRubricConfig(
        input.assignmentTypeKind,
        input.dailyPagesSplitEnabled ?? isDailyPagesSplitEnabled()
      ),
      rubricIncomplete: false,
    };
  }

  return {
    source: 'assignment-type',
    scoringScale: parseScoringScale(input.scoringScaleJson),
    rubric,
    promptConfig: parsePromptConfig(input.gradingPromptConfigJson),
    outputSchema: parseOutputSchema(input.gradingOutputSchemaJson),
    calibrationNotes: input.gradingCalibrationNotes ?? null,
    rubricIncomplete: completeness === 'partial',
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
