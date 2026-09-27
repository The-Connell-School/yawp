import { describe, expect, test } from 'bun:test';

import { formatCalibrationReport } from './daily-pages-calibration-report';
import { dailyPagesCalibrationV1 } from './daily-pages-calibration.v1';
import type { GradingBenchmarkResult } from './grading-benchmark';

const suite = dailyPagesCalibrationV1;
const [first, second] = suite.cases;

function output(scores: number[]) {
  return {
    categories: suite.rubric.categoryKeys.map((key, index) => ({
      key,
      score: scores[index],
      comment: 'x',
    })),
    overallComment: 'x',
  };
}

const result: GradingBenchmarkResult = {
  suiteId: suite.id,
  suiteVersion: suite.version,
  mode: 'draft',
  status: 'fail',
  summary: { total: 2, passed: 1, failed: 1, needsReview: 0, blocked: 0 },
  cases: [
    {
      caseId: first.id,
      status: 'pass',
      output: output([5, 5, 4, 4, 4]),
      evaluations: [],
    },
    {
      caseId: second.id,
      status: 'fail',
      // Grammar at 4 is above this case's 1–2 band: too lenient.
      output: output([3, 3, 2, 2, 4]),
      evaluations: [],
    },
  ],
};

describe('formatCalibrationReport', () => {
  const report = formatCalibrationReport(suite, result);

  test('shows each case with its composite percentage', () => {
    expect(report).toContain(first.id);
    expect(report).toContain(second.id);
    expect(report).toMatch(/\d+%/);
  });

  test('flags a score above its band as lenient, with the band it missed', () => {
    expect(report).toContain('grammar_and_mechanics 4 (band 1–2, lenient)');
  });

  test('sums up drift direction, which is the question being tuned', () => {
    expect(report).toContain('Lenient scores: 1');
    expect(report).toContain('Strict scores: 0');
  });

  test('reports a case with no output as an error rather than skipping it', () => {
    const errored = formatCalibrationReport(suite, {
      ...result,
      cases: [{ caseId: first.id, status: 'fail', evaluations: [] }],
    });
    expect(errored).toContain(`${first.id}: no output`);
  });
});
