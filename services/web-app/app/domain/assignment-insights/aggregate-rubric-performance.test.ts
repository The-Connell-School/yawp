import { describe, expect, test } from 'bun:test';
import {
  aggregateRubricPerformance,
  type GradedSubmissionInput,
} from './aggregate-rubric-performance';

function submission(
  id: string,
  scores: Record<string, { score: number; comment?: string }>
): GradedSubmissionInput {
  const rubricScores: Record<string, { score: number; comment: string }> = {};
  for (const [key, value] of Object.entries(scores)) {
    rubricScores[key] = { score: value.score, comment: value.comment ?? '' };
  }
  return { submissionId: id, rubricScores };
}

describe('aggregateRubricPerformance', () => {
  test('computes per-category average, counts, and distribution', () => {
    const result = aggregateRubricPerformance([
      submission('a', {
        thesis_and_content: { score: 5 },
        evidence_and_support: { score: 2 },
      }),
      submission('b', {
        thesis_and_content: { score: 4 },
        evidence_and_support: { score: 1 },
      }),
      submission('c', {
        thesis_and_content: { score: 5 },
        evidence_and_support: { score: 3 },
      }),
    ]);

    expect(result.submissionCount).toBe(3);

    const thesis = result.categories.find(
      (c) => c.key === 'thesis_and_content'
    )!;
    expect(thesis.scoredCount).toBe(3);
    expect(thesis.averageScore).toBeCloseTo(4.67, 1);
    expect(thesis.highCount).toBe(3); // scores >= 4
    expect(thesis.lowCount).toBe(0); // scores <= 2
    expect(thesis.distribution[5]).toBe(2);
    expect(thesis.distribution[4]).toBe(1);

    const evidence = result.categories.find(
      (c) => c.key === 'evidence_and_support'
    )!;
    expect(evidence.averageScore).toBeCloseTo(2, 5);
    expect(evidence.lowCount).toBe(2); // scores 2 and 1
    expect(evidence.highCount).toBe(0);
  });

  test('identifies strongest and weakest categories by average', () => {
    const result = aggregateRubricPerformance([
      submission('a', {
        thesis_and_content: { score: 5 },
        evidence_and_support: { score: 2 },
        grammar_and_mechanics: { score: 4 },
      }),
      submission('b', {
        thesis_and_content: { score: 5 },
        evidence_and_support: { score: 1 },
        grammar_and_mechanics: { score: 4 },
      }),
    ]);

    expect(result.strongest).toBe('thesis_and_content');
    expect(result.weakest).toBe('evidence_and_support');
  });

  test('returns categories in canonical rubric order with labels and weights', () => {
    const result = aggregateRubricPerformance([
      submission('a', { thesis_and_content: { score: 3 } }),
    ]);

    expect(result.categories.map((c) => c.key)).toEqual([
      'thesis_and_content',
      'organization_and_structure',
      'evidence_and_support',
      'voice_and_style',
      'grammar_and_mechanics',
    ]);
    const thesis = result.categories[0];
    expect(thesis.label).toBe('Thesis/Content');
    expect(thesis.weight).toBeCloseTo(0.25, 5);
  });

  test('ignores submissions with null or missing rubric scores for a category', () => {
    const result = aggregateRubricPerformance([
      submission('a', { thesis_and_content: { score: 4 } }),
      { submissionId: 'b', rubricScores: null },
      submission('c', { evidence_and_support: { score: 2 } }),
    ]);

    const thesis = result.categories.find(
      (c) => c.key === 'thesis_and_content'
    )!;
    expect(thesis.scoredCount).toBe(1);
    expect(thesis.averageScore).toBe(4);
  });

  test('collects sample comments per category, capped and non-empty', () => {
    const result = aggregateRubricPerformance(
      Array.from({ length: 10 }, (_, i) =>
        submission(`s${i}`, {
          evidence_and_support: {
            score: 2,
            comment: i % 2 === 0 ? `weak evidence ${i}` : '',
          },
        })
      )
    );

    const evidence = result.categories.find(
      (c) => c.key === 'evidence_and_support'
    )!;
    expect(evidence.sampleComments.length).toBeGreaterThan(0);
    expect(evidence.sampleComments.length).toBeLessThanOrEqual(5);
    // only non-empty comments are collected
    expect(evidence.sampleComments.every((c) => c.trim().length > 0)).toBe(true);
  });

  test('handles empty input', () => {
    const result = aggregateRubricPerformance([]);
    expect(result.submissionCount).toBe(0);
    expect(result.strongest).toBeNull();
    expect(result.weakest).toBeNull();
    for (const category of result.categories) {
      expect(category.scoredCount).toBe(0);
      expect(category.averageScore).toBeNull();
    }
  });

  test('tolerates non-numeric or out-of-range scores', () => {
    const result = aggregateRubricPerformance([
      submission('a', { thesis_and_content: { score: 4 } }),
      {
        submissionId: 'b',
        rubricScores: {
          thesis_and_content: { score: Number.NaN as unknown as number },
        },
      },
    ]);
    const thesis = result.categories.find(
      (c) => c.key === 'thesis_and_content'
    )!;
    expect(thesis.scoredCount).toBe(1);
    expect(thesis.averageScore).toBe(4);
  });
});
