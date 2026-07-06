import {
  parseAssignmentTypeRubricConfig,
  type AssignmentTypeRubricConfigSource,
} from './assignment-type-rubric-config';
import type { AssignmentTypeAiSnapshot } from './assignment-type-ai-version.server';
import {
  getAssignmentTypeGradingInstructions,
  type AssignmentTypeGradingInstructions,
} from './assignment-type-grading-instructions';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  getGradingAssistantStrictnessInstructions,
  getGradingAssistantStrictnessLabel,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import {
  buildModuleRubricGuidance,
  buildTutorSystemPrompt,
} from '~/routes/api.domain.tutor-response/build-system-prompt';
import type { RubricCategory } from './assignment-type-rubric.shared';

export const DEFAULT_WORKBENCH_STUDENT_FIRST_NAME = 'Student';
export const DEFAULT_WORKBENCH_SAMPLE_ESSAY =
  'Paste a representative student draft here to test this assignment type.';

type AssignmentTypeAiWorkbenchInstructionInput = {
  id: string;
  title: string;
  position: number;
  prompt: string;
  tutorInstructions: string | null;
};

type AssignmentTypeAiWorkbenchModuleInput = {
  id: string;
  title: string;
  position: number;
  description: string | null;
  tutorInstructions: string | null;
  isSelfGuided: boolean;
  rubricAlignmentJson: unknown;
  instructions?: AssignmentTypeAiWorkbenchInstructionInput[] | null;
};

export type AssignmentTypeAiWorkbenchInput = {
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
  assignmentModules?: AssignmentTypeAiWorkbenchModuleInput[] | null;
};

export function assignmentTypeAiSnapshotToWorkbenchInput(
  snapshot: AssignmentTypeAiSnapshot
): AssignmentTypeAiWorkbenchInput {
  return {
    id: snapshot.assignmentType.id,
    title: snapshot.assignmentType.title,
    kind: snapshot.assignmentType.kind,
    scoringScaleJson: snapshot.assignmentType.scoringScaleJson,
    rubricJson: snapshot.assignmentType.rubricJson,
    gradingPromptConfigJson: snapshot.assignmentType.gradingPromptConfigJson,
    gradingOutputSchemaJson: snapshot.assignmentType.gradingOutputSchemaJson,
    gradingCalibrationNotes: snapshot.assignmentType.gradingCalibrationNotes,
    gradingAssistantVersion: snapshot.assignmentType.gradingAssistantVersion,
    gradingAssistantSourceTemplateId:
      snapshot.assignmentType.gradingAssistantSourceTemplateId,
    gradingAssistantSourceTemplateSlug:
      snapshot.assignmentType.gradingAssistantSourceTemplateSlug,
    assignmentModules: snapshot.modules.map((module) => ({
      id: module.id,
      title: module.title,
      position: module.position,
      description: module.description,
      tutorInstructions: module.tutorInstructions,
      isSelfGuided: module.isSelfGuided,
      rubricAlignmentJson: module.rubricAlignmentJson,
      instructions: module.instructions.map((instruction) => ({
        id: instruction.id,
        title: instruction.title,
        position: instruction.position,
        prompt: instruction.prompt,
        tutorInstructions: instruction.tutorInstructions,
      })),
    })),
  };
}

export type AssignmentTypeAiWorkbench = {
  assignmentType: {
    id: string;
    title: string;
    source: AssignmentTypeRubricConfigSource;
    gradingAssistantVersion: number;
    rubricCategories: RubricCategory[];
  };
  gradingPreview: {
    strictnessLevel: GradingAssistantStrictnessLevel;
    strictnessLabel: string;
    minScore: number;
    maxScore: number;
    instructions: AssignmentTypeGradingInstructions;
    rubricText: string;
    system: string;
    userPrompt: string;
  };
  tutorPreviews: Array<{
    moduleId: string;
    moduleTitle: string;
    instructionId: string | null;
    instructionTitle: string;
    instructionPrompt: string | null;
    rubricGuidance: string | null;
    systemPrompt: string;
  }>;
};

