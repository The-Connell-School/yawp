import { expect, test } from 'bun:test';
import thesis from '../rubrics/library/thesis-driven-essay.json';
import mixedPoints from '../rubrics/library/gba300-international-etiquette.json';
import { parseRubricSchema } from '../rubrics/rubric-schema';
import { getCategoryScoreBounds } from '../assignment-types/rubric-category-options';
import { buildScoreOptions, normalizeRubricScoresForCategories } from './rubric-display';
import { computeWeightedBandPercentage, formatAssignmentGrade, formatGrade, letterFromPercent } from './gradeMath';
import { rubricScaleGradeFieldsFromScores } from './recorded-grade';

// Captured on origin/main (7cdd5195) before adding weighted_percent to write validation.
// Exercise the existing scorer and display normalizer with real library category ranges.
test.each([thesis, mixedPoints])('$name retains its main scoring and normalized display output', raw => {
  const parsed = parseRubricSchema(raw);
  if (!parsed.ok) throw new Error('Library rubric must remain readable');
  const { scoringScale, rubric: { categories } } = parsed.schema;
  const { minScore, maxScore } = scoringScale;
  const rawScores = Object.fromEntries(categories.map((category, index) => {
    const bounds = getCategoryScoreBounds(category)!;
    const fraction = [0.845, 1, 0, 0.37, 0.95][index % 5];
    return [category.key, { score: bounds.max * fraction, comment: `Category ${index + 1}`, isAi: false }];
  }));
  const normalized = normalizeRubricScoresForCategories({ raw: rawScores, categories, minScore, maxScore });
  const numericPercentage = computeWeightedBandPercentage(normalized, categories);
  const letterGrade = numericPercentage === null ? null : letterFromPercent(numericPercentage);
  const score = formatGrade(numericPercentage, letterGrade);
  expect({
    scoringScale,
    normalized,
    numericPercentage,
    letterGrade,
    score,
    rawPointsGrade: rubricScaleGradeFieldsFromScores({ rubricScores: normalized, categories, minScore, maxScore, scoringType: scoringScale.type }),
    percentageDisplay: formatAssignmentGrade({ submitForGrade: true, numericPercentage, letterGrade, score, pointValue: null }),
    assignmentPointsDisplay: formatAssignmentGrade({ submitForGrade: true, numericPercentage, letterGrade, score, pointValue: 25 }),
    categoryDisplay: categories.map(category => ({
      key: category.key,
      option: buildScoreOptions(minScore, maxScore, category.scoreLabels, scoringScale.step, category.bands)
        .find(option => option.value === normalized[category.key].score),
    })),
  }).toMatchSnapshot();
});
