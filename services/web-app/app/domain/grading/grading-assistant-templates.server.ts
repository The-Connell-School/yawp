import { prisma } from '~/utils/db.server';
import { rubricCategories } from './rubric';
import {
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
} from './rubric-instructions';

export type GradingAssistantSource = 'linked' | 'legacy-fallback';

export type GradingRubricCategory = {
  key: string;
  label: string;
  description: string;
  weight: number;
};

export type GradingAssistantTemplate = {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: number;
  assignmentTypeKind: string | null;
  scoringScale: unknown;
  rubricJson: unknown;
  promptConfigJson: unknown;
  outputSchemaJson: unknown;
  calibrationNotes: string | null;
};

export type ResolvedGradingAssistantTemplate = {
  source: GradingAssistantSource;
  template: GradingAssistantTemplate;
};

export const LEGACY_THESIS_GRADING_ASSISTANT_TEMPLATE: GradingAssistantTemplate =
  {
    id: 'gait_thesis_current_v1',
    name: 'Thesis-driven essay grading assistant',
    slug: 'thesis-driven-essay-current',
    status: 'active',
    version: 1,
    assignmentTypeKind: 'thesis_driven_essay',
    scoringScale: {
      type: 'weighted_1_5',
      minScore: 1,
      maxScore: 5,
    },
    rubricJson: {
      categories: rubricCategories.map((category) => ({
        key: category.key,
        label: category.label,
        description: category.description,
        weight: category.weight,
      })),
    },
    promptConfigJson: {
      instructionsPreset: 'legacy_thesis_driven_essay',
    },
    outputSchemaJson: {
      schemaVersion: 1,
      responseShape: 'categories_overall_comment',
    },
    calibrationNotes:
      'Represents the pre-existing Yawp thesis-driven essay grading assistant path.',
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeTemplate(value: {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: number;
  assignmentTypeKind: string | null;
  scoringScale: unknown;
  rubricJson: unknown;
  promptConfigJson: unknown;
  outputSchemaJson: unknown;
  calibrationNotes: string | null;
}): GradingAssistantTemplate {
  return {
    id: value.id,
    name: value.name,
    slug: value.slug,
    status: value.status,
    version: value.version,
    assignmentTypeKind: value.assignmentTypeKind,
    scoringScale: value.scoringScale,
    rubricJson: value.rubricJson,
    promptConfigJson: value.promptConfigJson,
    outputSchemaJson: value.outputSchemaJson,
    calibrationNotes: value.calibrationNotes,
  };
}

export async function resolveGradingAssistantTemplateForAssignmentType({
  assignmentTypeId,
  now = new Date(),
}: {
  assignmentTypeId: string;
  assignmentTypeKind?: string | null;
  assignmentTypeTitle?: string | null;
  now?: Date;
}): Promise<ResolvedGradingAssistantTemplate> {
  const activeDefaultLink = await prisma.assignmentTypeGradingAssistant.findFirst(
    {
      where: {
        assignmentTypeId,
        isDefault: true,
        activeFrom: { lte: now },
        OR: [{ activeTo: null }, { activeTo: { gt: now } }],
        gradingAssistantTemplate: { status: 'active' },
      },
      include: { gradingAssistantTemplate: true },
      orderBy: { activeFrom: 'desc' },
    }
  );

  if (activeDefaultLink?.gradingAssistantTemplate) {
    return {
      source: 'linked',
      template: normalizeTemplate(activeDefaultLink.gradingAssistantTemplate),
    };
  }

  return {
    source: 'legacy-fallback',
    template: LEGACY_THESIS_GRADING_ASSISTANT_TEMPLATE,
  };
}

export function getTemplateRubricCategories(
  template: GradingAssistantTemplate
): GradingRubricCategory[] {
  const rubricJson = template.rubricJson;
  const categories = isRecord(rubricJson) ? rubricJson.categories : null;
  if (!Array.isArray(categories)) {
    return getTemplateRubricCategories(LEGACY_THESIS_GRADING_ASSISTANT_TEMPLATE);
  }

  const parsed = categories
    .map((category) => {
      if (!isRecord(category)) return null;
      const key = typeof category.key === 'string' ? category.key : null;
      const label = typeof category.label === 'string' ? category.label : null;
      const description =
        typeof category.description === 'string' ? category.description : null;
      const weight =
        typeof category.weight === 'number' && Number.isFinite(category.weight)
          ? category.weight
          : null;
      if (!key || !label || !description || weight === null) return null;
      return { key, label, description, weight };
    })
    .filter((category): category is GradingRubricCategory => Boolean(category));

  return parsed.length > 0
    ? parsed
    : getTemplateRubricCategories(LEGACY_THESIS_GRADING_ASSISTANT_TEMPLATE);
}

export function getTemplatePromptConfig(
  template: GradingAssistantTemplate
): Record<string, unknown> {
  return isRecord(template.promptConfigJson) ? template.promptConfigJson : {};
}

export function getTemplateScoreBounds(template: GradingAssistantTemplate): {
  minScore: number;
  maxScore: number;
} {
  const scoringScale = isRecord(template.scoringScale)
    ? template.scoringScale
    : {};
  const minScore =
    typeof scoringScale.minScore === 'number' &&
    Number.isFinite(scoringScale.minScore)
      ? scoringScale.minScore
      : 1;
  const maxScore =
    typeof scoringScale.maxScore === 'number' &&
    Number.isFinite(scoringScale.maxScore)
      ? scoringScale.maxScore
      : 5;

  return { minScore, maxScore };
}

export function getTemplateScoringType(template: GradingAssistantTemplate) {
  const scoringScale = isRecord(template.scoringScale)
    ? template.scoringScale
    : {};
  return typeof scoringScale.type === 'string'
    ? scoringScale.type
    : 'weighted_1_5';
}

export function getTemplateInstructions(
  template: GradingAssistantTemplate
): {
  rubricInstructions: string;
  scoreInstructions: string;
  systemInstructions?: string;
} {
  const promptConfig = getTemplatePromptConfig(template);
  if (promptConfig.instructionsPreset === 'legacy_thesis_driven_essay') {
    return {
      rubricInstructions: gradingAssistantRubricInstructions,
      scoreInstructions: gradingAssistantScoreScaleInstructions,
    };
  }

  const rubricInstructions =
    typeof promptConfig.rubricInstructions === 'string'
      ? promptConfig.rubricInstructions
      : 'Use the rubric language, proficiency bands, and category weights from the user prompt exactly.';
  const scoreInstructions =
    typeof promptConfig.scoreInstructions === 'string'
      ? promptConfig.scoreInstructions
      : 'Scores must be integers in the configured range.';
  const systemInstructions =
    typeof promptConfig.systemInstructions === 'string'
      ? promptConfig.systemInstructions
      : undefined;

  return { rubricInstructions, scoreInstructions, systemInstructions };
}
