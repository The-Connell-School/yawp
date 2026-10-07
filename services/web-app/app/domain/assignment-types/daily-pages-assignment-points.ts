import type { ResolvedAssignmentTypeGradingConfig } from './assignment-type-grading-config.server';
import type { RubricScoreBand, RubricScoreLabel } from './assignment-type-rubric.shared';
import {
  buildDailyPagesEngagementRubricCategory,
  DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
  DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL,
  DAILY_PAGES_ENGAGEMENT_SCALING_RULE,
  usesDailyPagesEngagementPointScaling,
} from './daily-pages-engagement-rubric';

/**
 * Resolves Daily Pages / Class Starter engagement rubrics to the teacher's
 * configured point total using Brian's proportional tier bands.
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
    pointValue === DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL
  ) {
    return config;
  }

  const total = pointValue!;
  const scaledCategory = buildDailyPagesEngagementRubricCategory(total);
  const rubricCategories = [scaledCategory];

  const scaleContext = `This assignment is worth ${total} points. Score using the configured bands below. Choose the tier first, then a whole number inside its band. Excellent is always ${total} points only.`;
  const categoryWithContext = {
    ...scaledCategory,
    description: `${category.description}\n\n${scaleContext}`,
  };

  return {
    ...config,
    maxScore: total,
    rubricCategories: [categoryWithContext],
    rubricSnapshot: {
      ...config.rubricSnapshot,
      maxScore: total,
      categories: rubricCategories,
      assignmentPointScaling: {
        rule: DAILY_PAGES_ENGAGEMENT_SCALING_RULE,
        sourceMaxScore: DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL,
        pointValue: total,
      },
    },
  };
}
