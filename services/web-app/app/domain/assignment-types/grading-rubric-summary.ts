import type { RubricCategory } from './assignment-type-rubric.shared';
import type { AssignmentTypeRubricConfigSource } from './assignment-type-rubric-config';

/**
 * A plain-words read of the rubric the Grading Assistant will use for an
 * assignment type, for the admin edit page.
 *
 * It is built from the resolved grading config — the same object grading
 * reads — so it shows what grading does rather than what any one column says.
 * A type with no rubric of its own grades from the built-in one for its kind,
 * and this is where an admin checking the type can see that.
 */

export type GradingRubricSummaryInput = {
  source: AssignmentTypeRubricConfigSource;
  label: string;
  scoringType: string;
  minScore: number;
  maxScore: number;
  rubricCategories: Pick<
    RubricCategory,
    'key' | 'label' | 'weight' | 'scoreLabels' | 'bands'
  >[];
};

export type GradingRubricSummary = {
  sourceText: string;
  scaleText: string;
  categories: Array<{
    key: string;
    label: string;
    weightPercent: number;
    levels: string[];
  }>;
};

const SCALE_NAMES: Record<string, string> = {
  weighted_1_5: 'Weighted 1–5',
  weighted_percent: 'Weighted percent',
  act_writing_2_12: 'ACT Writing 2–12',
  rubric_points: 'Rubric points',
  points_scale: 'Points',
};

function range(min: number, max: number) {
  return min === max ? `${min}` : `${min}–${max}`;
}

function levelsFor(
  category: GradingRubricSummaryInput['rubricCategories'][number]
): string[] {
  if (category.bands?.length) {
    return [...category.bands]
      .sort((a, b) => a.min - b.min)
      .map((band) => `${range(band.min, band.max)} · ${band.label}`);
  }
  if (category.scoreLabels?.length) {
    return [...category.scoreLabels]
      .sort((a, b) => a.value - b.value)
      .map((entry) => `${entry.value} · ${entry.label}`);
  }
  return [];
}

export function summarizeGradingRubric(
  config: GradingRubricSummaryInput,
  { libraryRubricTitle }: { libraryRubricTitle: string | null }
): GradingRubricSummary {
  const sourceText = libraryRubricTitle
    ? `Library rubric: ${libraryRubricTitle}`
    : config.source === 'assignment-type'
      ? "This type's own rubric"
      : `Built-in rubric: ${config.label}`;

  return {
    sourceText,
    scaleText: `${SCALE_NAMES[config.scoringType] ?? config.scoringType}, ${range(
      config.minScore,
      config.maxScore
    )}`,
    categories: config.rubricCategories.map((category) => ({
      key: category.key,
      label: category.label,
      weightPercent: Math.round(category.weight * 100),
      levels: levelsFor(category),
    })),
  };
}
