import type { ResolvedAssignmentTypeGradingConfig } from './assignment-type-grading-config.server';
import type { RubricScoreBand, RubricScoreLabel } from './assignment-type-rubric.shared';
import {
  buildDailyPagesEngagementRubricCategory,
  dailyPagesEngagementBandDescriptionForTotal,
  DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
  DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL,
  DAILY_PAGES_ENGAGEMENT_SCALING_RULE,
  usesDailyPagesEngagementPointScaling,
} from './daily-pages-engagement-rubric';
import {
  dailyPagesEngagementHolisticPickerScores,
  dailyPagesEngagementTierBands,
} from './daily-pages-engagement-tier-bands';

function scalePoint(value: number, sourceMax: number, targetMax: number) {
  if (sourceMax === targetMax) return value;
  return Math.round((value * targetMax) / sourceMax);
}

function scaleBandsFromSource(
  bands: RubricScoreBand[],
  sourceMax: number,
  targetMax: number
): RubricScoreBand[] {
  return bands.map((band) => ({
    ...band,
    min: scalePoint(band.min, sourceMax, targetMax),
    max: scalePoint(band.max, sourceMax, targetMax),
  }));
}

function scaleScoreLabelsFromSource(
  labels: RubricScoreLabel[] | undefined,
  sourceMax: number,
  targetMax: number
): RubricScoreLabel[] | undefined {
  if (!labels?.length) return labels;
  return labels.map((label) => ({
    ...label,
    value: scalePoint(label.value, sourceMax, targetMax),
  }));
}

function dailyPagesEngagementBandDescriptionsAreCurrent(
  bands: RubricScoreBand[] | undefined,
  total: number
): boolean {
  if (!bands?.length) return false;
  const footer = `Configured band for a ${total}-point assignment`;
  return bands.every((band) => {
    const description = band.description ?? '';
    if (!description.includes(footer)) return false;
    if (total === DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL) return true;
    return !/100-point/.test(description);
  });
}

function dailyPagesEngagementHolisticPickerIsCurrent(
  category: ResolvedAssignmentTypeGradingConfig['rubricCategories'][number],
  total: number,
  scoringMode: ResolvedAssignmentTypeGradingConfig['scoringMode']
): boolean {
  if (scoringMode !== 'holistic_tier') return true;
  const expected = dailyPagesEngagementHolisticPickerScores(total);
  const actual = category.allowedScores;
  if (!actual?.length) return false;
  return (
    actual.length === expected.length &&
    expected.every((score, index) => actual[index] === score)
  );
}

/**
 * Resolves Daily Pages engagement rubrics to the teacher's
 * configured point total using bands from the resolved (or pinned) schema.
 */
export function scaleDailyPagesForAssignment(
  config: ResolvedAssignmentTypeGradingConfig,
  pointValue: number | null | undefined
): ResolvedAssignmentTypeGradingConfig {
  const category = config.rubricCategories[0];
  if (!usesDailyPagesEngagementPointScaling(config.outputSchemaSnapshot)) {
    return config;
  }
  if (
    config.scoringType !== 'rubric_points' ||
    config.rubricCategories.length !== 1 ||
    category?.key !== DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY ||
    !Number.isSafeInteger(pointValue) ||
    pointValue! < 5
  ) {
    return config;
  }

  const total = pointValue!;
  if (
    config.maxScore === total &&
    dailyPagesEngagementBandDescriptionsAreCurrent(category.bands, total) &&
    dailyPagesEngagementHolisticPickerIsCurrent(
      category,
      total,
      config.scoringMode
    )
  ) {
    return config;
  }
  const snapshotScaling = config.rubricSnapshot?.assignmentPointScaling as
    | { sourceMaxScore?: number }
    | undefined;
  const snapshotMaxScore = config.rubricSnapshot?.maxScore as number | undefined;
  const sourceMax =
    snapshotScaling?.sourceMaxScore ??
    snapshotMaxScore ??
    config.maxScore ??
    DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL;

  const sourceBands = category.bands;
  const libraryBandCopyNeedsRewrite = sourceBands?.some((band) =>
    /100-point/.test(band.description ?? '')
  );
  const useEngagementTierBands =
    sourceMax === DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL ||
    config.maxScore === total ||
    libraryBandCopyNeedsRewrite;
  const scaledCategory =
    sourceBands && sourceBands.length > 0
      ? useEngagementTierBands
        ? {
            ...category,
            scoreLabels: scaleScoreLabelsFromSource(
              category.scoreLabels,
              sourceMax === total ? DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL : sourceMax,
              total
            ),
            bands: dailyPagesEngagementTierBands(total).map((tierBand) => {
              const sourceBand = sourceBands.find(
                (band) => band.label === tierBand.label
              );
              return {
                min: tierBand.min,
                max: tierBand.max,
                label: tierBand.label,
                description: dailyPagesEngagementBandDescriptionForTotal(
                  sourceBand?.description,
                  total,
                  tierBand
                ),
              };
            }),
          }
        : {
            ...category,
            scoreLabels: scaleScoreLabelsFromSource(
              category.scoreLabels,
              sourceMax,
              total
            ),
            bands: scaleBandsFromSource(sourceBands, sourceMax, total),
          }
      : buildDailyPagesEngagementRubricCategory(total);

  const scaleContext = `This assignment is worth ${total} points. Score using the configured bands below. Choose the tier first, then a whole number inside its band. Excellent is always ${total} points only.`;
  const categoryWithContext = {
    ...scaledCategory,
    description: `${category.description}\n\n${scaleContext}`,
  };

  const holisticPickerScores =
    config.scoringMode === 'holistic_tier'
      ? dailyPagesEngagementHolisticPickerScores(total)
      : undefined;
  const rubricCategories = [
    {
      ...categoryWithContext,
      ...(holisticPickerScores
        ? { allowedScores: holisticPickerScores }
        : {}),
    },
  ];

  return {
    ...config,
    maxScore: total,
    rubricCategories,
    rubricSnapshot: {
      ...config.rubricSnapshot,
      maxScore: total,
      categories: rubricCategories,
      assignmentPointScaling: {
        rule: DAILY_PAGES_ENGAGEMENT_SCALING_RULE,
        sourceMaxScore: sourceMax,
        pointValue: total,
      },
    },
  };
}
