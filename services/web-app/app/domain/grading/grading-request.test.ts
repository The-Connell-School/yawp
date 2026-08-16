import { describe, expect, test } from 'bun:test';

import { buildGradingPromptShape } from './grading-prompt-shape';
import { buildGradingRequest } from './grading-request';
import {
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
} from './rubric-instructions';
import { getAssignmentTypeGradingInstructions } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { getThesisDefaultRubricConfig } from '~/domain/assignment-types/assignment-type-rubric-config';
import { STARTER_RUBRICS } from '~/domain/rubrics/starter-rubrics';

const ESSAY = 'The essay text.';

function requestFor({
  categories,
  minScore,
  maxScore,
  promptConfig,
  label,
}: {
  categories: Parameters<typeof buildGradingPromptShape>[0]['categories'];
  minScore: number;
  maxScore: number;
  promptConfig: Record<string, unknown>;
  label: string;
}) {
  return buildGradingRequest({
    promptShape: buildGradingPromptShape({
      categories,
      minScore,
      maxScore,
      studentFirstName: 'Jordan',
    }),
    instructions: getAssignmentTypeGradingInstructions(promptConfig),
    label,
    studentFirstName: 'Jordan',
    assignmentPrompt: null,
    essayText: ESSAY,
  });
}

describe('grading request', () => {
  test('carries the rubric, the instructions, and the essay', () => {
    const request = requestFor({
      categories: [
        { key: 'claim', label: 'Claim', weight: 1, description: 'A claim.' },
      ],
      minScore: 1,
      maxScore: 4,
      promptConfig: { gradingInstructions: 'Judge the claim.' },
      label: 'Test rubric',
    });

    expect(request.system).toContain('"score": 1-4');
    expect(request.system).toContain(
      'Follow the grading instructions in the user prompt exactly.'
    );
    expect(request.userPrompt).toContain('claim: Claim (100%) - A claim.');
    expect(request.userPrompt).toContain('Judge the claim.');
    expect(request.userPrompt).toContain(`Essay:\n${ESSAY}`);
    expect(request.userPrompt).toContain(
      'Assignment prompt: No assignment prompt was provided.'
    );
  });

  test('a category score labels its own words for the model', () => {
    const request = requestFor({
      categories: [
        {
          key: 'engagement',
          label: 'Engagement',
          weight: 1,
          description: 'Showing up.',
          scoreLabels: [
            { value: 30, label: 'ALL IN' },
            { value: 0, label: 'NOT HANDED IN' },
          ],
        },
      ],
      minScore: 0,
      maxScore: 30,
      promptConfig: { gradingInstructions: 'Judge engagement.' },
      label: 'Daily Pages',
    });

    expect(request.userPrompt).toContain(
      'Score meanings: 0 = NOT HANDED IN; 30 = ALL IN'
    );
  });

  /**
   * The built-in thesis path is still what an assignment type falls back to
   * when it has been pointed at no rubric, so it has to keep working exactly as
   * it did: a 1-5 scale with the band language in the instruction text.
   */
  test('the built-in thesis path still sends its 1-5 scale and rubric text', () => {
    const builtIn = getThesisDefaultRubricConfig();
    const request = requestFor({
      categories: builtIn.rubric.categories,
      minScore: builtIn.scoringScale.minScore,
      maxScore: builtIn.scoringScale.maxScore,
      promptConfig: builtIn.promptConfig as Record<string, unknown>,
      label: 'Thesis-driven essay grading assistant',
    });

    expect(request.system).toContain('Scores must be integers 1-5.');
    expect(request.system).toContain(gradingAssistantScoreScaleInstructions);
    expect(request.userPrompt).toContain(gradingAssistantRubricInstructions);
    expect(request.userPrompt).toContain(
      'thesis_and_content: Thesis/Content (25%)'
    );
  });

  test('a banded rubric asks for a band first, then a score inside it', () => {
    const thesis = STARTER_RUBRICS[0];
    const request = requestFor({
      categories: thesis.rubric.categories,
      minScore: thesis.scoringScale.minScore,
      maxScore: thesis.scoringScale.maxScore,
      promptConfig: thesis.promptConfig as Record<string, unknown>,
      label: 'Thesis-driven essay',
    });

    expect(request.system).toContain('"score": 0-100');
    expect(request.system).toContain(
      'first decide which band the writing falls in'
    );
    expect(request.system).not.toContain('Scores must be integers 0-100.');

    // Every band the rubric defines reaches the model attached to its category.
    expect(request.userPrompt).toContain(
      'thesis_and_content: Thesis/Content (25%)'
    );
    expect(request.userPrompt).toContain('  90-100 Exemplary:');
    expect(request.userPrompt).toContain('  80-89 Proficient:');
    expect(request.userPrompt).toContain('  70-79 Developing:');
    expect(request.userPrompt).toContain('  0-69 Struggling:');
  });

  test('the cleaned thesis rubric keeps every judgment it always made', () => {
    const thesis = STARTER_RUBRICS[0];
    const keys = thesis.rubric.categories.map((category) => category.key);

    expect(keys).toEqual([
      'thesis_and_content',
      'organization_and_structure',
      'evidence_and_support',
      'voice_and_style',
      'grammar_and_mechanics',
    ]);
    expect(
      thesis.rubric.categories.map((category) => category.weight)
    ).toEqual([0.25, 0.25, 0.2, 0.2, 0.1]);

    // Every category is judged against the same four bands, and they cover the
    // whole scale with no gap a score could fall into.
    for (const category of thesis.rubric.categories) {
      const bands = (category.bands ?? [])
        .slice()
        .sort((a, b) => a.min - b.min);

      expect(bands.map((band) => band.label)).toEqual([
        'Struggling',
        'Developing',
        'Proficient',
        'Exemplary',
      ]);
      expect(bands[0].min).toBe(0);
      expect(bands.at(-1)?.max).toBe(100);
      for (const [index, band] of bands.slice(1).entries()) {
        expect(band.min).toBe(bands[index].max + 1);
      }
    }
  });

  test('no starter rubric depends on code to supply its instructions', () => {
    for (const rubric of STARTER_RUBRICS) {
      expect(rubric.promptConfig.instructionsPreset ?? '').toBe('');
      expect(rubric.promptConfig.gradingInstructions?.length ?? 0).toBeGreaterThan(
        100
      );
    }
  });
});
