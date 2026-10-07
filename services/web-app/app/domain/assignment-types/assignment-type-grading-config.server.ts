import { prisma } from '~/utils/db.server';
import {
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
} from '~/domain/grading/rubric-instructions';
import { parseRubricSchema } from '~/domain/rubrics/rubric-schema';
import { THESIS_DRIVEN_ESSAY_RUBRIC_NAME } from '~/domain/rubrics/thesis-driven-essay';
import {
  parseAssignmentTypeRubricConfig,
  type AssignmentTypeRubricConfigSource,
} from './assignment-type-rubric-config';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';
import { normalizeScoreStep } from './score-scale-steps';
import { isGrammarGradingConfigurable } from './assignment-grammar-grading';
import {
  DEFAULT_ASSIGNMENT_GRADING_MODE,
  parseAssignmentGradingMode,
  type AssignmentGradingMode,
} from '~/domain/assignments/rubric-overrides';

export type AssignmentTypeGradingInstructions =
  | {
      mode: 'preset';
      systemInstructions?: string;
      rubricInstructions: string;
      scoreInstructions: string;
    }
  | {
      mode: 'unified';
      systemInstructions?: string;
      gradingInstructions: string;
    }
  | {
      mode: 'legacy-split';
      rubricInstructions: string;
      scoreInstructions: string;
      systemInstructions?: string;
    };

export type ResolvedAssignmentTypeGradingConfig = {
  /** Selected library identity, including the identity on a pinned revision. */
  rubricName?: string | null;
  source: AssignmentTypeRubricConfigSource;
  /**
   * The assignment type's own rubric is in use but some categories are not
   * fully filled in. Grading still uses it; the flag exists so the gap is
   * shown rather than silently swapping in a default rubric.
   */
  rubricIncomplete: boolean;
  assignmentTypeId: string;
  assignmentTypeKind: string | null;
  assignmentTypeTitle: string | null;
  label: string;
  version: number;
  scoringType: string;
  minScore: number;
  maxScore: number;
  /** Optional assignment-level override for the rubric's total points. */
  rubricTotalPoints?: number | null;
  /** `step` is the compatibility default; `bands` opts into ranges. */
  gradingMode?: AssignmentGradingMode;
  /** Gap between allowed scores; 1 means every value in the range. */
  step: number;
  rubricCategories: RubricCategory[];
  instructions: AssignmentTypeGradingInstructions;
  rubricSnapshot: Record<string, unknown>;
  promptConfigSnapshot: Record<string, unknown>;
  outputSchemaSnapshot: Record<string, unknown>;
  calibrationNotes: string | null;
  sourceTemplateId: string | null;
  sourceTemplateSlug: string | null;
  promptTemplate?: {
    systemMessage: string;
    userMessage: string;
  } | null;
  /**
   * Overall scoring mode: weighted category average (default) or rubric-level holistic tier.
   * Comes from the rubric schema (library or per-type outputSchema override).
   */
  scoringMode?: 'weighted_categories' | 'holistic_tier';
};

