/**
 * Runs the Daily Pages tutor evaluation live: asks the tutor for a reply to
 * each case exactly as the tutor route would, checks every reply by code and
 * by an LLM judge, and prints each phase with the tutor's actual words.
 *
 *   bun scripts/run-daily-pages-tutor-evaluation.ts
 *   bun scripts/run-daily-pages-tutor-evaluation.ts --case analyze-no-claim
 *   bun scripts/run-daily-pages-tutor-evaluation.ts --repeat 3
 *
 * Needs the same model credentials the app uses (AI_MODEL selects the model).
 * Makes real model calls; the only writes are the usual LLM call logs. Exits
 * non-zero when any run fails, so it can gate a change to the tutor's
 * instructions.
 */
import { dailyPagesTutorEvaluationV1 } from '../app/domain/ai-evaluation/daily-pages-tutor-evaluation.v1';
import {
  formatTutorEvaluationReport,
  runDailyPagesTutorEvaluation,
} from '../app/domain/ai-evaluation/daily-pages-tutor-evaluation.server';
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
  const repeat = Number(argValues('--repeat')[0] ?? 1) || 1;

  const result = await runDailyPagesTutorEvaluation({
    suite: dailyPagesTutorEvaluationV1,
    caseIds: caseIds.length ? caseIds : undefined,
    repeat,
    execute: ({ purpose, caseId, criterionId, messages, ...completion }) =>
      getLLMCompletion({
        model: model as any,
        messages: messages as any,
        ...completion,
        metadata: {
          feature: purpose === 'tutor' ? 'tutor' : 'grading-evaluation',
          kind:
            purpose === 'tutor'
              ? 'tutor-evaluation-reply'
              : 'tutor-evaluation-judge',
          tutorEvaluationCaseId: caseId,
          ...(criterionId ? { criterionId } : {}),
        },
      }),
  });

  console.log(formatTutorEvaluationReport(dailyPagesTutorEvaluationV1, result));
  process.exit(result.status === 'fail' ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
