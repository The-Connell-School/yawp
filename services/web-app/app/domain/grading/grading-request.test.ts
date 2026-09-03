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

  test('the library thesis rubric sends exactly the production thesis request', () => {
    const builtIn = getThesisDefaultRubricConfig();
    const thesis = STARTER_RUBRICS[0];
    const productionRequest = requestFor({
      categories: builtIn.rubric.categories,
      minScore: builtIn.scoringScale.minScore,
      maxScore: builtIn.scoringScale.maxScore,
      promptConfig: builtIn.promptConfig as Record<string, unknown>,
      label: 'Thesis-driven essay grading assistant',
    });
    const libraryRequest = requestFor({
      categories: thesis.rubric.categories,
      minScore: thesis.scoringScale.minScore,
      maxScore: thesis.scoringScale.maxScore,
      promptConfig: thesis.promptConfig as Record<string, unknown>,
      label: 'Thesis-driven essay grading assistant',
    });

    expect(libraryRequest).toEqual(productionRequest);
  });

  test('the library thesis rubric keeps every production category unchanged', () => {
    const builtIn = getThesisDefaultRubricConfig();
    const thesis = STARTER_RUBRICS[0];
    expect(thesis.rubric).toEqual(builtIn.rubric);
    expect(thesis.scoringScale).toEqual(builtIn.scoringScale);
    expect(thesis.promptConfig).toEqual(builtIn.promptConfig);
    expect(thesis.outputSchema).toEqual(builtIn.outputSchema);
    expect(thesis.calibrationNotes).toEqual(builtIn.calibrationNotes);
  });

  test('the daily rubric carries its production instructions while thesis uses its production preset', () => {
    expect(STARTER_RUBRICS[0].promptConfig.instructionsPreset).toBe(
      'legacy_thesis_driven_essay'
    );
    expect(
      STARTER_RUBRICS[1].promptConfig.gradingInstructions?.length ?? 0
    ).toBeGreaterThan(100);
  });
});

describe('per-assignment grading context in the request', () => {
  const base = {
    promptShape: {
      categoryFeedbackEnabled: false,
      bandScored: true,
      systemPrompt: 'system',
      rubricText: 'rubric',
    },
    instructions: {
      mode: 'unified' as const,
      gradingInstructions: 'grade it',
    },
    label: 'Exit Ticket understanding',
    studentFirstName: 'Sam',
    assignmentPrompt: 'In your own words, explain erosion.',
    essayText: 'Erosion is when the material moves.',
  };

  test('are placed with the prompt, so the grader judges against them', () => {
    const request = buildGradingRequest({
      ...base,
      gradingContext: 'Should mention: the material moves.',
    });

    expect(request.userPrompt).toInclude('Should mention: the material moves.');
    // After the prompt and before the student's writing.
    expect(request.userPrompt.indexOf('Should mention')).toBeGreaterThan(
      request.userPrompt.indexOf('Assignment prompt:')
    );
    expect(request.userPrompt.indexOf('Should mention')).toBeLessThan(
      request.userPrompt.indexOf('Essay:')
    );
  });

  test('change nothing for an assignment that has none', () => {
    // Every existing assignment type supplies no notes, so its payload must
    // be exactly what it was before this existed.
    const without = buildGradingRequest(base);
    const explicitlyEmpty = buildGradingRequest({
      ...base,
      gradingContext: '',
    });
    const explicitlyNull = buildGradingRequest({
      ...base,
      gradingContext: null,
    });

    expect(explicitlyEmpty).toEqual(without);
    expect(explicitlyNull).toEqual(without);
    expect(without.userPrompt).toInclude('Assignment prompt:');
  });
});
