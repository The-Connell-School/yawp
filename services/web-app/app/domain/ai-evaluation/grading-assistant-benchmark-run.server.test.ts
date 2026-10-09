import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { gradingAssistantBenchmarkV1 } from './grading-assistant-benchmark.v1';
import {
  buildStaticDailyPagesGradingConfig,
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

describe('buildStaticDailyPagesGradingConfig', () => {
  test('builds the built-in Daily Pages grading assistant', () => {
    const config = buildStaticDailyPagesGradingConfig();

    expect(config.rubricCategories.map((category) => category.key)).toEqual([
      'engagement_with_prompt',
    ]);
    expect(config.minScore).toBe(0);
    expect(config.maxScore).toBe(100);
  });
});

describe('runLiveGradingAssistantBenchmarkCase', () => {
  /**
   * The case carries the prompt the way an assignment does, and it reaches
   * the grader exactly as it would in production — with no writing time,
   * which was removed from assignments.
   */
  test('hands the case prompt to the grader, and no writing time', async () => {
    const benchmarkCase = {
      ...gradingAssistantBenchmarkV1.cases[0],
      input: {
        ...gradingAssistantBenchmarkV1.cases[0].input,
        assignmentPrompt: 'Quote the line where the argument turns.',
      },
    };
    const gradingCalls: string[] = [];
    const execute = mock(
      async ({
        purpose,
        messages,
      }: {
        purpose: string;
        messages: Array<{ content: string }>;
      }) => {
        if (purpose === 'criterion') {
          return JSON.stringify({ passed: true, evidence: 'Grounded.' });
        }
        gradingCalls.push(messages.map((message) => message.content).join(''));
        return JSON.stringify(validOutputFor(benchmarkCase));
      }
    );

    await runLiveGradingAssistantBenchmarkCase({
      suite: gradingAssistantBenchmarkV1,
      benchmarkCase,
      gradingConfig: buildStaticThesisGradingConfig(),
      execute,
    });

    expect(gradingCalls).toHaveLength(1);
    expect(gradingCalls[0]).toContain(
      'Quote the line where the argument turns.'
    );
    expect(gradingCalls[0]).not.toContain('Writing time');
  });


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
