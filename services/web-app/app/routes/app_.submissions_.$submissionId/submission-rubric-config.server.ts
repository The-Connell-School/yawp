import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import {
  legacyRubricDisplayConfig,
  type RubricDisplayCategory,
  type RubricDisplayConfig,
  type RubricDisplaySource,
} from '~/domain/grading/rubric-display';
import {
  parseOptionalBoolean,
  parseRubricScoreLabels,
} from '~/domain/assignment-types/rubric-category-options';

type RubricSnapshotCategory = RubricDisplayCategory;

export type LatestGradingRunRubricSnapshot = {
  assignmentTypeRubricSnapshot: unknown;
  source?: string | null;
};

const rubricDisplaySources = new Set<string>([
  'assignment-type',
  'thesis-default',
  'daily-pages-default',
]);

function parseRubricDisplaySource(
  value: string | null | undefined
): RubricDisplaySource | undefined {
  return value && rubricDisplaySources.has(value)
    ? (value as RubricDisplaySource)
    : undefined;
}

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

  const scoreLabels = parseRubricScoreLabels(value.scoreLabels);
  const feedbackEnabled = parseOptionalBoolean(value.feedbackEnabled);
  const grammarHighlighting = parseOptionalBoolean(value.grammarHighlighting);

  return {
    key,
    label,
    description,
    weight,
    ...(scoreLabels ? { scoreLabels } : {}),
    ...(feedbackEnabled === undefined ? {} : { feedbackEnabled }),
    ...(grammarHighlighting === undefined ? {} : { grammarHighlighting }),
  };
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

  let activeConfig = snapshotConfig
    ? { ...snapshotConfig, source: parseRubricDisplaySource(latestGradingRun?.source) }
    : null;
  if (!activeConfig) {
    const assignmentTypeConfig = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId,
    });
    activeConfig = {
      categories: assignmentTypeConfig.rubricCategories,
      minScore: assignmentTypeConfig.minScore,
      maxScore: assignmentTypeConfig.maxScore,
      scoringType: assignmentTypeConfig.scoringType,
      source: assignmentTypeConfig.source,
      rubricIncomplete: assignmentTypeConfig.rubricIncomplete,
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
