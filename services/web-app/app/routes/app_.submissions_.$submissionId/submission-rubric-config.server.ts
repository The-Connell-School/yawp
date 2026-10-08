import { scaleDailyPagesForAssignment } from '~/domain/assignment-types/daily-pages-assignment-points';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import {
  legacyRubricDisplayConfig,
  parseRubricDisplaySource,
  type RubricDisplayCategory,
  type RubricDisplayConfig,
} from '~/domain/grading/rubric-display';
import { applyAssignmentGrammarGrading } from '~/domain/assignment-types/assignment-grammar-grading';
import {
  parseOptionalBoolean,
  parseRubricScoreBands,
  parseRubricScoreLabels,
  resolveGrammarHighlightingEnabled,
} from '~/domain/assignment-types/rubric-category-options';
import {
  inferStepFromScoreValues,
  normalizeScoreStep,
} from '~/domain/assignment-types/score-scale-steps';

type RubricSnapshotCategory = RubricDisplayCategory;

export type LatestGradingRunRubricSnapshot = {
  assignmentTypeRubricSnapshot: unknown;
  source?: string | null;
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

  const scoreLabels = parseRubricScoreLabels(value.scoreLabels);
  const bands = parseRubricScoreBands(value.bands);
  const feedbackEnabled = parseOptionalBoolean(value.feedbackEnabled);
  const grammarHighlighting = parseOptionalBoolean(value.grammarHighlighting);
  const allowedScores = Array.isArray(value.allowedScores)
    ? value.allowedScores.filter(
        (score): score is number =>
          typeof score === 'number' && Number.isFinite(score)
      )
    : undefined;

  return {
    key,
    label,
    description,
    weight,
    ...(scoreLabels ? { scoreLabels } : {}),
    ...(bands ? { bands } : {}),
    ...(feedbackEnabled === undefined ? {} : { feedbackEnabled }),
    ...(grammarHighlighting === undefined ? {} : { grammarHighlighting }),
    ...(allowedScores?.length ? { allowedScores } : {}),
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

  const minScore =
    typeof snapshot.minScore === 'number' && Number.isFinite(snapshot.minScore)
      ? snapshot.minScore
      : 1;
  const maxScore =
    typeof snapshot.maxScore === 'number' && Number.isFinite(snapshot.maxScore)
      ? snapshot.maxScore
      : 5;
  // Snapshots taken before scales had a step record only their tiers, so the
  // tier values stand in for it. Without this a 0-30 rubric scored in tens
  // offers the teacher all thirty-one values, only four of which are named.
  const step =
    typeof snapshot.step === 'number'
      ? normalizeScoreStep(snapshot.step)
      : normalizeScoreStep(
          inferStepFromScoreValues(
            categories.flatMap((category) =>
              (category.scoreLabels ?? []).map((entry) => entry.value)
            ),
            minScore
          ) ?? undefined
        );

  return {
    categories,
    minScore,
    maxScore,
    step,
    scoringType:
      typeof snapshot.scoringType === 'string'
        ? snapshot.scoringType
        : 'weighted_1_5',
  };
}

/**
 * Whether this submission's writing should currently be shown marked up.
 *
 * Read separately from the graded snapshot on purpose: the snapshot records
 * what the rubric said at grading time, and a teacher who switches
 * highlighting off afterwards expects the marks to disappear, not to persist
 * because an older run had it on. The assignment's own toggle is read the same
 * way and for the same reason — turning grammar grading off should take the
 * marks off work that was already graded with it on.
 */
export async function resolveGrammarHighlightingForAssignmentType(
  assignmentTypeId: string,
  grammarGradingEnabled?: boolean | null
): Promise<boolean> {
  const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId });
  return resolveGrammarHighlightingEnabled(
    applyAssignmentGrammarGrading(config.rubricCategories, grammarGradingEnabled)
  );
}

export async function resolveRubricConfigForSubmission({
  assignmentTypeId,
  assignmentId,
  pointValue,
  latestGradingRun,
  rubricScores,
}: {
  assignmentTypeId: string;
  assignmentId?: string | null;
  pointValue?: number | null;
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
    const assignmentTypeConfig = scaleDailyPagesForAssignment(
      await resolveAssignmentTypeGradingConfig({ assignmentTypeId, assignmentId }),
      pointValue,
    );
    activeConfig = {
      categories: assignmentTypeConfig.rubricCategories,
      minScore: assignmentTypeConfig.minScore,
      maxScore: assignmentTypeConfig.maxScore,
      step: assignmentTypeConfig.step,
      scoringType: assignmentTypeConfig.scoringType,
      source: parseRubricDisplaySource(assignmentTypeConfig.source),
      rubricIncomplete: assignmentTypeConfig.rubricIncomplete,
      ...(assignmentTypeConfig.scoringMode
        ? { scoringMode: assignmentTypeConfig.scoringMode }
        : {}),
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
