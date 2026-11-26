import type { RubricCategory } from './assignment-type-rubric.shared';
import type { AssignmentTypeRubricConfigSource } from './assignment-type-rubric-config';

/**
 * Plain-words read of the rubric the Grading Assistant uses, built from the
 * same resolved grading config grading reads at runtime.
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

/**
 * A rubric written out in plain words for teachers, in place of the source,
 * scale, and bands. Exit tickets use it (Brian, Nov 25).
 */
export type GradingRubricPlainSummary = {
  intro: string;
  rows: Array<{ label: string; text: string }>;
};

export type GradingRubricSummary = {
  sourceText: string;
  scaleText: string;
  plain?: GradingRubricPlainSummary;
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
  // An internal key ("assignment-type:c...") means nothing to a teacher.
  const readableTitle =
    libraryRubricTitle && !/^[\w-]+:\S+$/.test(libraryRubricTitle)
      ? libraryRubricTitle
      : null;
  const sourceText = readableTitle
    ? `Library rubric: ${readableTitle}`
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
