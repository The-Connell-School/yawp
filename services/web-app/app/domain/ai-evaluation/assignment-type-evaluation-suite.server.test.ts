import { describe, expect, mock, test } from 'bun:test';
import type { ResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { runAssignmentTypeEvaluationSuite } from './assignment-type-evaluation-suite.server';

const gradingConfig: ResolvedAssignmentTypeGradingConfig = {
  source: 'assignment-type',
  assignmentTypeId: 'assignment-type-1',
  assignmentTypeKind: null,
  assignmentTypeTitle: 'Argument Essay',
  label: 'Argument Essay',
  version: 4,
  scoringType: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
  step: 1,
  rubricIncomplete: false,
  rubricCategories: [
    {
      key: 'claim',
      label: 'Claim',
      weight: 1,
      description: 'States a defensible position.',
    },
  ],
  instructions: {
    mode: 'unified',
    systemInstructions: 'Act as a precise evaluator.',
    gradingInstructions: 'Grade only what the document demonstrates.',
  },
  rubricSnapshot: {},
  promptConfigSnapshot: {},
  outputSchemaSnapshot: {},
  calibrationNotes: null,
  sourceTemplateId: null,
  sourceTemplateSlug: null,
};

const evaluationCases = [
  {
    id: 'case-claim-clear',
    title: 'Clear claim',
    rubricCategoryKey: 'claim',
    documentText: 'School uniforms should remain optional.',
    criterion: 'The feedback identifies the clear claim.',
  },
  {
    id: 'case-claim-missing',
    title: 'Missing claim',
    rubricCategoryKey: 'claim',
    documentText: 'There are several things to consider about uniforms.',
    criterion: 'The feedback identifies that the claim is missing.',
  },
];

function gradingOutput() {
  return JSON.stringify({
    categories: [{ key: 'claim', score: 4, comment: 'Grounded feedback.' }],
    overallComment: 'Jordan, make the stakes more explicit.',
  });
}

describe('runAssignmentTypeEvaluationSuite', () => {
  test('runs every case and returns a pass/fail summary', async () => {
    const execute = mock(
      async ({
        evaluationCase,
        purpose,
      }: {
        evaluationCase: (typeof evaluationCases)[number];
        purpose: 'grading' | 'criterion';
      }) => {
        if (purpose === 'grading') return gradingOutput();
        return JSON.stringify({
          passed: evaluationCase.id === 'case-claim-clear',
          evidence: `Evidence for ${evaluationCase.title}.`,
        });
      }
    );

    const result = await runAssignmentTypeEvaluationSuite({
      gradingConfig,
      evaluationCases,
      execute,
    });

    expect(result.summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      needsReview: 0,
    });
    expect(result.results.map((item) => [item.caseId, item.status])).toEqual([
      ['case-claim-clear', 'pass'],
      ['case-claim-missing', 'fail'],
    ]);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  test('continues through the suite when one case execution throws', async () => {
    const execute = mock(
      async ({
        evaluationCase,
        purpose,
      }: {
        evaluationCase: (typeof evaluationCases)[number];
        purpose: 'grading' | 'criterion';
      }) => {
        if (evaluationCase.id === 'case-claim-clear' && purpose === 'grading') {
          throw new Error('Model unavailable for this case.');
        }
        if (purpose === 'grading') return gradingOutput();
        return JSON.stringify({ passed: true, evidence: 'Grounded result.' });
      }
    );

    const result = await runAssignmentTypeEvaluationSuite({
      gradingConfig,
      evaluationCases,
      execute,
    });

    expect(result.summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      needsReview: 0,
    });
    expect(result.results[0]).toMatchObject({
      caseId: 'case-claim-clear',
      status: 'fail',
      evidence: 'Model unavailable for this case.',
    });
    expect(result.results[1]).toMatchObject({
      caseId: 'case-claim-missing',
      status: 'pass',
    });
  });
});