export type AssignmentTypeGradingRow = {
  id: string;
  title: string;
  kind: string | null;
  scoringScaleJson: unknown;
  rubricJson: unknown;
  gradingPromptConfigJson: unknown;
  gradingOutputSchemaJson: unknown;
  gradingCalibrationNotes: string | null;
  gradingAssistantVersion: number;
  gradingAssistantSourceTemplateId: string | null;
  gradingAssistantSourceTemplateSlug: string | null;
  selectedRubricName?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getScoreBounds(scoringScale: { minScore: number; maxScore: number }) {
  return {
    minScore: Number.isFinite(scoringScale.minScore)
      ? scoringScale.minScore
      : 1,
    maxScore: Number.isFinite(scoringScale.maxScore)
      ? scoringScale.maxScore
      : 5,
  };
}

function getScoringType(scoringScale: { type: string }) {
  return scoringScale.type || 'weighted_1_5';
}

function getPromptConfigSnapshot(
  rawPromptConfig: unknown,
  fallbackPromptConfig: Record<string, unknown>
) {
  return isRecord(rawPromptConfig) ? rawPromptConfig : fallbackPromptConfig;
}

function getManagedPromptTemplate(promptConfig: Record<string, unknown>) {
  const systemMessage = promptConfig.systemMessageTemplate;
  const userMessage = promptConfig.userMessageTemplate;
  if (typeof systemMessage !== 'string' || typeof userMessage !== 'string') {
    return null;
  }
  if (!systemMessage.trim() || !userMessage.trim()) return null;
  return { systemMessage, userMessage };
}

function stepScoresForCategory(category: RubricCategory) {
  if (category.scoreLabels?.length) {
    return category.scoreLabels.map((entry) => entry.value);
  }
  if (category.bands?.length) {
    return category.bands.map((band) => band.max);
  }
  return undefined;
}

function scaleRubricScore(value: number, sourceMax: number, targetMax: number) {
  if (sourceMax <= 0 || sourceMax === targetMax) return value;
  return Math.round((value * targetMax) / sourceMax);
}

/**
 * A rubric's authored numbers are its source scale. An assignment-level total
 * changes that scale proportionally while keeping the rubric's labels and
 * descriptions attached to the same relative points.
 */
function applyRubricTotalPoints(
  categories: RubricCategory[],
  sourceMax: number,
  rubricTotalPoints?: number | null
) {
  if (
    rubricTotalPoints == null ||
    sourceMax <= 0 ||
    rubricTotalPoints === sourceMax
  ) {
    return categories;
  }

  return categories.map((category) => ({
    ...category,
    ...(category.scoreLabels
      ? {
          scoreLabels: category.scoreLabels.map((entry) => ({
            ...entry,
            value: scaleRubricScore(
              entry.value,
              sourceMax,
              rubricTotalPoints
            ),
          })),
        }
      : {}),
    ...(category.bands
      ? {
          bands: category.bands.map((band) => ({
            ...band,
            min: scaleRubricScore(band.min, sourceMax, rubricTotalPoints),
            max: scaleRubricScore(band.max, sourceMax, rubricTotalPoints),
          })),
        }
      : {}),
  }));
}

function applyAssignmentGradingMode(
  categories: RubricCategory[],
  gradingMode?: AssignmentGradingMode
) {
  if (gradingMode !== 'step') return categories;

  return categories.map((category) => {
    const allowedScores = stepScoresForCategory(category);
    if (!allowedScores?.length) return category;
    return {
      ...category,
      allowedScores: [...new Set(allowedScores)],
    };
  });
}

function applyGradingInstructionsOverride(
  promptConfig: Record<string, unknown>
): Record<string, unknown> {
  const gradingInstructionsOverride =
    typeof promptConfig.gradingInstructionsOverride === 'string'
      ? promptConfig.gradingInstructionsOverride.trim()
      : '';
  if (!gradingInstructionsOverride) return promptConfig;

  return {
    ...promptConfig,
    gradingInstructions: gradingInstructionsOverride,
  };
}

export function getAssignmentTypeGradingInstructions(
  promptConfig: Record<string, unknown>
): AssignmentTypeGradingInstructions {
  const systemInstructions =
    typeof promptConfig.systemInstructions === 'string' &&
    promptConfig.systemInstructions.trim()
      ? promptConfig.systemInstructions.trim()
      : undefined;
  const gradingInstructionsOverride =
    typeof promptConfig.gradingInstructionsOverride === 'string'
      ? promptConfig.gradingInstructionsOverride.trim()
      : '';
  if (gradingInstructionsOverride) {
    return {
      mode: 'unified',
      systemInstructions,
      gradingInstructions: gradingInstructionsOverride,
    };
  }

  const gradingInstructions =
    typeof promptConfig.gradingInstructions === 'string'
      ? promptConfig.gradingInstructions.trim()
      : '';
  if (gradingInstructions) {
    return { mode: 'unified', systemInstructions, gradingInstructions };
  }

  if (promptConfig.instructionsPreset === 'legacy_thesis_driven_essay') {
    return {
      mode: 'preset',
      systemInstructions,
      rubricInstructions: gradingAssistantRubricInstructions,
      scoreInstructions: gradingAssistantScoreScaleInstructions,
    };
  }

  const rubricInstructions =
    typeof promptConfig.rubricInstructions === 'string' &&
    promptConfig.rubricInstructions.trim()
      ? promptConfig.rubricInstructions.trim()
      : 'Use the rubric language, proficiency bands, and category weights from the user prompt exactly.';
  const scoreInstructions =
    typeof promptConfig.scoreInstructions === 'string' &&
    promptConfig.scoreInstructions.trim()
      ? promptConfig.scoreInstructions.trim()
      : 'Scores must be integers in the configured range.';
  return {
    mode: 'legacy-split',
    rubricInstructions,
    scoreInstructions,
    systemInstructions,
  };
}

/** Managed prompt versions belong to the assignment, even when its rubric is shared. */
function managedPromptTemplates(rawPromptConfig: unknown): Record<string, string> {
  if (!isRecord(rawPromptConfig)) return {};
  const { systemMessageTemplate, userMessageTemplate } = rawPromptConfig;
  if (
    typeof systemMessageTemplate !== 'string' || !systemMessageTemplate.trim() ||
    typeof userMessageTemplate !== 'string' || !userMessageTemplate.trim()
  ) return {};
  return { systemMessageTemplate, userMessageTemplate };
}

function withLibraryRubric<
  T extends AssignmentTypeGradingRow & {
    rubric?: { name: string; schemaJson: unknown } | null;
  },
>(row: T | null): AssignmentTypeGradingRow | null {
  if (!row?.rubric) return row;

  const parsed = parseRubricSchema(row.rubric.schemaJson);
  if (!parsed.ok) return row;

  return {
    ...row,
    selectedRubricName: row.rubric.name,
    scoringScaleJson: parsed.schema.scoringScale as never,
    rubricJson: parsed.schema.rubric as never,
    gradingPromptConfigJson: {
      ...parsed.schema.promptConfig,
      ...managedPromptTemplates(row.gradingPromptConfigJson),
    } as never,
    gradingOutputSchemaJson: parsed.schema.outputSchema as never,
    gradingCalibrationNotes: parsed.schema.calibrationNotes,
  };
}

function getOwnGradingInstructionsOverride(
  row: AssignmentTypeGradingRow | null
): string | undefined {
  const promptConfig = row?.gradingPromptConfigJson;
  if (!isRecord(promptConfig)) return undefined;
  const override = promptConfig.gradingInstructionsOverride;
  return typeof override === 'string' && override.trim()
    ? override.trim()
    : undefined;
}

export function buildResolvedAssignmentTypeGradingConfig({
  assignmentTypeId,
  assignmentTypeKind,
  assignmentTypeTitle,
  row,
  ownGradingInstructionsOverride,
  rubricTotalPoints = null,
  gradingMode,
}: {
  assignmentTypeId: string;
  assignmentTypeKind: string | null;
  assignmentTypeTitle: string | null;
  row: AssignmentTypeGradingRow | null;
  ownGradingInstructionsOverride?: string;
  rubricTotalPoints?: number | null;
  gradingMode?: AssignmentGradingMode;
}): ResolvedAssignmentTypeGradingConfig {
  const usesProductionThesis =
    row?.selectedRubricName === THESIS_DRIVEN_ESSAY_RUBRIC_NAME;
  const parsedConfig = parseAssignmentTypeRubricConfig({
    assignmentTypeKind: usesProductionThesis
      ? null
      : (row?.kind ?? assignmentTypeKind),
    scoringScaleJson: usesProductionThesis ? null : row?.scoringScaleJson,
    rubricJson: usesProductionThesis ? null : row?.rubricJson,
    gradingPromptConfigJson: usesProductionThesis
      ? null
      : row?.gradingPromptConfigJson,
    gradingOutputSchemaJson: usesProductionThesis
      ? null
      : row?.gradingOutputSchemaJson,
    gradingCalibrationNotes: usesProductionThesis
      ? null
      : row?.gradingCalibrationNotes,
  });
  const rawPromptConfigSnapshot =
    parsedConfig.source === 'assignment-type'
      ? getPromptConfigSnapshot(
          row?.gradingPromptConfigJson,
          parsedConfig.promptConfig as Record<string, unknown>
        )
      : (parsedConfig.promptConfig as Record<string, unknown>);
  const promptConfigSnapshot = applyGradingInstructionsOverride({
    ...rawPromptConfigSnapshot,
    ...managedPromptTemplates(row?.gradingPromptConfigJson),
    ...(ownGradingInstructionsOverride
      ? { gradingInstructionsOverride: ownGradingInstructionsOverride }
      : {}),
  });
  const authoredBounds = getScoreBounds(parsedConfig.scoringScale);
  const minScore =
    rubricTotalPoints == null
      ? authoredBounds.minScore
      : scaleRubricScore(
          authoredBounds.minScore,
          authoredBounds.maxScore,
          rubricTotalPoints
        );
  const maxScore = rubricTotalPoints ?? authoredBounds.maxScore;
  const step = normalizeScoreStep(parsedConfig.scoringScale.step);
  const scoringType = getScoringType(parsedConfig.scoringScale);
  const scaledCategories = applyRubricTotalPoints(
    parsedConfig.rubric.categories,
    authoredBounds.maxScore,
    rubricTotalPoints
  );
  const rubricCategories = applyAssignmentGradingMode(
    scaledCategories,
    gradingMode
  );

  // Resolve scoringMode from a library rubric's top-level schema JSON when present,
  // falling back to any per-type outputSchema override, and defaulting to weighted.
  const resolveScoringMode = (): 'holistic_tier' | undefined => {
    // When a library rubric is in use, the original schema JSON may carry a top-level scoringMode.
    const librarySchema =
      (row as any)?.rubric?.schemaJson &&
      typeof (row as any).rubric.schemaJson === 'object'
        ? ((row as any).rubric.schemaJson as Record<string, unknown>)
        : null;
    if (
      librarySchema &&
      librarySchema.scoringMode === 'holistic_tier'
    ) {
      return 'holistic_tier';
    }
    const outSchema =
      (parsedConfig.outputSchema as Record<string, unknown>) ?? {};
    if (outSchema.scoringMode === 'holistic_tier') {
      return 'holistic_tier';
    }
    return undefined;
  };
  const scoringMode = resolveScoringMode();

  return {
    source: parsedConfig.source,
    rubricName: row?.selectedRubricName ?? null,
    rubricIncomplete: parsedConfig.rubricIncomplete,
    assignmentTypeId,
    assignmentTypeKind: row?.kind ?? assignmentTypeKind,
    assignmentTypeTitle: row?.title ?? assignmentTypeTitle,
    label:
      parsedConfig.source === 'assignment-type'
        ? (row?.title ??
          assignmentTypeTitle ??
          'Assignment type grading config')
        : (parsedConfig.defaultLabel ??
          'Thesis-driven essay grading assistant'),
    version:
      parsedConfig.source === 'assignment-type'
        ? (row?.gradingAssistantVersion ?? 1)
        : 1,
    scoringType,
    minScore,
    maxScore,
    rubricTotalPoints,
    gradingMode,
    step,
    rubricCategories,
    instructions: getAssignmentTypeGradingInstructions(promptConfigSnapshot),
    rubricSnapshot: {
      categories: rubricCategories,
      minScore,
      maxScore,
      ...(rubricTotalPoints === null ? {} : { rubricTotalPoints }),
      ...(gradingMode ? { gradingMode } : {}),
      ...(scoringMode ? { scoringMode } : {}),
      step,
      scoringType,
    },
    promptConfigSnapshot,
    outputSchemaSnapshot: parsedConfig.outputSchema,
    calibrationNotes: parsedConfig.calibrationNotes,
    sourceTemplateId:
      parsedConfig.source === 'assignment-type'
        ? (row?.gradingAssistantSourceTemplateId ?? null)
        : null,
    sourceTemplateSlug:
      parsedConfig.source === 'assignment-type'
        ? (row?.gradingAssistantSourceTemplateSlug ?? null)
        : null,
    promptTemplate: getManagedPromptTemplate(promptConfigSnapshot),
    scoringMode,
  };
}

export async function resolveAssignmentTypeGradingConfig({
  assignmentTypeId,
  assignmentId,
  assignmentTypeKind = null,
  assignmentTypeTitle = null,
}: {
  assignmentTypeId: string;
  assignmentId?: string | null;
  assignmentTypeKind?: string | null;
  assignmentTypeTitle?: string | null;
}): Promise<ResolvedAssignmentTypeGradingConfig> {
  const assignmentType = await prisma.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    select: {
      id: true,
      title: true,
      kind: true,
      scoringScaleJson: true,
      rubricJson: true,
      gradingPromptConfigJson: true,
      gradingOutputSchemaJson: true,
      gradingCalibrationNotes: true,
      gradingAssistantVersion: true,
      gradingAssistantSourceTemplateId: true,
      gradingAssistantSourceTemplateSlug: true,
      rubric: { select: { name: true, schemaJson: true, currentRevision: { select: { id: true, version: true, rubricName: true, schemaJson: true } } } },
    },
  });

  // A published default opts this rubric into revision reads. Legacy rows
  // retain the existing library/column fallback until explicitly published.
  let revision = assignmentType?.rubric?.currentRevision ?? null;
  let assignmentRubricTotalPoints: number | null = null;
  let assignmentGradingMode: AssignmentGradingMode | undefined;
  if (assignmentId) {
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: {
      assignmentTypeId: true,
      rubricTotalPoints: true,
      gradingMode: true,
      rubricRevision: { select: { id: true, version: true, rubricName: true, schemaJson: true } },
    } });
    if (!assignment || assignment.assignmentTypeId !== assignmentTypeId) throw new Error('Assignment grading context does not match');
    assignmentRubricTotalPoints = assignment.rubricTotalPoints;
    // The migration gives every real row an explicit `step`. An omitted field
    // can only be an old fixture/legacy read, so preserve its pre-override
    // band behavior rather than making an un-migrated row fail on a new guard.
    assignmentGradingMode =
      typeof assignment.gradingMode === 'string'
        ? parseAssignmentGradingMode(assignment.gradingMode) ??
          DEFAULT_ASSIGNMENT_GRADING_MODE
        : 'bands';
    if (assignment.rubricRevision) revision = assignment.rubricRevision;
  }
  const row = revision && assignmentType ? {
    ...assignmentType,
    gradingAssistantVersion: revision.version,
    rubric: { name: revision.rubricName, schemaJson: revision.schemaJson },
  } : assignmentType;
  return buildResolvedAssignmentTypeGradingConfig({
    assignmentTypeId,
    assignmentTypeKind,
    assignmentTypeTitle,
    // A rubric chosen from the library replaces the assignment type's own
    // columns wholesale. Everything downstream reads the same shape either
    // way, so nothing else in grading has to know where the rubric came from.
    row: withLibraryRubric(row),
    // The per-assignment-type grading assistant override always applies,
    // even when a library rubric supplies the rest of the prompt config.
    ownGradingInstructionsOverride: getOwnGradingInstructionsOverride(
      assignmentType as AssignmentTypeGradingRow | null
    ),
    rubricTotalPoints: assignmentRubricTotalPoints,
    gradingMode: assignmentGradingMode,
  });
}