export type AssignmentTypeAiWorkbenchComparison = {
  hasChanges: boolean;
  gradingPromptChanged: boolean;
  rubricCategories: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  tutorPrompts: {
    added: string[];
    removed: string[];
    changed: string[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getPromptConfigSnapshot(raw: unknown, fallback: Record<string, unknown>) {
  return isRecord(raw) ? raw : fallback;
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

function buildRubricText(categories: RubricCategory[]) {
  return categories
    .map(
      (item) =>
        `${item.key}: ${item.label} (${Math.round(item.weight * 100)}%) - ${item.description}`
    )
    .join('\n');
}

function buildGradingPromptPreview({
  assignmentTypeTitle,
  instructions,
  minScore,
  maxScore,
  rubricText,
  studentFirstName,
  strictnessLevel,
  sampleEssay,
}: {
  assignmentTypeTitle: string;
  instructions: AssignmentTypeGradingInstructions;
  minScore: number;
  maxScore: number;
  rubricText: string;
  studentFirstName: string;
  strictnessLevel: GradingAssistantStrictnessLevel;
  sampleEssay: string;
}) {
  const strictnessLabel = getGradingAssistantStrictnessLabel(strictnessLevel);
  const strictnessInstructions =
    getGradingAssistantStrictnessInstructions(strictnessLevel);
  const gradingSystemBase = `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  "categories": [{"key": string, "score": ${minScore}-${maxScore}, "comment": string}],\n  "overallComment": string\n}\nScores must be integers ${minScore}-${maxScore}.\nReturn exactly one category for each rubric key provided.\nProvide concise, actionable comments.\nIn overallComment, start with "${studentFirstName}," and continue with cohesive feedback in a warm but professional tone.\nAfter the name, continue naturally (for example: "${studentFirstName}, you ...").\nDo not use fixed lead-ins like "Overall grade," or "${studentFirstName}, this is your overall feedback."`;
  const strictnessBlock = `Grading assistant strictness: ${strictnessLabel}\n${strictnessInstructions}\n\n`;

  if (instructions.mode === 'unified') {
    return {
      strictnessLabel,
      system: `${gradingSystemBase}\nFollow the grading instructions in the user prompt exactly.`,
      userPrompt: `Student first name: ${studentFirstName}\n\nAssignment type grading config: ${assignmentTypeTitle}\n\n${strictnessBlock}Rubric category keys (use these exact keys in categories[].key):\n${rubricText}\n\nGrading instructions:\n${instructions.gradingInstructions}\n\nEssay:\n${sampleEssay}`,
    };
  }

  const rubricInstructions = instructions.rubricInstructions;
  const scoreInstructions = instructions.scoreInstructions;
  const templateSystemInstructions =
    instructions.mode === 'legacy-split' && instructions.systemInstructions
      ? `${instructions.systemInstructions}\n\n`
      : '';

  return {
    strictnessLabel,
    system: `${templateSystemInstructions}${gradingSystemBase}\nUse the rubric language, proficiency bands, and category weights from the user prompt exactly.\n${scoreInstructions}`,
    userPrompt: `Student first name: ${studentFirstName}\n\nAssignment type grading config: ${assignmentTypeTitle}\n\n${strictnessBlock}Rubric category keys (use these exact keys in categories[].key):\n${rubricText}\n\nRubric Instructions:\n${rubricInstructions}\n\nEssay:\n${sampleEssay}`,
  };
}

function byPositionThenId<T extends { position: number; id: string }>(
  left: T,
  right: T
) {
  if (left.position !== right.position) return left.position - right.position;
  return left.id.localeCompare(right.id);
}

function stableString(value: unknown) {
  return JSON.stringify(value);
}

function labelsForCategoryChanges({
  current,
  baseline,
}: {
  current: RubricCategory[];
  baseline: RubricCategory[];
}) {
  const currentByKey = new Map(current.map((category) => [category.key, category]));
  const baselineByKey = new Map(
    baseline.map((category) => [category.key, category])
  );
  const added = current
    .filter((category) => !baselineByKey.has(category.key))
    .map((category) => category.key);
  const removed = baseline
    .filter((category) => !currentByKey.has(category.key))
    .map((category) => category.key);
  const changed = current
    .filter((category) => {
      const previous = baselineByKey.get(category.key);
      return previous ? stableString(previous) !== stableString(category) : false;
    })
    .map((category) => category.key);

  return { added, removed, changed };
}

function tutorPreviewKey(
  preview: AssignmentTypeAiWorkbench['tutorPreviews'][number]
) {
  return `${preview.moduleId}:${preview.instructionId ?? 'module'}`;
}

function tutorPreviewLabel(
  preview: AssignmentTypeAiWorkbench['tutorPreviews'][number]
) {
  return [preview.moduleTitle, preview.instructionTitle]
    .filter(Boolean)
    .join(' - ');
}

export function compareAssignmentTypeAiWorkbenches({
  current,
  baseline,
}: {
  current: AssignmentTypeAiWorkbench;
  baseline: AssignmentTypeAiWorkbench;
}): AssignmentTypeAiWorkbenchComparison {
  const rubricCategories = labelsForCategoryChanges({
    current: current.assignmentType.rubricCategories,
    baseline: baseline.assignmentType.rubricCategories,
  });
  const gradingPromptChanged =
    current.gradingPreview.system !== baseline.gradingPreview.system ||
    current.gradingPreview.userPrompt !== baseline.gradingPreview.userPrompt;
  const currentTutorByKey = new Map(
    current.tutorPreviews.map((preview) => [tutorPreviewKey(preview), preview])
  );
  const baselineTutorByKey = new Map(
    baseline.tutorPreviews.map((preview) => [tutorPreviewKey(preview), preview])
  );
  const addedTutorPreviews = current.tutorPreviews
    .filter((preview) => !baselineTutorByKey.has(tutorPreviewKey(preview)))
    .map(tutorPreviewLabel);
  const removedTutorPreviews = baseline.tutorPreviews
    .filter((preview) => !currentTutorByKey.has(tutorPreviewKey(preview)))
    .map(tutorPreviewLabel);
  const changedTutorPreviews = current.tutorPreviews
    .filter((preview) => {
      const previous = baselineTutorByKey.get(tutorPreviewKey(preview));
      return previous
        ? previous.systemPrompt !== preview.systemPrompt ||
            previous.instructionPrompt !== preview.instructionPrompt
        : false;
    })
    .map(tutorPreviewLabel);
  const tutorPrompts = {
    added: addedTutorPreviews,
    removed: removedTutorPreviews,
    changed: changedTutorPreviews,
  };
  const hasChanges =
    gradingPromptChanged ||
    rubricCategories.added.length > 0 ||
    rubricCategories.removed.length > 0 ||
    rubricCategories.changed.length > 0 ||
    tutorPrompts.added.length > 0 ||
    tutorPrompts.removed.length > 0 ||
    tutorPrompts.changed.length > 0;

  return {
    hasChanges,
    gradingPromptChanged,
    rubricCategories,
    tutorPrompts,
  };
}

export function buildAssignmentTypeAiWorkbench({
  assignmentType,
  sampleEssay = DEFAULT_WORKBENCH_SAMPLE_ESSAY,
  studentFirstName = DEFAULT_WORKBENCH_STUDENT_FIRST_NAME,
  strictnessLevel = DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
}: {
  assignmentType: AssignmentTypeAiWorkbenchInput;
  sampleEssay?: string;
  studentFirstName?: string;
  strictnessLevel?: GradingAssistantStrictnessLevel;
}): AssignmentTypeAiWorkbench {
  const rubricConfig = parseAssignmentTypeRubricConfig({
    scoringScaleJson: assignmentType.scoringScaleJson,
    rubricJson: assignmentType.rubricJson,
    gradingPromptConfigJson: assignmentType.gradingPromptConfigJson,
    gradingOutputSchemaJson: assignmentType.gradingOutputSchemaJson,
    gradingCalibrationNotes: assignmentType.gradingCalibrationNotes,
  });
  const promptConfigSnapshot = getPromptConfigSnapshot(
    assignmentType.gradingPromptConfigJson,
    rubricConfig.promptConfig as Record<string, unknown>
  );
  const instructions = getAssignmentTypeGradingInstructions(promptConfigSnapshot);
  const { minScore, maxScore } = getScoreBounds(rubricConfig.scoringScale);
  const rubricText = buildRubricText(rubricConfig.rubric.categories);
  const gradingPrompt = buildGradingPromptPreview({
    assignmentTypeTitle: assignmentType.title,
    instructions,
    minScore,
    maxScore,
    rubricText,
    studentFirstName,
    strictnessLevel,
    sampleEssay,
  });

  const tutorPreviews = [...(assignmentType.assignmentModules ?? [])]
    .sort(byPositionThenId)
    .flatMap((module) => {
      const rubricGuidance = buildModuleRubricGuidance({
        categories: rubricConfig.rubric.categories,
        alignment: module.rubricAlignmentJson,
      });
      const instructionsForModule = [...(module.instructions ?? [])].sort(
        byPositionThenId
      );
      const previewInstructions =
        instructionsForModule.length > 0
          ? instructionsForModule
          : [
              {
                id: '',
                title: 'Module-level tutor preview',
                position: 0,
                prompt: '',
                tutorInstructions: null,
              },
            ];

      return previewInstructions.map((instruction) => ({
        moduleId: module.id,
        moduleTitle: module.title,
        instructionId: instruction.id || null,
        instructionTitle: instruction.title,
        instructionPrompt: instruction.prompt || null,
        rubricGuidance,
        systemPrompt: buildTutorSystemPrompt({
          tutorInstructions: module.tutorInstructions,
          instructionTutorInstructions: instruction.tutorInstructions,
          moduleRubricGuidance: rubricGuidance,
        }),
      }));
    });

  return {
    assignmentType: {
      id: assignmentType.id,
      title: assignmentType.title,
      source: rubricConfig.source,
      gradingAssistantVersion: assignmentType.gradingAssistantVersion,
      rubricCategories: rubricConfig.rubric.categories,
    },
    gradingPreview: {
      strictnessLevel,
      strictnessLabel: gradingPrompt.strictnessLabel,
      minScore,
      maxScore,
      instructions,
      rubricText,
      system: gradingPrompt.system,
      userPrompt: gradingPrompt.userPrompt,
    },
    tutorPreviews,
  };
}
