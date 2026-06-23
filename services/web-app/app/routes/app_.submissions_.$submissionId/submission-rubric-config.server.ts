import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import {
  legacyRubricDisplayConfig,
  type RubricDisplayConfig,
} from '~/domain/grading/rubric-display';

type RubricSnapshotCategory = {
  key: string;
  label: string;
  description: string;
  weight: number;
};

export type LatestGradingRunRubricSnapshot = {
  assignmentTypeRubricSnapshot: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function rubricKeysFromScores(rubricScores: unknown) {
  return isRecord(rubricScores) ? Object.keys(rubricScores) : [];
}

function hasAllRubricKeys(config: RubricDisplayConfig, keys: string[]) {
  const configKeys = new Set(config.categories.map((category) => category.key));
  return keys.every((key) => configKeys.has(key));
}

function parseSnapshotCategory(value: unknown): RubricSnapshotCategory | null {
  if (!isRecord(value)) return null;
  const key = typeof value.key === 'string' ? value.key : null;
  const label = typeof value.label === 'string' ? value.label : null;
  const description =
    typeof value.description === 'string' ? value.description : null;
  const weight =
    typeof value.weight === 'number' && Number.isFinite(value.weight)
      ? value.weight
      : null;

  if (!key || !label || !description || weight === null) return null;
  return { key, label, description, weight };
}

export function buildRubricConfigFromSnapshot(
  snapshot: unknown
): RubricDisplayConfig | null {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.categories)) {
    return null;
  }

  const categories = snapshot.categories
    .map(parseSnapshotCategory)
    .filter((category): category is RubricSnapshotCategory =>
      Boolean(category)
    );
  if (categories.length === 0) return null;

  return {
    categories,
    minScore:
      typeof snapshot.minScore === 'number' &&
      Number.isFinite(snapshot.minScore)
        ? snapshot.minScore
        : 1,
    maxScore:
      typeof snapshot.maxScore === 'number' &&
      Number.isFinite(snapshot.maxScore)
        ? snapshot.maxScore
        : 5,
    scoringType:
      typeof snapshot.scoringType === 'string'
        ? snapshot.scoringType
        : 'weighted_1_5',
  };
}

export async function resolveRubricConfigForSubmission({
  assignmentTypeId,
  latestGradingRun,
  rubricScores,
}: {
  assignmentTypeId: string;
  latestGradingRun: LatestGradingRunRubricSnapshot | null;
  rubricScores: unknown;
}): Promise<RubricDisplayConfig> {
  const snapshotConfig = latestGradingRun
    ? buildRubricConfigFromSnapshot(
        latestGradingRun.assignmentTypeRubricSnapshot
      )
    : null;

  let activeConfig = snapshotConfig;
  if (!activeConfig) {
    const assignmentTypeConfig = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId,
    });
    activeConfig = {
      categories: assignmentTypeConfig.rubricCategories,
      minScore: assignmentTypeConfig.minScore,
      maxScore: assignmentTypeConfig.maxScore,
      scoringType: assignmentTypeConfig.scoringType,
    };
  }

  const storedKeys = rubricKeysFromScores(rubricScores);
  if (
    storedKeys.length > 0 &&
    !hasAllRubricKeys(activeConfig, storedKeys) &&
    hasAllRubricKeys(legacyRubricDisplayConfig, storedKeys)
  ) {
    return legacyRubricDisplayConfig;
  }

  return activeConfig;
}
