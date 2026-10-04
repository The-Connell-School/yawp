import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import {
  runLiveGradingAssistantBenchmark,
  runLiveGradingAssistantBenchmarkCase,
  STATIC_THESIS_GRADING_ASSISTANT_ID,
} from '~/domain/ai-evaluation/grading-assistant-benchmark-run.server';
import { gradingAssistantBenchmarkV1 } from '~/domain/ai-evaluation/grading-assistant-benchmark.v1';
import { requireAdmin } from '~/utils/auth.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import crypto from 'node:crypto';
import { computeIpHash } from '~/utils/ai-usage-log.server';

const RunBenchmarkInputSchema = z.object({
  intent: z.enum(['runCase', 'runAll']),
  caseId: z.string().min(1).optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const parsedInput = RunBenchmarkInputSchema.safeParse(
    Object.fromEntries(formData)
  );
  if (!parsedInput.success) {
    return dataResponse(
      { success: false, message: 'Invalid benchmark run request.' },
      { status: 400 }
    );
  }

  const input = parsedInput.data;
  if (input.intent === 'runCase' && !input.caseId) {
    return dataResponse(
      { success: false, message: 'Choose a case to run.' },
      { status: 400 }
    );
  }

  const benchmarkCase =
    input.intent === 'runCase'
      ? gradingAssistantBenchmarkV1.cases.find(
          (item) => item.id === input.caseId
        )
      : null;
  if (input.intent === 'runCase' && !benchmarkCase) {
    return dataResponse(
      { success: false, message: 'Benchmark case not found.' },
      { status: 404 }
    );
  }

  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  const useE2EFixture = process.env.E2E === 'true';
  const execute = async ({
    purpose,
    benchmarkCaseId,
    criterionId,
    ...completion
  }: Parameters<
    typeof runLiveGradingAssistantBenchmarkCase
  >[0]['execute'] extends (input: infer T) => Promise<string>
    ? T
    : never) => {
    if (useE2EFixture) {
      const fixtureCase =
        benchmarkCase ??
        gradingAssistantBenchmarkV1.cases.find(
          (item) => item.id === benchmarkCaseId
        );
      if (!fixtureCase) {
        throw new Error('Benchmark case not found.');
      }

      if (purpose === 'criterion') {
        return JSON.stringify({
          passed: true,
          evidence: 'The response stays grounded in the case document.',
        });
      }

      return JSON.stringify({
        categories: gradingAssistantBenchmarkV1.rubric.categoryKeys.map(
          (key) => {
            const band = fixtureCase.expectations.scoreBands[key];
            return {
              key,
              score: band.min,
              comment: `${key} feedback grounded in the essay.`,
            };
          }
        ),
        overallComment: `${fixtureCase.input.studentFirstName}, strengthen the next revision.`,
      });
    }

    return getLLMCompletion({
      model,
      ...completion,
      metadata: {
        feature: 'grading-evaluation',
        kind:
          purpose === 'grading'
            ? 'benchmark-grading-attempt'
            : 'benchmark-criterion-evaluator',
        assignmentTypeId: STATIC_THESIS_GRADING_ASSISTANT_ID,
        benchmarkCaseId,
        ...(criterionId ? { criterionId } : {}),
      },
      attribution: {
        organizationId: '',
        membershipId: '',
        route: 'routes/api.domain.grading-assistant-benchmark',
        requestId: crypto.randomUUID(),
        ipHash: computeIpHash(request),
      },
    });
  };

  try {
    if (input.intent === 'runCase' && benchmarkCase) {
      const { buildStaticThesisGradingConfig } =
        await import('~/domain/ai-evaluation/grading-assistant-benchmark-run.server');
      const caseResult = await runLiveGradingAssistantBenchmarkCase({
        suite: gradingAssistantBenchmarkV1,
        benchmarkCase,
        gradingConfig: buildStaticThesisGradingConfig(),
        execute,
      });

      return dataResponse({ success: true, caseResult });
    }

    const result = await runLiveGradingAssistantBenchmark({
      suite: gradingAssistantBenchmarkV1,
      execute,
    });

    return dataResponse({ success: true, result });
  } catch (error) {
    return dataResponse(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'The benchmark could not run.',
      },
      { status: 500 }
    );
  }
}
