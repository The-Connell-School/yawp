import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { gradingAssistantBenchmarkV1 } from './grading-assistant-benchmark.v1';
import {
  buildStaticThesisGradingConfig,
  runLiveGradingAssistantBenchmark,
  runLiveGradingAssistantBenchmarkCase,
  STATIC_THESIS_GRADING_ASSISTANT_ID,
} from './grading-assistant-benchmark-run.server';
import type { GradingAssistantBenchmarkOutput } from './grading-benchmark';

function validOutputFor(
  benchmarkCase: (typeof gradingAssistantBenchmarkV1.cases)[number]
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

describe('buildStaticThesisGradingConfig', () => {
  test('builds the thesis-default preset grading assistant', () => {
    const config = buildStaticThesisGradingConfig();

    expect(config.assignmentTypeId).toBe(STATIC_THESIS_GRADING_ASSISTANT_ID);
    expect(config.source).toBe('thesis-default');
    expect(config.instructions.mode).toBe('preset');
    expect(config.rubricCategories).toHaveLength(5);
  });
});

describe('runLiveGradingAssistantBenchmarkCase', () => {
  test('runs deterministic checks and LLM judges for qualitative criteria', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const execute = mock(async ({ purpose }: { purpose: string }) => {
      if (purpose === 'criterion') {
        return JSON.stringify({
          passed: true,
          evidence: 'Grounded in the submitted essay.',
        });
      }
      return JSON.stringify(validOutputFor(benchmarkCase));
    });

    const result = await runLiveGradingAssistantBenchmarkCase({
      suite: gradingAssistantBenchmarkV1,
      benchmarkCase,
      gradingConfig: buildStaticThesisGradingConfig(),
      execute,
    });

    expect(result.status).toBe('pass');
    expect(result.evaluations).toContainEqual(
      expect.objectContaining({
        evaluatorId: 'response-contract',
        status: 'pass',
      })
    );
    expect(result.evaluations).toContainEqual(
      expect.objectContaining({
        evaluatorId: 'score-calibration',
        status: 'pass',
      })
    );
    expect(
      result.evaluations.some(
        (evaluation) =>
          evaluation.status === 'pass' && evaluation.reviewer === 'llm-judge'
      )
    ).toBe(true);
  });

  test('returns a fail result when grading execution throws', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const execute = mock(async () => {
      throw new Error('Provider unavailable.');
    });

    const result = await runLiveGradingAssistantBenchmarkCase({
      suite: gradingAssistantBenchmarkV1,
      benchmarkCase,
      gradingConfig: buildStaticThesisGradingConfig(),
      execute,
    });

    expect(result.status).toBe('fail');
    expect(result.evaluations[0]?.message).toContain('Provider unavailable.');
  });
});

describe('runLiveGradingAssistantBenchmark', () => {
  test('runs only the requested cases', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const execute = mock(async ({ purpose }: { purpose: string }) => {
      if (purpose === 'criterion') {
        return JSON.stringify({
          passed: true,
          evidence: 'Grounded in the submitted essay.',
        });
      }
      return JSON.stringify(validOutputFor(benchmarkCase));
    });

    const result = await runLiveGradingAssistantBenchmark({
      suite: gradingAssistantBenchmarkV1,
      caseIds: [benchmarkCase.id],
      execute,
    });

    expect(result.summary.total).toBe(1);
    expect(result.cases[0]?.caseId).toBe(benchmarkCase.id);
  });
});
