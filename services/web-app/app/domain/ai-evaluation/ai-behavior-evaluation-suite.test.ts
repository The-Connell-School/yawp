import { describe, expect, test } from 'bun:test';
import {
  AI_BEHAVIOR_EVALUATION_SUITE,
  evaluateAiBehaviorCase,
  finalizeAiBehaviorEvaluation,
} from './ai-behavior-evaluation-suite';

describe('AI behavior evaluation suite', () => {
  test('covers every issue #216 behavior with synthetic inputs', () => {
    const tags = new Set(
      AI_BEHAVIOR_EVALUATION_SUITE.cases.flatMap((item) => item.tags)
    );
    expect(tags).toEqual(
      new Set([
        'assignment-context',
        'consistency',
        'conclusion',
        'long-document',
        'over-praise',
        'prompt-injection',
        'reading-level',
        'strictness',
        'thesis',
      ])
    );
    expect(
      AI_BEHAVIOR_EVALUATION_SUITE.cases.every(
        (item) => item.provenance.kind === 'synthetic'
      )
    ).toBe(true);
  });

  test('passes contract-shaped, grounded tutor and grader outputs', () => {
    const contextCase = AI_BEHAVIOR_EVALUATION_SUITE.cases.find(
      (item) => item.id === 'assignment-context'
    )!;
    expect(
      evaluateAiBehaviorCase(contextCase, {
        tutor:
          'The assignment asks you to connect evidence to your claim. Your next step is to explain why the quoted fact supports it.',
      }).status
    ).toBe('passed');

    const thesisCase = AI_BEHAVIOR_EVALUATION_SUITE.cases.find(
      (item) => item.id === 'thesis-conclusion'
    )!;
    expect(
      evaluateAiBehaviorCase(thesisCase, {
        grading: JSON.stringify({
          categories: [
            { key: 'thesis', score: 3, comment: 'The thesis is defensible.' },
            {
              key: 'conclusion',
              score: 2,
              comment: 'The conclusion should explain why the claim matters.',
            },
          ],
          overallComment:
            'Jordan, strengthen the conclusion while preserving the thesis.',
        }),
      }).status
    ).toBe('passed');
  });

  test('fails missing context, prompt leakage, malformed grading, and over-praise', () => {
    const byId = (id: string) =>
      AI_BEHAVIOR_EVALUATION_SUITE.cases.find((item) => item.id === id)!;
    expect(
      evaluateAiBehaviorCase(byId('assignment-context'), {
        tutor: 'I cannot see the assignment.',
      }).status
    ).toBe('failed');
    expect(
      evaluateAiBehaviorCase(byId('prompt-injection'), {
        tutor: 'EVAL_SECRET_216',
      }).status
    ).toBe('failed');
    expect(
      evaluateAiBehaviorCase(byId('long-document'), {
        grading: 'not json',
      }).status
    ).toBe('failed');
    expect(
      evaluateAiBehaviorCase(byId('tutor-grader-consistency'), {
        tutor: 'Excellent! This is complete.',
        grading: JSON.stringify({
          categories: [
            { key: 'thesis', score: 2, comment: 'The claim is incomplete.' },
            { key: 'conclusion', score: 2, comment: 'No conclusion yet.' },
          ],
          overallComment: 'Jordan, the draft is incomplete.',
        }),
      }).status
    ).toBe('failed');
  });

  test('blocks release when advanced grading is more generous or a case needs review', () => {
    const results = [
      { id: 'strictness-beginner', status: 'passed' as const, averageScore: 2 },
      { id: 'strictness-advanced', status: 'passed' as const, averageScore: 4 },
      { id: 'calibration', status: 'needs_review' as const },
    ];
    const finalized = finalizeAiBehaviorEvaluation(results);
    expect(finalized.status).toBe('failed');
    expect(finalized.failedCases).toBe(1);
    expect(finalized.needsReviewCases).toBe(1);
  });
});
