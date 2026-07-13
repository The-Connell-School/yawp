import { describe, expect, mock, test } from 'bun:test';
import type { ResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { runGradingAssistantScratchEvaluation } from './grading-assistant-scratch-evaluation.server';

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

describe('runGradingAssistantScratchEvaluation', () => {
  test('runs the production prompt and applies one narrow criterion evaluator', async () => {
    const execute = mock(
      async ({
        purpose,
      }: {
        purpose: 'grading' | 'criterion';
        system: string;
        messages: Array<{ role: 'user'; content: string }>;
        maxTokens: number;
        temperature?: number;
      }) =>
        purpose === 'grading'
          ? JSON.stringify({
              categories: [
                {
                  key: 'claim',
                  score: 4,
                  comment: 'The position is clear and defensible.',
                },
              ],
              overallComment: 'Jordan, make the stakes more explicit.',
            })
          : JSON.stringify({
              passed: true,
              evidence:
                'The feedback identifies the clear claim and one document-grounded next step.',
            })
    );

    const result = await runGradingAssistantScratchEvaluation({
      gradingConfig,
      documentText: 'School uniforms should remain optional.',
      criterion:
        'The feedback should identify the claim and give one grounded next step.',
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      execute,
    });

    expect(result.status).toBe('pass');
    expect(result.responseContract.status).toBe('pass');
    expect(result.criterion.status).toBe('pass');
    expect(result.gradingOutput?.categories[0].score).toBe(4);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0].system).toContain(
      'Assignment type system instructions:\nAct as a precise evaluator.'
    );
    expect(execute.mock.calls[0]?.[0].messages[0].content).toContain(
      'Essay:\nSchool uniforms should remain optional.'
    );
    expect(execute.mock.calls[1]?.[0].messages[0].content).toContain(
      'The feedback should identify the claim and give one grounded next step.'
    );
  });

  test('blocks the criterion evaluator when the grading output contract fails', async () => {
    const execute = mock(async () => 'not valid grading JSON');

    const result = await runGradingAssistantScratchEvaluation({
      gradingConfig,
      documentText: 'A short case document.',
      criterion: 'The feedback should be grounded in the document.',
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      execute,
    });

    expect(result.status).toBe('fail');
    expect(result.responseContract.status).toBe('fail');
    expect(result.criterion.status).toBe('blocked');
    expect(result.gradingOutput).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('requires review when the criterion evaluator returns an invalid verdict', async () => {
    const execute = mock(
      async ({ purpose }: { purpose: 'grading' | 'criterion' }) =>
        purpose === 'grading'
          ? JSON.stringify({
              categories: [
                { key: 'claim', score: 4, comment: 'Clear position.' },
              ],
              overallComment: 'Jordan, explain the stakes next.',
            })
          : 'not valid evaluator JSON'
    );

    const result = await runGradingAssistantScratchEvaluation({
      gradingConfig,
      documentText: 'A short case document.',
      criterion: 'The feedback should be grounded in the document.',
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      execute,
    });

    expect(result.status).toBe('needs_review');
    expect(result.responseContract.status).toBe('pass');
    expect(result.criterion).toEqual({
      status: 'blocked',
      evidence: 'The evaluator did not return a valid pass/fail result.',
    });
  });
});
