import { describe, expect, test } from 'bun:test';
import {
  aggregateRubricPerformance,
  type GradedSubmissionInput,
} from './aggregate-rubric-performance';
import type { InsightRubric } from './insight-rubric';

const GBA_RUBRIC: InsightRubric = {
  categories: [
    { key: 'budget', label: 'Budget', weight: 0.5, minScore: 0, maxScore: 100 },
    {
      key: 'recommendation',
      label: 'Recommendation',
      weight: 0.5,
      minScore: 0,
      maxScore: 100,
    },
  ],
};


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

  test('handles the legacy flat-number rubricScores shape', () => {
    // Older/seeded submissions store scores as { key: number } rather than
    // { key: { score, comment } }. Both must aggregate.
    const result = aggregateRubricPerformance([
      {
        submissionId: 'legacy',
        rubricScores: {
          thesis_and_content: 5,
          evidence_and_support: 2,
        } as unknown as GradedSubmissionInput['rubricScores'],
      },
      submission('nested', {
        thesis_and_content: { score: 3 },
        evidence_and_support: { score: 2 },
      }),
    ]);

    const thesis = result.categories.find(
      (c) => c.key === 'thesis_and_content'
    )!;
    expect(thesis.scoredCount).toBe(2);
    expect(thesis.averageScore).toBe(4);

    const evidence = result.categories.find(
      (c) => c.key === 'evidence_and_support'
    )!;
    expect(evidence.scoredCount).toBe(2);
    expect(evidence.averageScore).toBe(2);
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

  test('aggregates against the assignment rubric categories when provided', () => {
    const result = aggregateRubricPerformance(
      [
        submission('a', {
          conventions: { score: 2 },
          development: { score: 4 },
        }),
        submission('b', {
          conventions: { score: 3 },
          development: { score: 5 },
        }),
      ],
      {
        // Arrived from `main` as a bare category list. Same assertion, same
        // scale — the range is explicit now because a rubric carries one.
        categories: [
          {
            key: 'conventions',
            label: 'Conventions',
            weight: 0.5,
            minScore: 1,
            maxScore: 5,
          },
          {
            key: 'development',
            label: 'Development',
            weight: 0.5,
            minScore: 1,
            maxScore: 5,
          },
        ],
      }
    );

    expect(result.categories.map((category) => category.key)).toEqual([
      'conventions',
      'development',
    ]);
    expect(result.weakest).toBe('conventions');
    expect(result.strongest).toBe('development');
  });
});

describe('aggregating against an assignment type’s own rubric', () => {
  test('scores the categories the class was actually graded on', () => {
    // Before this the aggregate walked the five default categories no matter
    // what, so a GBA brief scored on `budget` reported every category as unscored
    // — a summary of nothing, indistinguishable from an ungraded class.
    const aggregate = aggregateRubricPerformance(
      [
        { submissionId: 's1', rubricScores: { budget: { score: 88 }, recommendation: { score: 40 } } },
        { submissionId: 's2', rubricScores: { budget: { score: 92 }, recommendation: { score: 20 } } },
      ],
      GBA_RUBRIC
    );

    expect(aggregate.categories.map((c) => c.key)).toEqual([
      'budget',
      'recommendation',
    ]);
    expect(aggregate.categories[0]!.averageScore).toBe(90);
    expect(aggregate.categories[0]!.scoredCount).toBe(2);
    expect(aggregate.strongest).toBe('budget');
    expect(aggregate.weakest).toBe('recommendation');
  });

  test('strong and struggling are read against the category’s own range', () => {
    // 88/100 is strong and 20/100 is struggling for the same reason 4/5 and 2/5
    // are: where they sit in the range, not their raw size.
    const aggregate = aggregateRubricPerformance(
      [
        { submissionId: 's1', rubricScores: { budget: { score: 88 }, recommendation: { score: 20 } } },
      ],
      GBA_RUBRIC
    );

    expect(aggregate.categories[0]!.highCount).toBe(1);
    expect(aggregate.categories[0]!.lowCount).toBe(0);
    expect(aggregate.categories[1]!.highCount).toBe(0);
    expect(aggregate.categories[1]!.lowCount).toBe(1);
  });

  test('the histogram spreads a hundred-point score across the five bands', () => {
    const aggregate = aggregateRubricPerformance(
      [
        { submissionId: 's1', rubricScores: { budget: { score: 0 } } },
        { submissionId: 's2', rubricScores: { budget: { score: 50 } } },
        { submissionId: 's3', rubricScores: { budget: { score: 100 } } },
      ],
      GBA_RUBRIC
    );

    expect(aggregate.categories[0]!.distribution).toEqual({
      1: 1,
      2: 0,
      3: 1,
      4: 0,
      5: 1,
    });
  });
});
