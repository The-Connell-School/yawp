import type { ResolvedAssignmentTypeGradingConfig } from './assignment-type-grading-config.server';
import type { RubricScoreBand, RubricScoreLabel } from './assignment-type-rubric.shared';
import {
  buildDailyPagesEngagementRubricCategory,
  DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
  DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL,
  DAILY_PAGES_ENGAGEMENT_SCALING_RULE,
  usesDailyPagesEngagementPointScaling,
} from './daily-pages-engagement-rubric';
import { dailyPagesEngagementTierBands } from './daily-pages-engagement-tier-bands';

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

/**
 * Resolves Daily Pages / Class Starter engagement rubrics to the teacher's
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
    pointValue! < 5 ||
    pointValue === config.maxScore
  ) {
    return config;
  }

  const total = pointValue!;
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
  const scaledCategory =
    sourceBands && sourceBands.length > 0
      ? sourceMax === DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL
        ? {
            ...category,
            scoreLabels: scaleScoreLabelsFromSource(
              category.scoreLabels,
              sourceMax,
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
                description:
                  sourceBand?.description ??
                  `${tierBand.label} (${tierBand.min}–${tierBand.max})`,
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

  const rubricCategories = [categoryWithContext];

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
