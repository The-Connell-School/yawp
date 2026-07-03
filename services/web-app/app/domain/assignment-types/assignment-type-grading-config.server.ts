import { prisma } from '~/utils/db.server';
import {
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
} from '~/domain/grading/rubric-instructions';
import {
  parseAssignmentTypeRubricConfig,
  type AssignmentTypeRubricConfigSource,
} from './assignment-type-rubric-config';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';

export type AssignmentTypeGradingInstructions =
  | {
      mode: 'preset';
      rubricInstructions: string;
      scoreInstructions: string;
    }
  | {
      mode: 'unified';
      gradingInstructions: string;
    }
  | {
      mode: 'legacy-split';
      rubricInstructions: string;
      scoreInstructions: string;
      systemInstructions?: string;
    };

export type ResolvedAssignmentTypeGradingConfig = {
  source: AssignmentTypeRubricConfigSource;
  assignmentTypeId: string;
  assignmentTypeKind: string | null;
  assignmentTypeTitle: string | null;
  label: string;
  version: number;
  scoringType: string;
  minScore: number;
  maxScore: number;
  rubricCategories: RubricCategory[];
  instructions: AssignmentTypeGradingInstructions;
  rubricSnapshot: Record<string, unknown>;
  promptConfigSnapshot: Record<string, unknown>;
  outputSchemaSnapshot: Record<string, unknown>;
  calibrationNotes: string | null;
  sourceTemplateId: string | null;
  sourceTemplateSlug: string | null;
};

type AssignmentTypeGradingRow = {
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

export function getAssignmentTypeGradingInstructions(
  promptConfig: Record<string, unknown>
): AssignmentTypeGradingInstructions {
  const gradingInstructions =
    typeof promptConfig.gradingInstructions === 'string'
      ? promptConfig.gradingInstructions.trim()
      : '';
  if (gradingInstructions) {
    return { mode: 'unified', gradingInstructions };
  }

  if (promptConfig.instructionsPreset === 'legacy_thesis_driven_essay') {
    return {
      mode: 'preset',
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
  const systemInstructions =
    typeof promptConfig.systemInstructions === 'string' &&
    promptConfig.systemInstructions.trim()
      ? promptConfig.systemInstructions.trim()
      : undefined;

  return {
    mode: 'legacy-split',
    rubricInstructions,
    scoreInstructions,
    systemInstructions,
  };
}

function buildResolvedConfig({
  assignmentTypeId,
  assignmentTypeKind,
  assignmentTypeTitle,
  row,
}: {
  assignmentTypeId: string;
  assignmentTypeKind: string | null;
  assignmentTypeTitle: string | null;
  row: AssignmentTypeGradingRow | null;
}): ResolvedAssignmentTypeGradingConfig {
  const parsedConfig = parseAssignmentTypeRubricConfig({
    scoringScaleJson: row?.scoringScaleJson,
    rubricJson: row?.rubricJson,
    gradingPromptConfigJson: row?.gradingPromptConfigJson,
    gradingOutputSchemaJson: row?.gradingOutputSchemaJson,
    gradingCalibrationNotes: row?.gradingCalibrationNotes,
  });
  const promptConfigSnapshot =
    parsedConfig.source === 'assignment-type'
      ? getPromptConfigSnapshot(
          row?.gradingPromptConfigJson,
          parsedConfig.promptConfig as Record<string, unknown>
        )
      : (parsedConfig.promptConfig as Record<string, unknown>);
  const { minScore, maxScore } = getScoreBounds(parsedConfig.scoringScale);
  const scoringType = getScoringType(parsedConfig.scoringScale);
  const rubricCategories = parsedConfig.rubric.categories;

  return {
    source: parsedConfig.source,
    assignmentTypeId,
    assignmentTypeKind: row?.kind ?? assignmentTypeKind,
    assignmentTypeTitle: row?.title ?? assignmentTypeTitle,
    label:
      parsedConfig.source === 'assignment-type'
        ? (row?.title ?? assignmentTypeTitle ?? 'Assignment type grading config')
        : 'Thesis-driven essay grading assistant',
    version:
      parsedConfig.source === 'assignment-type'
        ? (row?.gradingAssistantVersion ?? 1)
        : 1,
    scoringType,
    minScore,
    maxScore,
    rubricCategories,
    instructions: getAssignmentTypeGradingInstructions(promptConfigSnapshot),
    rubricSnapshot: { categories: rubricCategories, minScore, maxScore, scoringType },
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
  };
}

export async function resolveAssignmentTypeGradingConfig({
  assignmentTypeId,
  assignmentTypeKind = null,
  assignmentTypeTitle = null,
}: {
  assignmentTypeId: string;
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
    },
  });

  return buildResolvedConfig({
    assignmentTypeId,
    assignmentTypeKind,
    assignmentTypeTitle,
    row: assignmentType,
  });
}
