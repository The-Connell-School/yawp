import { describe, expect, test } from 'bun:test';

import {
  getCategoryScoreBand,
  getCategoryScoreBounds,
  isBandScoredRubric,
  isScoreInCategoryBands,
} from '~/domain/assignment-types/rubric-category-options';
import { buildGradingPromptShape } from '~/domain/grading/grading-prompt-shape';
import { buildGradingRequest } from '~/domain/grading/grading-request';
import { getAssignmentTypeGradingInstructions } from '~/domain/assignment-types/assignment-type-grading-config.server';

import {
  GBA300_INTERNATIONAL_ETIQUETTE,
  GBA300_INTERNATIONAL_EXPANSION,
} from './gba300-rubrics';
import {
  GBA300_ETIQUETTE_EXEMPLARY_SCORES,
  GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY_SCORE,
  GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY,
  GBA300_ETIQUETTE_INVALID_GENERIC_SCORES,
} from './ua-rubric-scoring-fixtures';
import { computeWeightedBandPercentage } from '~/domain/grading/gradeMath';

const etiquette = GBA300_INTERNATIONAL_ETIQUETTE;
const expansion = GBA300_INTERNATIONAL_EXPANSION;

describe('UA rubric scoring validation (MVP)', () => {
  test('GBA 300 International Etiquette declares four band-scored categories with raw maxima 5/20/20/5', () => {
    expect(etiquette.title).toBe('GBA 300: International Etiquette');
    expect(etiquette.rubric.categories.map((category) => category.key)).toEqual([
      'introduction',
      'country_1_its_two_topics',
      'country_2_its_two_topics',
      'conclusion',
    ]);
    expect(isBandScoredRubric(etiquette.rubric.categories)).toBe(true);
    expect(
      etiquette.rubric.categories.map(
        (category) => getCategoryScoreBounds(category)?.max
      )
    ).toEqual([5, 20, 20, 5]);
    expect(etiquette.scoringScale).toMatchObject({
      type: 'weighted_percent',
      compositeMax: 50,
    });
    expect(etiquette.scoringScale.maxScore).not.toBe(100);
  });

  test('Introduction top band is Exemplary at 5 raw points', () => {
    const introduction = etiquette.rubric.categories[0];
    const topBand = introduction.bands?.at(-1);

    expect(topBand).toMatchObject({
      min: 5,
      max: 5,
      label: 'Exemplary',
    });
    expect(
      isScoreInCategoryBands(introduction, GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY_SCORE)
    ).toBe(true);
    expect(isScoreInCategoryBands(introduction, 6)).toBe(false);
    expect(
      getCategoryScoreBand(introduction, GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY_SCORE)
        ?.label
    ).toBe('Exemplary');
  });

  test('the grading prompt carries Introduction band language, not a generic 1-100 scale', () => {
    const shape = buildGradingPromptShape({
      categories: etiquette.rubric.categories,
      minScore: etiquette.scoringScale.minScore,
      maxScore: etiquette.scoringScale.maxScore,
      studentFirstName: 'Jordan',
    });

    expect(shape.bandScored).toBe(true);
    expect(shape.systemPrompt).toContain(
      "choose an integer inside that band's range"
    );
    expect(shape.systemPrompt).not.toContain('Scores must be integers 1-100');
    expect(shape.rubricText).toContain('introduction: Introduction (10%)');
    expect(shape.rubricText).toContain('5-5 Exemplary');
    expect(shape.rubricText).toContain('18-20 Exemplary');
  });

  test('the approved Introduction sample is wired into a grading request the assistant can score', () => {
    const instructions = getAssignmentTypeGradingInstructions(
      etiquette.promptConfig as Record<string, unknown>
    );
    const shape = buildGradingPromptShape({
      categories: etiquette.rubric.categories,
      minScore: etiquette.scoringScale.minScore,
      maxScore: etiquette.scoringScale.maxScore,
      studentFirstName: 'Jordan',
    });
    const request = buildGradingRequest({
      promptShape: shape,
      instructions,
      label: etiquette.title,
      studentFirstName: 'Jordan',
      assignmentPrompt:
        'Compare two countries on interpersonal business communication using Global Road Warrior.',
      essayText: GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY,
    });

    expect(request.userPrompt).toContain(GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY);
    expect(request.userPrompt).toContain('Do not convert a section to a 0–100 score');
    expect(request.userPrompt).toContain('5-5 Exemplary');
  });

  test('exemplary raw scores for every category pass band validation and normalize to 100%', () => {
    for (const category of etiquette.rubric.categories) {
      const score =
        GBA300_ETIQUETTE_EXEMPLARY_SCORES[
          category.key as keyof typeof GBA300_ETIQUETTE_EXEMPLARY_SCORES
        ];
      expect(isScoreInCategoryBands(category, score)).toBe(true);
      expect(getCategoryScoreBand(category, score)?.label).toBe('Exemplary');
    }

    const rubricScores = Object.fromEntries(
      Object.entries(GBA300_ETIQUETTE_EXEMPLARY_SCORES).map(([key, score]) => [
        key,
        { score },
      ])
    );

    expect(
      computeWeightedBandPercentage(rubricScores, etiquette.rubric.categories)
    ).toBe(100);
  });

  test('generic 100-point style category scores fail band validation', () => {
    for (const category of etiquette.rubric.categories) {
      const score =
        GBA300_ETIQUETTE_INVALID_GENERIC_SCORES[
          category.key as keyof typeof GBA300_ETIQUETTE_INVALID_GENERIC_SCORES
        ];
      expect(isScoreInCategoryBands(category, score)).toBe(false);
    }
  });

  test('GBA 300 International Expansion Plan is band-scored with department raw maxima, not a flat 1-100 scale', () => {
    expect(expansion.title).toBe('GBA 300: International Expansion Plan');
    expect(isBandScoredRubric(expansion.rubric.categories)).toBe(true);
    expect(expansion.rubric.categories).toHaveLength(9);
    expect(
      expansion.rubric.categories.map(
        (category) => getCategoryScoreBounds(category)?.max
      )
    ).toEqual([10, 10, 20, 20, 5, 5, 10, 10, 10]);
    expect(expansion.promptConfig.gradingInstructions).toContain(
      'Do not convert a section to a 0–100 score'
    );
  });
});
