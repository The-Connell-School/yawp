/**
 * Runs the Daily Pages calibration suite live against the built-in Daily Pages
 * grading assistant and prints where it drifts — lenient or strict — per case
 * and category.
 *
 *   bun scripts/run-daily-pages-calibration.ts
 *   bun scripts/run-daily-pages-calibration.ts --case dp-effort-only-retelling
 *
 * Needs the same model credentials the app uses (AI_MODEL selects the model).
 * Makes real model calls and writes nothing. Exits non-zero when any case
 * fails, so it can gate a rubric change.
 */
import {
  buildStaticDailyPagesGradingConfig,
  runLiveGradingAssistantBenchmark,
  STATIC_DAILY_PAGES_GRADING_ASSISTANT_ID,
} from '../app/domain/ai-evaluation/grading-assistant-benchmark-run.server';
import { dailyPagesCalibrationV1 } from '../app/domain/ai-evaluation/daily-pages-calibration.v1';
import { formatCalibrationReport } from '../app/domain/ai-evaluation/daily-pages-calibration-report';
import { getLLMCompletion } from '../app/utils/getLLMCompletion';

function argValues(flag: string) {
  const values: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  });
  return values;
}

async function main() {
  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  const caseIds = argValues('--case');

  const result = await runLiveGradingAssistantBenchmark({
    suite: dailyPagesCalibrationV1,
    caseIds: caseIds.length ? caseIds : undefined,
    gradingConfig: buildStaticDailyPagesGradingConfig(),
    execute: ({ purpose, benchmarkCaseId, criterionId, ...completion }) =>
      getLLMCompletion({
        model,
        ...completion,
        metadata: {
          feature: 'grading-evaluation',
          kind:
            purpose === 'grading'
              ? 'benchmark-grading-attempt'
              : 'benchmark-criterion-evaluator',
          assignmentTypeId: STATIC_DAILY_PAGES_GRADING_ASSISTANT_ID,
          benchmarkCaseId,
          ...(criterionId ? { criterionId } : {}),
        },
      }),
  });

  console.log(formatCalibrationReport(dailyPagesCalibrationV1, result));
  process.exit(result.status === 'fail' ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
