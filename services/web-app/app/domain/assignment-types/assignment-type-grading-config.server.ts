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
}: {
  assignmentTypeId: string;
  assignmentTypeKind: string | null;
  assignmentTypeTitle: string | null;
  row: AssignmentTypeGradingRow | null;
  ownGradingInstructionsOverride?: string;
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
  const { minScore, maxScore } = getScoreBounds(parsedConfig.scoringScale);
  const step = normalizeScoreStep(parsedConfig.scoringScale.step);
  const scoringType = getScoringType(parsedConfig.scoringScale);
  const rubricCategories = parsedConfig.rubric.categories;

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
    step,
    rubricCategories,
    instructions: getAssignmentTypeGradingInstructions(promptConfigSnapshot),
    rubricSnapshot: {
      categories: rubricCategories,
      minScore,
      maxScore,
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
  if (assignmentId) {
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: {
      assignmentTypeId: true, rubricRevision: { select: { id: true, version: true, rubricName: true, schemaJson: true } },
    } });
    if (!assignment || assignment.assignmentTypeId !== assignmentTypeId) throw new Error('Assignment grading context does not match');
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
  });
}