/**
 * Which of these assignment types grade grammar at all, in one query.
 *
 * The assignment creation sheet needs this to decide whether to offer the
 * teacher's "graded for grammar and syntax" toggle, and a dashboard can list a
 * dozen types — so this resolves them together rather than once per type. It
 * reuses the same builder as `resolveAssignmentTypeGradingConfig`, so a type
 * whose rubric comes from the shared library is read correctly rather than
 * from its own (empty) columns.
 */
export async function getGrammarGradingAssignmentTypeIds(
  assignmentTypeIds: string[]
): Promise<Set<string>> {
  const ids = Array.from(new Set(assignmentTypeIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const rows = await prisma.assignmentType.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      kind: true,
      scoringScaleJson: true,
      rubricJson: true,
      gradingPromptConfigJson: true,
      gradingOutputSchemaJson: true,
      gradingCalibrationNotes: true,
      gradingAssistantVersion: true,
      gradingAssistantSourceTemplateId: true,
      gradingAssistantSourceTemplateSlug: true,
      rubric: { select: { name: true, schemaJson: true } },
    },
  });

  const gradesGrammar = new Set<string>();
  for (const row of rows) {
    const config = buildResolvedAssignmentTypeGradingConfig({
      assignmentTypeId: row.id,
      assignmentTypeKind: row.kind,
      assignmentTypeTitle: row.title,
      row: withLibraryRubric(row),
      ownGradingInstructionsOverride: getOwnGradingInstructionsOverride(
        row as AssignmentTypeGradingRow | null
      ),
    });
    if (isGrammarGradingConfigurable(config.rubricCategories)) {
      gradesGrammar.add(row.id);
    }
  }

  return gradesGrammar;
}
