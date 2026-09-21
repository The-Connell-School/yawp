import type { ResolvedAssignmentTypeGradingConfig } from './assignment-type-grading-config.server';
import type { RubricScoreBand, RubricScoreLabel } from './assignment-type-rubric.shared';

const SCALING_RULE = 'daily_pages_engagement_v1';
const SOURCE_MAX = 30;
const AUTHORED_BOUNDS = [[0, 0], [7, 13], [17, 23], [28, 30]];
const AUTHORED_ANCHORS = [0, 10, 20, 30];

/**
 * Only the explicitly revised library rubric opts in. Older pins, snapshots,
 * inline configurations and other rubrics keep the scale they were authored on.
 */
export function scaleDailyPagesForAssignment(
  config: ResolvedAssignmentTypeGradingConfig,
  pointValue: number | null | undefined,
): ResolvedAssignmentTypeGradingConfig {
  const category = config.rubricCategories[0];
  if (
    config.source !== 'assignment-type' ||
    config.rubricName !== 'daily-pages-engagement' ||
    config.outputSchemaSnapshot.assignmentPointScaling !== SCALING_RULE ||
    config.scoringType !== 'rubric_points' ||
    config.minScore !== 0 || config.maxScore !== SOURCE_MAX || config.step !== 1 ||
    config.rubricCategories.length !== 1 || category?.key !== 'engagement_with_prompt' ||
    category.bands?.length !== AUTHORED_BOUNDS.length ||
    !category.bands.every((band, index) => band.min === AUTHORED_BOUNDS[index][0] && band.max === AUTHORED_BOUNDS[index][1]) ||
    category.scoreLabels?.length !== AUTHORED_ANCHORS.length ||
    !category.scoreLabels.every((anchor, index) => anchor.value === AUTHORED_ANCHORS[index]) ||
    !Number.isSafeInteger(pointValue) || pointValue! <= 0 || pointValue === SOURCE_MAX
  ) return config;

  const total = pointValue!;
  const bands: RubricScoreBand[] = [];
  const scoreLabels: RubricScoreLabel[] = [];
  let tiersMerged = false;
  for (const [index, sourceBand] of category.bands.entries()) {
    // Round inward: every ordinary score stays inside its proportional tier.
    let min = Math.ceil(sourceBand.min * total / SOURCE_MAX);
    let max = Math.floor(sourceBand.max * total / SOURCE_MAX);
    const sourceAnchor = category.scoreLabels[index];
    let anchor = Math.round(sourceAnchor.value * total / SOURCE_MAX);
    if (min > max) {
      // At 1 or 2 points some submitted tiers contain no integer. Give them
      // their nearest positive anchor, then merge any identical score bands.
      anchor = Math.max(1, Math.min(total, anchor));
      min = max = anchor;
    }
    anchor = Math.max(min, Math.min(max, anchor));
    const band = {
      ...sourceBand, min, max,
      description: `Configured anchor: ${anchor}/${total}. Original 30-point guidance (multiply by ${total}/30 and use only whole numbers inside this configured band): ${sourceBand.description}`,
    };
    const previous = bands.at(-1);
    if (previous && band.min <= previous.max) {
      tiersMerged = true;
      previous.max = Math.max(previous.max, band.max);
      previous.label += ` / ${band.label}`;
      previous.description += `\n\nThese tiers share a score at this assignment total. ${band.description}`;
    } else {
      bands.push(band);
    }
    const previousLabel = scoreLabels.at(-1);
    if (previousLabel?.value === anchor) {
      previousLabel.label += ` / ${sourceAnchor.label}`;
    } else {
      scoreLabels.push({ value: anchor, label: sourceAnchor.label });
    }
  }
  const scaleContext = `This assignment is worth ${total} points. Use the configured bands and anchors below. The authored instructions retain their original 30-point examples; multiply by ${total}/30 and keep the result within the configured whole-number band.`;
  const representability = tiersMerged
    ? ` At this total, whole-number scores cannot distinguish all four tiers. Submitted tiers with the same score are combined below; zero remains NOT HANDED IN.`
    : '';
  const rubricCategories = [{
    ...category,
    description: `${category.description}\n\n${scaleContext}${representability}`,
    bands,
    scoreLabels,
    ...(category.allowedScores
      ? { allowedScores: [...new Set(scoreLabels.map((entry) => entry.value))] }
      : {}),
  }];
  return {
    ...config,
    maxScore: total,
    rubricCategories,
    rubricSnapshot: {
      ...config.rubricSnapshot,
      maxScore: total,
      categories: rubricCategories,
      assignmentPointScaling: { rule: SCALING_RULE, sourceMaxScore: SOURCE_MAX, pointValue: total, tiersMerged },
    },
  };
}
