import { describe, expect, test } from 'bun:test';

import {
  parseAssignmentTypeRubricConfig,
  type AssignmentTypeRubricConfig,
} from '~/domain/assignment-types/assignment-type-rubric-config';
import { CLASS_STARTER_THREE_BAND_SCHEMA } from '~/domain/assignment-types/class-starter-three-band-rubric';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  computeWeightedBandPercentage,
  computeWeightedPercentageForCategories,
  formatAssignmentGrade,
  isPointsScaleScoringType,
  scalePointScore,
} from '~/domain/grading/gradeMath';
import { rubricScaleGradeFields } from '~/domain/grading/recorded-grade';
import {
  scoreFieldBounds,
  snapToScaleValue,
  type ScoreFieldScale,
} from './score-field-bounds';

/**
 * Brian's reminder, as a test: the score field has to accept any whole
 * number, or the scaled scores never reach the gradebook.
 *
 * For each of the five assignment types the Grading Assistant grades — and
 * the three-band Class Starter an admin can switch to — at the point values
 * teachers actually use:
 *
 * 1. Every score the Grading Assistant can give becomes a whole number of
 *    points out of the assignment's value, and the gradebook shows it.
 * 2. The teacher's score field keeps every whole number from 0 to the point
 *    value exactly as typed — nothing is snapped onto the rubric's bands.
 */

const TYPES: Array<[string, AssignmentTypeRubricConfig]> = [
  ['Thesis-Driven Essay', parseAssignmentTypeRubricConfig({})],
  [
    'Pre-Writing',
    parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'prewriting' }),
  ],
  [
    'Thesis Statement',
    parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'thesis_statement' }),
  ],
  [
    'Class Starter',
    parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'class_starter' }),
  ],
  [
    'Class Starter (three bands)',
    parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'class_starter',
      rubricJson: CLASS_STARTER_THREE_BAND_SCHEMA.rubric,
      scoringScaleJson: CLASS_STARTER_THREE_BAND_SCHEMA.scoringScale,
      gradingPromptConfigJson: CLASS_STARTER_THREE_BAND_SCHEMA.promptConfig,
    }),
  ],
  [
    'Exit Ticket',
    parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'exit_ticket' }),
  ],
];

const POINT_VALUES = [5, 10, 20, 100];

/** Every score the Grading Assistant may return for a category. */
function assistantScores(
  category: RubricCategory,
  minScore: number,
  maxScore: number
): number[] {
  if (category.scoreLabels?.length) {
    return category.scoreLabels.map((entry) => entry.value);
  }
  const range = category.bands?.length
    ? {
        min: Math.min(...category.bands.map((band) => band.min)),
        max: Math.max(...category.bands.map((band) => band.max)),
      }
    : { min: minScore, max: maxScore };
  return Array.from(
    { length: range.max - range.min + 1 },
    (_, index) => range.min + index
  );
}

/** What the Grading Assistant records when every category gets `score`. */
function recordedGrade(config: AssignmentTypeRubricConfig, score: number) {
  const categories = config.rubric.categories;
  const rubricScores = Object.fromEntries(
    categories.map((category) => [category.key, { score }])
  );
  const scale = rubricScaleGradeFields({
    categories: categories.map(() => ({ score })),
    scoringType: config.scoringScale.type,
    maxScore: config.scoringScale.maxScore,
  });
  if (scale) return { score: scale.score, numericPercentage: null };
  const percent = categories.some((category) => category.bands?.length)
    ? computeWeightedBandPercentage(rubricScores, categories)
    : computeWeightedPercentageForCategories(rubricScores, categories);
  return { score: null, numericPercentage: percent };
}

function fieldScale(config: AssignmentTypeRubricConfig): ScoreFieldScale {
  return {
    isRawPoints: isPointsScaleScoringType(config.scoringScale.type),
    scoringType: config.scoringScale.type,
    minScore: config.scoringScale.minScore,
    maxScore: config.scoringScale.maxScore,
    step: config.scoringScale.step,
  };
}

describe.each(TYPES)('%s', (_name, config) => {
  test.each(POINT_VALUES)(
    'every Grading Assistant score reaches the gradebook as whole points out of %i',
    (pointValue) => {
      const scores = new Set(
        config.rubric.categories.flatMap((category) =>
          assistantScores(
            category,
            config.scoringScale.minScore,
            config.scoringScale.maxScore
          )
        )
      );
      expect(scores.size).toBeGreaterThan(0);

      for (const score of scores) {
        const grade = recordedGrade(config, score);
        // What the panel puts in the score field after the assistant runs.
        const fieldValue =
          grade.score != null
            ? scalePointScore(grade.score, pointValue)?.earned
            : Math.round(((grade.numericPercentage ?? 0) / 100) * pointValue);
        expect(Number.isInteger(fieldValue)).toBe(true);
        expect(fieldValue).toBeGreaterThanOrEqual(0);
        expect(fieldValue).toBeLessThanOrEqual(pointValue);

        const shown = formatAssignmentGrade({
          submitForGrade: true,
          numericPercentage: grade.numericPercentage,
          letterGrade: null,
          pointValue,
          score: grade.score,
        });
        expect(shown).toMatch(new RegExp(`^\\d+ / ${pointValue}$`));
      }
    }
  );

  test.each(POINT_VALUES)(
    'the score field keeps every whole number from 0 to %i as typed',
    (pointValue) => {
      const bounds = scoreFieldBounds(fieldScale(config), pointValue);
      expect(bounds).toEqual({ min: 0, max: pointValue, step: 1 });
      for (let typed = 0; typed <= pointValue; typed += 1) {
        expect(snapToScaleValue(typed, bounds, pointValue)).toBe(typed);
      }
      // A typed score saves as exactly that many points and shows as such.
      for (const typed of [0, 1, pointValue - 1, pointValue]) {
        expect(
          formatAssignmentGrade({
            submitForGrade: true,
            numericPercentage: Math.round((typed / pointValue) * 100),
            pointValue,
            score: `${typed}/${pointValue}`,
          })
        ).toBe(`${typed} / ${pointValue}`);
      }
    }
  );

  test('scores on every whole number of its own scale, with no step to snap to', () => {
    expect(config.scoringScale.step ?? 1).toBe(1);
  });
});

describe('score field bounds', () => {
  test('an assignment with a point value accepts any whole number up to it', () => {
    expect(
      scoreFieldBounds(
        {
          isRawPoints: true,
          scoringType: 'rubric_points',
          minScore: 0,
          maxScore: 30,
          step: 10,
        },
        10
      )
    ).toEqual({ min: 0, max: 10, step: 1 });
  });

  test('a legacy assignment with no point value keeps its rubric range and step', () => {
    const bounds = scoreFieldBounds(
      {
        isRawPoints: true,
        scoringType: 'rubric_points',
        minScore: 0,
        maxScore: 30,
        step: 10,
      },
      null
    );
    expect(bounds).toEqual({ min: 0, max: 30, step: 10 });
    expect(snapToScaleValue(17, bounds, 30)).toBe(20);
  });

  test('pulls a score outside the range to its nearest end', () => {
    const bounds = { min: 0, max: 10, step: 1 };
    expect(snapToScaleValue(14, bounds, 10)).toBe(10);
    expect(snapToScaleValue(-3, bounds, 10)).toBe(0);
  });
});
