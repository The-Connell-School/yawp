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
import { DAILY_PAGES_ASSIGNMENT_TYPE_KIND } from './daily-pages-rubric';
import {
  CLASS_STARTER_ASSIGNMENT_TYPE_KIND,
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORING_SCALE,
} from './class-starter-rubric';
import { EXIT_TICKET_ASSIGNMENT_TYPE_KIND } from './exit-ticket';
import {
  EXIT_TICKET_PROMPT_CONFIG,
  EXIT_TICKET_RUBRIC,
  EXIT_TICKET_SCORING_SCALE,
} from './exit-ticket-rubric';
import {
  DAILY_PAGES_ENGAGEMENT_PROMPT_CONFIG,
  DAILY_PAGES_ENGAGEMENT_RUBRIC,
  DAILY_PAGES_ENGAGEMENT_SCALING_RULE,
  DAILY_PAGES_ENGAGEMENT_SCORING_SCALE,
} from './daily-pages-engagement-rubric';
import {
  PREWRITING_ASSIGNMENT_TYPE_KIND,
  PREWRITING_PROMPT_CONFIG,
  PREWRITING_RUBRIC,
  PREWRITING_SCORING_SCALE,
} from './prewriting-assignment-type';
import {
  THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND,
  THESIS_STATEMENT_PROMPT_CONFIG,
  THESIS_STATEMENT_RUBRIC,
  THESIS_STATEMENT_SCORING_SCALE,
} from './thesis-statement-assignment-type';

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
  | 'daily-pages-short-form-default'
  | 'daily-pages-engagement-default'
  | 'class-starter-default'
  | 'exit-ticket-default';

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
const prewritingConfig: AssignmentTypeRubricConfig = {
  source: 'assignment-type',
  scoringScale: PREWRITING_SCORING_SCALE,
  rubric: PREWRITING_RUBRIC,
  promptConfig: PREWRITING_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Standalone pre-writing: exploratory effort and movement toward a specific focus.',
  rubricIncomplete: false,
};

const thesisStatementConfig: AssignmentTypeRubricConfig = {
  source: 'assignment-type',
  scoringScale: THESIS_STATEMENT_SCORING_SCALE,
  rubric: THESIS_STATEMENT_RUBRIC,
  promptConfig: THESIS_STATEMENT_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Standalone thesis statement: one arguable sentence with observation and analysis.',
  rubricIncomplete: false,
};

/** Daily Pages: Brian 2026-10-02 engagement tiers with proportional point scaling. */
const dailyPagesEngagementOutputSchema = {
  ...DEFAULT_OUTPUT_SCHEMA_JSON,
  assignmentPointScaling: DAILY_PAGES_ENGAGEMENT_SCALING_RULE,
  scoringMode: 'holistic_tier',
};

const dailyPagesEngagementConfig: AssignmentTypeRubricConfig = {
  source: 'daily-pages-engagement-default',
  scoringScale: DAILY_PAGES_ENGAGEMENT_SCORING_SCALE,
  rubric: DAILY_PAGES_ENGAGEMENT_RUBRIC,
  promptConfig: DAILY_PAGES_ENGAGEMENT_PROMPT_CONFIG,
  outputSchema: dailyPagesEngagementOutputSchema,
  calibrationNotes:
    'Brian Connell merged Daily Pages engagement rubric (2026-10-02): proportional Excellent / Good / Needs More / Not Present tiers for any teacher-set total from 5 up.',
  rubricIncomplete: false,
  defaultLabel: 'Daily Pages engagement',
};

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

const defaultRubricConfigsByKind: Record<string, AssignmentTypeRubricConfig> = {
  [DAILY_PAGES_ASSIGNMENT_TYPE_KIND]: dailyPagesEngagementConfig,
  [CLASS_STARTER_ASSIGNMENT_TYPE_KIND]: classStarterConfig,
  [EXIT_TICKET_ASSIGNMENT_TYPE_KIND]: {
    source: 'exit-ticket-default',
    scoringScale: EXIT_TICKET_SCORING_SCALE,
    rubric: EXIT_TICKET_RUBRIC,
    promptConfig: EXIT_TICKET_PROMPT_CONFIG,
    outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
    calibrationNotes:
      'Exit Tickets judge understanding only, scored inside written bands so the grade honors the point value, with overall feedback and no grammar highlighting.',
    rubricIncomplete: false,
    defaultLabel: 'Exit Ticket understanding',
  },
  [PREWRITING_ASSIGNMENT_TYPE_KIND]: prewritingConfig,
  [THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND]: thesisStatementConfig,
};

function getDefaultRubricConfig(
  assignmentTypeKind: string | null | undefined
): AssignmentTypeRubricConfig {
  if (!assignmentTypeKind) return thesisDefaultConfig;
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
      ...getDefaultRubricConfig(input.assignmentTypeKind),
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
