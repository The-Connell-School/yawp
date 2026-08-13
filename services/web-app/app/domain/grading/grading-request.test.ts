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
   * The library rubric replaces a code path with data, so what it sends has to
   * be checked against what the code path sent — not assumed. Everything that
   * decides a score is identical; the only difference is which side of the
   * request the score mapping rides on, because a self-contained rubric keeps
   * its instructions in one field instead of two.
   */
  test('the library thesis rubric sends what the built-in thesis path sends', () => {
    const builtIn = getThesisDefaultRubricConfig();
    const library = STARTER_RUBRICS[0];

    expect(library.rubric.categories).toEqual(builtIn.rubric.categories);
    expect(library.scoringScale.minScore).toBe(builtIn.scoringScale.minScore);
    expect(library.scoringScale.maxScore).toBe(builtIn.scoringScale.maxScore);

    const label = 'Thesis-driven essay grading assistant';
    const shared = {
      categories: builtIn.rubric.categories,
      minScore: builtIn.scoringScale.minScore,
      maxScore: builtIn.scoringScale.maxScore,
      label,
    };
    const fromCode = requestFor({
      ...shared,
      promptConfig: builtIn.promptConfig as Record<string, unknown>,
    });
    const fromLibrary = requestFor({
      ...shared,
      promptConfig: library.promptConfig as Record<string, unknown>,
    });

    // Both send the whole rubric text and the whole score mapping.
    for (const request of [fromCode, fromLibrary]) {
      const whole = `${request.system}\n${request.userPrompt}`;
      expect(whole).toContain(gradingAssistantRubricInstructions);
      expect(whole).toContain(gradingAssistantScoreScaleInstructions);
      expect(whole).toContain('thesis_and_content: Thesis/Content (25%)');
      expect(whole).toContain(`Essay:\n${ESSAY}`);
    }

    // The code path puts the score mapping in the system prompt; the library
    // rubric puts it with the rest of its instructions in the user prompt.
    expect(fromCode.system).toContain(gradingAssistantScoreScaleInstructions);
    expect(fromLibrary.userPrompt).toContain(
      gradingAssistantScoreScaleInstructions
    );
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
