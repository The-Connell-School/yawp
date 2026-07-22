import {
  getAssignmentTypeGradingInstructions,
  resolveAssignmentTypeGradingConfig,
  type ResolvedAssignmentTypeGradingConfig,
} from '~/domain/assignment-types/assignment-type-grading-config.server';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  buildAssignmentAiContextSnapshot,
  parseAssignmentAiContextSnapshot,
  type AssignmentAiContextSnapshot,
} from './assignment-ai-context';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readRubricCategories(value: unknown): RubricCategory[] | null {
  if (!Array.isArray(value)) return null;
  const categories = value.filter(
    (category): category is RubricCategory =>
      isRecord(category) &&
      typeof category.key === 'string' &&
      typeof category.label === 'string' &&
      typeof category.description === 'string' &&
      typeof category.weight === 'number'
  );
  return categories.length === value.length && categories.length > 0
    ? categories
    : null;
}

function applySnapshotToGradingConfig(
  live: ResolvedAssignmentTypeGradingConfig,
  snapshot: AssignmentAiContextSnapshot
): ResolvedAssignmentTypeGradingConfig | null {
  const rubric = snapshot.rubricSnapshot;
  const rubricCategories = readRubricCategories(rubric.categories);
  const minScore = rubric.minScore;
  const maxScore = rubric.maxScore;
  const scoringType = rubric.scoringType;
  if (
    !rubricCategories ||
    typeof minScore !== 'number' ||
    typeof maxScore !== 'number' ||
    typeof scoringType !== 'string'
  ) {
    return null;
  }

  return {
    ...live,
    version: snapshot.assignmentTypeGradingVersion,
    minScore,
    maxScore,
    scoringType,
    rubricCategories,
    instructions: getAssignmentTypeGradingInstructions(
      snapshot.promptConfigSnapshot
    ),
    rubricSnapshot: snapshot.rubricSnapshot,
    promptConfigSnapshot: snapshot.promptConfigSnapshot,
    outputSchemaSnapshot: snapshot.outputSchemaSnapshot,
  };
}

export async function resolveAssignmentGradingContext({
  assignmentTypeId,
  assignmentTypeKind,
  assignmentTypeTitle,
  assignmentPrompt,
  storedSnapshot,
}: {
  assignmentTypeId: string;
  assignmentTypeKind: string | null;
  assignmentTypeTitle: string | null;
  assignmentPrompt: string;
  storedSnapshot: unknown;
}) {
  const live = await resolveAssignmentTypeGradingConfig({
    assignmentTypeId,
    assignmentTypeKind,
    assignmentTypeTitle,
  });
  const snapshot = parseAssignmentAiContextSnapshot(storedSnapshot, {
    assignmentTypeId,
  });
  if (snapshot) {
    const config = applySnapshotToGradingConfig(live, snapshot);
    if (config)
      return { config, snapshot, source: 'assignment-snapshot' as const };
  }

  const fallbackSnapshot = buildAssignmentAiContextSnapshot({
    assignmentTypeId,
    assignmentPrompt,
    gradingVersion: live.version,
    rubricSnapshot: live.rubricSnapshot,
    promptConfigSnapshot: live.promptConfigSnapshot,
    outputSchemaSnapshot: live.outputSchemaSnapshot,
  });
  return {
    config: live,
    snapshot: fallbackSnapshot,
    source: 'legacy-live-config' as const,
  };
}
