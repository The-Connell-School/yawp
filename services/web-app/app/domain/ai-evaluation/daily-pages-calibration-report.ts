import { DAILY_PAGES_SHORT_FORM_RUBRIC } from '~/domain/assignment-types/daily-pages-short-form-rubric';

import type {
  GradingBenchmarkResult,
  GradingBenchmarkSuite,
} from './grading-benchmark';

/**
 * A plain-text report of a calibration run, written for the question being
 * tuned: is the grader too lenient or too strict, and where. Each score
 * outside its band is named with the band it missed and the direction.
 */
export function formatCalibrationReport(
  suite: GradingBenchmarkSuite,
  result: GradingBenchmarkResult
): string {
  const weights = new Map(
    DAILY_PAGES_SHORT_FORM_RUBRIC.categories.map((category) => [
      category.key,
      category.weight,
    ])
  );
  const lines: string[] = [`${suite.title} — ${result.status.toUpperCase()}`];
  let lenient = 0;
  let strict = 0;

  for (const caseResult of result.cases) {
    const benchmarkCase = suite.cases.find(
      (item) => item.id === caseResult.caseId
    );
    if (!benchmarkCase || !caseResult.output) {
      const reason =
        caseResult.evaluations.find((item) => item.status !== 'pass')
          ?.message ?? '';
      lines.push(`${caseResult.caseId}: no output ${reason}`.trimEnd());
      continue;
    }

    const composite = Math.round(
      caseResult.output.categories.reduce(
        (sum, category) =>
          sum +
          (category.score / suite.rubric.maxScore) *
            (weights.get(category.key) ?? 0),
        0
      ) * 100
    );
    const misses: string[] = [];
    for (const category of caseResult.output.categories) {
      const band = benchmarkCase.expectations.scoreBands[category.key];
      if (!band) continue;
      if (category.score > band.max) {
        lenient += 1;
        misses.push(
          `${category.key} ${category.score} (band ${band.min}–${band.max}, lenient)`
        );
      } else if (category.score < band.min) {
        strict += 1;
        misses.push(
          `${category.key} ${category.score} (band ${band.min}–${band.max}, strict)`
        );
      }
    }
    lines.push(
      `${caseResult.status === 'pass' ? 'PASS' : 'FAIL'} ${caseResult.caseId} ${composite}%`
    );
    for (const miss of misses) lines.push(`    ${miss}`);
  }

  lines.push('', `Lenient scores: ${lenient}`, `Strict scores: ${strict}`);
  return lines.join('\n');
}
