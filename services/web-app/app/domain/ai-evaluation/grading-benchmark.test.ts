import { describe, expect, mock, test } from 'bun:test';
import { gradingAssistantBenchmarkV1 } from './grading-assistant-benchmark.v1';
import {
  benchmarkCaseFingerprint,
  benchmarkReviewKey,
  isBenchmarkCaseApproved,
  runGradingBenchmark,
  type GradingAssistantBenchmarkOutput,
  type GradingBenchmarkCase,
  type GradingBenchmarkSuite,
} from './grading-benchmark';

function oneCaseSuite(
  benchmarkCase: GradingBenchmarkCase = gradingAssistantBenchmarkV1.cases[0]
): GradingBenchmarkSuite {
  return { ...gradingAssistantBenchmarkV1, cases: [benchmarkCase] };
}

function validOutputFor(
  benchmarkCase: GradingBenchmarkCase
): GradingAssistantBenchmarkOutput {
  return {
    categories: gradingAssistantBenchmarkV1.rubric.categoryKeys.map((key) => {
      const band = benchmarkCase.expectations.scoreBands[key];
      return {
        key,
        score: band.min,
        comment: `Evidence-based feedback for ${key}.`,
      };
    }),
    overallComment: `${benchmarkCase.input.studentFirstName}, revise the most important weakness next.`,
  };
}

function approvedCase(
  benchmarkCase: GradingBenchmarkCase
): GradingBenchmarkCase {
  return {
    ...benchmarkCase,
    approval: {
      status: 'approved',
      requiredRoles: ['product', 'educator'],
      approvals: [
        {
          reviewer: 'Product Reviewer',
          role: 'product',
          approvedAt: '2026-07-13T15:00:00.000Z',
          caseFingerprint: benchmarkCaseFingerprint(benchmarkCase),
        },
        {
          reviewer: 'Educator Reviewer',
          role: 'educator',
          approvedAt: '2026-07-13T15:01:00.000Z',
          caseFingerprint: benchmarkCaseFingerprint(benchmarkCase),
        },
      ],
    },
  };
}

describe('grading benchmark case approval', () => {
  test('requires named product and educator approvals for release use', () => {
    const draft = gradingAssistantBenchmarkV1.cases[0];
    const productOnly: GradingBenchmarkCase = {
      ...draft,
      approval: {
        status: 'approved',
        requiredRoles: ['product', 'educator'],
        approvals: [
          {
            reviewer: 'Product Reviewer',
            role: 'product',
            approvedAt: '2026-07-13T15:00:00.000Z',
            caseFingerprint: benchmarkCaseFingerprint(draft),
          },
        ],
      },
    };

    expect(isBenchmarkCaseApproved(draft)).toBe(false);
    expect(isBenchmarkCaseApproved(productOnly)).toBe(false);
    expect(isBenchmarkCaseApproved(approvedCase(draft))).toBe(true);
  });

  test('invalidates approvals when reviewed case content changes', () => {
    const original = gradingAssistantBenchmarkV1.cases[0];
    const approved = approvedCase(original);
    const changedAfterApproval: GradingBenchmarkCase = {
      ...approved,
      input: {
        ...approved.input,
        essayText: `${approved.input.essayText} New unreviewed evidence.`,
      },
    };

    expect(isBenchmarkCaseApproved(approved)).toBe(true);
    expect(isBenchmarkCaseApproved(changedAfterApproval)).toBe(false);
  });
});

describe('grading benchmark runner', () => {
  test('runs deterministic checks and leaves qualitative judgments pending review', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const execute = mock(async () => validOutputFor(benchmarkCase));

    const result = await runGradingBenchmark({
      suite: oneCaseSuite(benchmarkCase),
      execute,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('needs_review');
    expect(result.cases[0].evaluations).toContainEqual(
      expect.objectContaining({
        evaluatorId: 'response-contract',
        status: 'pass',
      })
    );
    expect(result.cases[0].evaluations).toContainEqual(
      expect.objectContaining({
        evaluatorId: 'score-calibration',
        status: 'pass',
      })
    );
    expect(result.cases[0].evaluations).toContainEqual(
      expect.objectContaining({ status: 'needs_review' })
    );
  });

  test('runs the full draft corpus and reports every unresolved case', async () => {
    const result = await runGradingBenchmark({
      suite: gradingAssistantBenchmarkV1,
      execute: async (benchmarkCase) => validOutputFor(benchmarkCase),
    });

    expect(result.summary).toEqual({
      total: gradingAssistantBenchmarkV1.cases.length,
      passed: 0,
      failed: 0,
      needsReview: gradingAssistantBenchmarkV1.cases.length,
      blocked: 0,
    });
    expect(result.status).toBe('needs_review');
  });

  test('passes a case only after every qualitative criterion has review evidence', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const reviews = Object.fromEntries(
      benchmarkCase.expectations.qualitative.map((criterion) => [
        benchmarkReviewKey(benchmarkCase.id, criterion.id),
        {
          status: 'pass' as const,
          method: 'human' as const,
          reviewer: 'Educator Reviewer',
          evidence: 'The feedback satisfies the stated criterion.',
        },
      ])
    );

    const result = await runGradingBenchmark({
      suite: oneCaseSuite(benchmarkCase),
      execute: async () => validOutputFor(benchmarkCase),
      reviews,
    });

    expect(result.status).toBe('pass');
    expect(result.cases[0].status).toBe('pass');
  });

  test('fails when a category score falls outside its approved band', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const output = validOutputFor(benchmarkCase);
    output.categories[0].score =
      benchmarkCase.expectations.scoreBands[output.categories[0].key].max + 1;

    const result = await runGradingBenchmark({
      suite: oneCaseSuite(benchmarkCase),
      execute: async () => output,
    });

    expect(result.status).toBe('fail');
    expect(result.cases[0].evaluations).toContainEqual(
      expect.objectContaining({
        evaluatorId: 'score-calibration',
        status: 'fail',
      })
    );
  });

  test('fails malformed output before treating it as educationally acceptable', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];

    const result = await runGradingBenchmark({
      suite: oneCaseSuite(benchmarkCase),
      execute: async () => ({ categories: [], overallComment: '' }),
    });

    expect(result.status).toBe('fail');
    expect(result.cases[0].evaluations).toContainEqual(
      expect.objectContaining({
        evaluatorId: 'response-contract',
        status: 'fail',
      })
    );
  });

  test('preserves a failed qualitative judgment instead of averaging it away', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const firstCriterion = benchmarkCase.expectations.qualitative[0];

    const result = await runGradingBenchmark({
      suite: oneCaseSuite(benchmarkCase),
      execute: async () => validOutputFor(benchmarkCase),
      reviews: {
        [benchmarkReviewKey(benchmarkCase.id, firstCriterion.id)]: {
          status: 'fail',
          method: 'human',
          reviewer: 'Educator Reviewer',
          evidence: 'The response invents evidence that is not in the essay.',
        },
      },
    });

    expect(result.status).toBe('fail');
    expect(result.cases[0].evaluations).toContainEqual(
      expect.objectContaining({
        criterionId: firstCriterion.id,
        status: 'fail',
      })
    );
  });

  test('blocks release runs before executing unapproved cases', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const execute = mock(async () => validOutputFor(benchmarkCase));

    const result = await runGradingBenchmark({
      suite: oneCaseSuite(benchmarkCase),
      mode: 'release',
      execute,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe('blocked');
    expect(result.cases[0].status).toBe('blocked');
  });
});
