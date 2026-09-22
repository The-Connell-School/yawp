import { describe, expect, test } from 'bun:test';
import { gradingAssistantBenchmarkV1 } from './grading-assistant-benchmark.v1';

describe('grading assistant benchmark v1 corpus', () => {
  test('starts with a broad, uniquely identified synthetic case inventory', () => {
    const ids = gradingAssistantBenchmarkV1.cases.map((item) => item.id);

    expect(gradingAssistantBenchmarkV1.cases.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      gradingAssistantBenchmarkV1.cases.every(
        (item) => item.input.essayText.trim().length >= 80
      )
    ).toBe(true);
    expect(
      gradingAssistantBenchmarkV1.cases.every(
        (item) => item.provenance.kind === 'synthetic'
      )
    ).toBe(true);
  });

  test('defines a score band for every rubric category in every case', () => {
    const expectedKeys = [
      ...gradingAssistantBenchmarkV1.rubric.categoryKeys,
    ].sort();

    for (const benchmarkCase of gradingAssistantBenchmarkV1.cases) {
      expect(Object.keys(benchmarkCase.expectations.scoreBands).sort()).toEqual(
        expectedKeys
      );
      for (const band of Object.values(benchmarkCase.expectations.scoreBands)) {
        expect(band.min).toBeGreaterThanOrEqual(
          gradingAssistantBenchmarkV1.rubric.minScore
        );
        expect(band.max).toBeLessThanOrEqual(
          gradingAssistantBenchmarkV1.rubric.maxScore
        );
        expect(band.min).toBeLessThanOrEqual(band.max);
      }
    }
  });

  test('keeps initial cases in draft until product and educator review them', () => {
    for (const benchmarkCase of gradingAssistantBenchmarkV1.cases) {
      expect(benchmarkCase.approval.status).toBe('draft');
      expect(benchmarkCase.approval.requiredRoles).toEqual([
        'product',
        'educator',
      ]);
      expect(benchmarkCase.approval.approvals).toEqual([]);
    }
  });

  test('covers every qualitative evaluation with at least one concrete criterion', () => {
    const qualitativeEvaluationIds = gradingAssistantBenchmarkV1.evaluations
      .filter((evaluation) => evaluation.method !== 'code')
      .map((evaluation) => evaluation.id);
    const covered = new Set(
      gradingAssistantBenchmarkV1.cases.flatMap((benchmarkCase) =>
        benchmarkCase.expectations.qualitative.map(
          (criterion) => criterion.evaluatorId
        )
      )
    );

    for (const evaluationId of qualitativeEvaluationIds) {
      expect(covered.has(evaluationId)).toBe(true);
    }

    for (const benchmarkCase of gradingAssistantBenchmarkV1.cases) {
      expect(benchmarkCase.expectations.qualitative.length).toBeGreaterThan(0);
      for (const criterion of benchmarkCase.expectations.qualitative) {
        expect(qualitativeEvaluationIds).toContain(criterion.evaluatorId);
        expect(criterion.requirement.trim().length).toBeGreaterThan(20);
      }
    }
  });

  test('includes the same essay at all three strictness levels', () => {
    const strictnessCases = gradingAssistantBenchmarkV1.cases.filter(
      (benchmarkCase) =>
        benchmarkCase.comparisonGroupId === 'balanced-essay-strictness'
    );

    expect(strictnessCases.map((item) => item.input.strictness).sort()).toEqual(
      ['advanced', 'beginner', 'intermediate']
    );
    expect(
      new Set(strictnessCases.map((item) => item.input.essayText)).size
    ).toBe(1);
  });
});
